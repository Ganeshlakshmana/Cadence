import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, callRecords, aiFollowups, auditLog } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { anthropic, SONNET } from '@/lib/llm/client';
import { verifyWebhookSignature, getCallTranscript } from '@/lib/voice-agent/elevenLabsAgent';

const now = () => Math.floor(Date.now() / 1000);

type FinalDecision = 'accepted' | 'declined' | 'callback_requested' | 'no_answer';

interface CallAnalysis {
  final_decision: FinalDecision;
  final_quote:    string | null;
  attempts_made:  number;
  summary:        string;
}

async function analyzeTranscript(transcript: string): Promise<CallAnalysis> {
  const defaults: CallAnalysis = {
    final_decision: 'no_answer',
    final_quote:    null,
    attempts_made:  0,
    summary:        '(no transcript captured)',
  };

  if (!transcript) return defaults;

  const res = await anthropic.messages.create({
    model:      SONNET,
    max_tokens: 512,
    system:     'Extract structured data from this sales call transcript.',
    messages: [{
      role:    'user',
      content:
        `Transcript: ${transcript.slice(0, 8000)}\n\n` +
        'Return JSON only:\n' +
        '{\n' +
        '  "final_decision": "accepted" | "declined" | "callback_requested" | "no_answer",\n' +
        '  "final_quote": "exact price and terms quoted at close, or null",\n' +
        '  "attempts_made": number 0-3,\n' +
        '  "summary": "2-3 sentence summary of what happened"\n' +
        '}',
    }],
  });

  const text = res.content.find(b => b.type === 'text')?.text ?? '';
  try {
    const json   = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const parsed = JSON.parse(json) as Partial<CallAnalysis>;
    return {
      final_decision: parsed.final_decision ?? defaults.final_decision,
      final_quote:    parsed.final_quote    ?? null,
      attempts_made:  typeof parsed.attempts_made === 'number' ? parsed.attempts_made : 0,
      summary:        parsed.summary        ?? defaults.summary,
    };
  } catch {
    return defaults;
  }
}

