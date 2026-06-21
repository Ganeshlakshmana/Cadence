import { NextRequest, NextResponse } from 'next/server';
import { db, customers, touchpoints, customerResponses, aiFollowups, auditLog } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { fetchNewMessages } from '@/lib/channels/gmail';
import { anthropic, SONNET } from '@/lib/llm/client';
import { unwrapArrayFields } from '@/lib/llm/toolInput';
import { z } from 'zod';

const now = () => Math.floor(Date.now() / 1000);

// ── Claude followup tool (mirrors /api/responses) ─────────────────────────────

const FOLLOWUP_TOOL = {
  name: 'generate_followup',
  description: 'Generate one ideal follow-up message given an inbound customer email reply.',
  input_schema: {
    type: 'object' as const,
    properties: {
      channel: {
        type: 'string',
        enum: ['email', 'sms', 'whatsapp_text', 'phone_call'],
        description: 'Best channel for this follow-up.',
      },
      content_subject: { type: ['string', 'null'], description: 'Subject if email, else null.' },
      content_body:    { type: 'string', description: 'Follow-up message body.' },
      reasoning:       { type: 'string', description: '1-2 sentences: why this angle.' },
    },
    required: ['channel', 'content_subject', 'content_body', 'reasoning'],
  },
};

const FollowupSchema = z.object({
  channel:         z.string(),
  content_subject: z.string().nullable(),
  content_body:    z.string(),
  reasoning:       z.string(),
});

// ── POST /api/channels/gmail/webhook ─────────────────────────────────────────
// Receives Google Cloud Pub/Sub push notifications.
// Payload: { "message": { "data": "<base64 JSON>", "messageId": "..." }, "subscription": "..." }

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();

    // Pub/Sub wraps the real payload in message.data as base64
    const encoded = raw?.message?.data;
    if (!encoded || typeof encoded !== 'string') {
      // Acknowledge malformed Pub/Sub messages silently (returning non-2xx causes retries)
      return NextResponse.json({ ok: true });
    }

    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const parsed  = JSON.parse(decoded) as { emailAddress?: string; historyId?: string | number };

    const historyId = String(parsed.historyId ?? '');
    if (!historyId) {
      return NextResponse.json({ ok: true });
    }

    // ── Fetch new INBOX messages since this historyId ─────────────────────────
    const messages = await fetchNewMessages(historyId);
    const ts = now();

    for (const msg of messages) {
      // Find customer by sender email
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.email, msg.fromEmail))
        .limit(1);

      if (!cust) continue; // Not a known customer; skip

      // Find their most recently sent email touchpoint to link the response to
      const [touch] = await db
        .select()
        .from(touchpoints)
        .where(
          and(
            eq(touchpoints.customerId, cust.id),
            eq(touchpoints.channel, 'email'),
            eq(touchpoints.status, 'sent'),
          ),
        )
        .orderBy(desc(touchpoints.sentAt))
        .limit(1);

      // Insert customer response even if we couldn't match a touchpoint
      const [response] = await db.insert(customerResponses).values({
        touchpointId:    touch?.id ?? null,
        customerId:      cust.id,
        channel:         'email',
        responseText:    msg.bodyText.slice(0, 4000),
        sentiment:       'neutral', // will be assessed by AI followup prompt
        respondedAt:     ts,
        rawWebhookData:  JSON.stringify({ messageId: msg.messageId, threadId: msg.threadId, subject: msg.subject }),
        createdAt:       ts,
      }).returning();

      // ── Generate AI followup ──────────────────────────────────────────────
      try {
        const systemPrompt = `You are a solar sales advisor. A customer just replied to an email.
Generate the ideal next follow-up in the customer's language (${cust.language ?? 'en'}).

Archetype blend:
- Family:           ${((cust.archetypeFamily ?? 0) * 100).toFixed(0)}%
- Investor:         ${((cust.archetypeInvestor ?? 0) * 100).toFixed(0)}%
- Environmentalist: ${((cust.archetypeEnvironmentalist ?? 0) * 100).toFixed(0)}%
- Skeptic:          ${((cust.archetypeSkeptic ?? 0) * 100).toFixed(0)}%

Rules: advance toward close on positive signals; add value on neutral; de-escalate on negative.
Keep body under 150 words. Use the generate_followup tool.`;

        const userPrompt = `INBOUND EMAIL from ${cust.fname} ${cust.lname} <${cust.email}>:
Subject: ${msg.subject}
Body: ${msg.bodyText.slice(0, 1500)}

${touch ? `ORIGINAL OUTREACH (day ${touch.dayOffset}):
Subject: ${touch.contentSubject ?? '(none)'}
Body: ${(touch.contentBody ?? '').slice(0, 800)}` : 'No matched outreach touchpoint.'}

Generate the ideal reply.`;

        const llmRes = await anthropic.messages.create({
          model:       SONNET,
          max_tokens:  1024,
          system:      systemPrompt,
          tools:       [FOLLOWUP_TOOL],
          tool_choice: { type: 'tool', name: 'generate_followup' },
          messages:    [{ role: 'user', content: userPrompt }],
        });

        const block = llmRes.content.find(b => b.type === 'tool_use');
        if (block && block.type === 'tool_use') {
          const inp        = unwrapArrayFields(block.input as Record<string, unknown>, []);
          const followData = FollowupSchema.parse(inp);

          const [followup] = await db.insert(aiFollowups).values({
            responseId:       response.id,
            customerId:       cust.id,
            triggerReason:    'inbound_email_reply',
            generatedContent: JSON.stringify(followData),
            channel:          followData.channel,
            status:           'pending_review',
            generatedBy:      'claude-sonnet-4-6',
            generatedAt:      ts,
          }).returning();

          await db.insert(auditLog).values({
            actor:      'system',
            action:     'followup.generated',
            entityType: 'ai_followup',
            entityId:   followup.id,
            metadata:   JSON.stringify({
              customerId: cust.id,
              trigger:    'inbound_email_reply',
              messageId:  msg.messageId,
            }),
            createdAt: ts,
          });
        }
      } catch (llmErr) {
        // Log but don't fail the webhook — Pub/Sub must get a 200 back
        console.error('Gmail webhook: AI followup generation failed', llmErr);
      }
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('POST /api/channels/gmail/webhook', err);
    // Still return 200 to prevent Pub/Sub from retrying a bad payload indefinitely
    return NextResponse.json({ ok: true });
  }
}