// POST /api/channels/call/webhook
// ElevenLabs calls this when each call ends (post_call_transcription event).
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // ── Signature verification ───────────────────────────────────────────────────
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET ?? '';
  if (secret) {
    const sig = req.headers.get('ElevenLabs-Signature') ?? req.headers.get('elevenlabs-signature') ?? '';
    if (!verifyWebhookSignature(rawBody, sig, secret)) {
      console.warn('Call webhook: invalid signature');
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    // Only process post-call events
    const eventType = (payload['type'] as string) ?? '';
    if (eventType && eventType !== 'post_call_transcription') {
      return NextResponse.json({ ok: true });
    }

    // ── Extract IDs and metadata ─────────────────────────────────────────────
    const data = (payload['data'] as Record<string, unknown>) ?? payload;

    const conversationId: string = String(
      data['conversation_id'] ?? payload['conversation_id'] ?? '',
    );

    const phoneCallMeta = (data['metadata'] as Record<string, Record<string, unknown>>)?.['phone_call'];
    const callSid: string = String(
      phoneCallMeta?.['call_sid'] ?? data['call_sid'] ?? payload['call_sid'] ?? '',
    );
    const customerPhone: string = String(
      phoneCallMeta?.['from'] ?? data['customer_number'] ?? payload['customer_number'] ?? '',
    );
    const durationSecs: number = Number(
      data['call_duration_secs'] ?? data['duration_seconds'] ?? 0,
    );

    if (!conversationId) {
      console.warn('Call webhook: no conversation_id in payload');
      return NextResponse.json({ ok: true });
    }

    // ── Fetch transcript ─────────────────────────────────────────────────────
    let transcript = '';
    try {
      transcript = await getCallTranscript(conversationId);
    } catch {
      const rawTr = data['transcript'];
      if (Array.isArray(rawTr)) {
        transcript = (rawTr as Array<{ role: string; message: string }>)
          .map(t => `${t.role === 'agent' ? 'ADVISOR' : 'CUSTOMER'}: ${t.message}`)
          .join('\n\n');
      }
    }

    // ── Find call_records entry by conversationId ────────────────────────────
    const [record] = await db
      .select()
      .from(callRecords)
      .where(eq(callRecords.conversationId, conversationId))
      .limit(1);

    // ── Find customer ────────────────────────────────────────────────────────
    const [cust] = record?.customerId
      ? await db.select().from(customers).where(eq(customers.id, record.customerId)).limit(1)
      : customerPhone
        ? await db.select().from(customers).where(eq(customers.phone, customerPhone)).limit(1)
        : [];

    if (!cust) {
      console.warn('Call webhook: customer not found for conversationId', conversationId);
      return NextResponse.json({ ok: true });
    }

    // ── Claude analysis ───────────────────────────────────────────────────────
    const analysis = await analyzeTranscript(transcript);

    const ts = now();

    // ── Insert / update call_records ─────────────────────────────────────────
    if (record) {
      await db
        .update(callRecords)
        .set({
          callSid:         callSid     || record.callSid,
          finalDecision:   analysis.final_decision,
          finalQuote:      analysis.final_quote,
          attemptsMade:    analysis.attempts_made,
          summary:         analysis.summary,
          durationSeconds: durationSecs || null,
          customerNumber:  customerPhone || record.customerNumber,
          rawWebhookData:  JSON.stringify({ conversationId, callSid, eventType }),
        })
        .where(eq(callRecords.id, record.id));
    } else {
      await db.insert(callRecords).values({
        id:              nanoid(),
        customerId:      cust.id,
        callSid,
        conversationId,
        finalDecision:   analysis.final_decision,
        finalQuote:      analysis.final_quote,
        attemptsMade:    analysis.attempts_made,
        summary:         analysis.summary,
        durationSeconds: durationSecs || null,
        customerNumber:  customerPhone,
        timestamp:       ts,
        rawWebhookData:  JSON.stringify({ conversationId, callSid, eventType }),
        createdAt:       ts,
      });
    }

    // ── Outcome actions ───────────────────────────────────────────────────────

    if (analysis.final_decision === 'accepted') {
      await db
        .update(customers)
        .set({ status: 'negotiating', updatedAt: ts })
        .where(eq(customers.id, cust.id));
    }

    if (analysis.final_decision === 'declined' && analysis.attempts_made >= 3) {
      const [seq] = await db
        .select()
        .from(sequences)
        .where(eq(sequences.customerId, cust.id))
        .orderBy(desc(sequences.createdAt))
        .limit(1);

      if (seq) {
        await db
          .update(sequences)
          .set({ ghostRiskScore: Math.min((seq.ghostRiskScore ?? 0) + 0.3, 1.0) })
          .where(eq(sequences.id, seq.id));
      }
    }

    if (analysis.final_decision === 'callback_requested') {
      const [seq] = await db
        .select()
        .from(sequences)
        .where(eq(sequences.customerId, cust.id))
        .orderBy(desc(sequences.createdAt))
        .limit(1);

      if (seq) {
        await db.insert(touchpoints).values({
          id:        nanoid(),
          sequenceId: seq.id,
          customerId: cust.id,
          dayOffset:  (seq.currentDay ?? 0) + 2,
          channel:    'phone_call',
          status:     'pending',
          reasoning:  'Callback requested during AI voice call — auto-scheduled follow-up',
          createdAt:  ts,
        });
      }

      // Flag for human review
      await db.insert(aiFollowups).values({
        id:               nanoid(),
        customerId:       cust.id,
        triggerReason:    'voice_call:callback_requested',
        generatedContent: JSON.stringify({ summary: analysis.summary }),
        channel:          'phone_call',
        status:           'pending_review',
        generatedBy:      'claude-sonnet-4-6',
        generatedAt:      ts,
      });
    }

    await db.insert(auditLog).values({
      actor:      'webhook',
      action:     'voice_call_completed',
      entityType: 'call_record',
      entityId:   record?.id ?? conversationId,
      metadata:   JSON.stringify({
        customerId:      cust.id,
        conversationId,
        finalDecision:   analysis.final_decision,
        attemptsMade:    analysis.attempts_made,
        durationSeconds: durationSecs,
      }),
      createdAt: ts,
    });

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('POST /api/channels/call/webhook', err);
    return NextResponse.json({ ok: true }); // always 200 to prevent ElevenLabs retries
  }
}
