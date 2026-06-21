// @ts-nocheck — DB schema compatibility
import { NextRequest } from 'next/server';
import { db, customers, sequences, touchpoints, customerResponses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { anthropic, SONNET } from '@/lib/llm/client';
import { MANAGER_ONE_PAGER_SYSTEM } from '@/lib/llm/prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const sequenceId   = req.nextUrl.searchParams.get('sequenceId');
  const installerName = req.nextUrl.searchParams.get('installerName') ?? 'Cadence Rep';

  if (!sequenceId) {
    return new Response(sseChunk('gen_error', { message: 'sequenceId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(sseChunk(event, data))); } catch {}
      };

      try {
        // ── Fetch DB data ──────────────────────────────────────────────────
        const [seq] = await db.select().from(sequences).where(eq(sequences.id, sequenceId)).limit(1);
        if (!seq) { send('gen_error', { message: 'Sequence not found' }); controller.close(); return; }

        const consent = await checkConsent(seq.customerId, 'manager_one_pager');
        assertConsent(consent);

        const [cust] = await db.select().from(customers).where(eq(customers.id, seq.customerId)).limit(1);
        const touches = await db.select().from(touchpoints).where(eq(touchpoints.sequenceId, sequenceId));

        // Channel stats
        const statsMap: Record<string, { channel: string; scheduled: number; sent: number; replies: number }> = {};
        for (const t of touches) {
          if (!statsMap[t.channel]) statsMap[t.channel] = { channel: t.channel, scheduled: 0, sent: 0, replies: 0 };
          statsMap[t.channel].scheduled++;
          if (t.status === 'sent') statsMap[t.channel].sent++;
        }
        const allReplies = await db.select().from(customerResponses).where(eq(customerResponses.customerId, seq.customerId));
        for (const r of allReplies) {
          const ch = r.channel ?? 'unknown';
          if (statsMap[ch]) statsMap[ch].replies++;
          else statsMap[ch] = { channel: ch, scheduled: 0, sent: 0, replies: 1 };
        }

        // ── Send metadata immediately (no LLM needed) ──────────────────────
        send('metadata', {
          sequenceId,
          customerId:    seq.customerId,
          generatedAt:   new Date().toISOString(),
          installerName,
          customer:      { firstName: cust?.fname ?? '', lastName: cust?.lname ?? '' },
          priceQuote:    cust?.priceQuote ?? null,
          archetypeBlend: {
            family:           cust?.archetypeFamily ?? 0,
            investor:         cust?.archetypeInvestor ?? 0,
            environmentalist: cust?.archetypeEnvironmentalist ?? 0,
            skeptic:          cust?.archetypeSkeptic ?? 0,
          },
          scores: {
            ghostRisk:      seq.ghostRiskScore ?? 0,
            closeReadiness: seq.closeReadinessScore ?? 0,
          },
          touchSummary:  touches.map(t => ({ dayOffset: t.dayOffset, channel: t.channel, reasoning: t.reasoning })),
          channelStats:  Object.values(statsMap),
        });

        // ── Build prompt ───────────────────────────────────────────────────
        const blend = {
          family:           cust?.archetypeFamily ?? 0,
          investor:         cust?.archetypeInvestor ?? 0,
          environmentalist: cust?.archetypeEnvironmentalist ?? 0,
          skeptic:          cust?.archetypeSkeptic ?? 0,
        };
        const dominant = Object.entries(blend)
          .sort(([, a], [, b]) => b - a).slice(0, 2)
          .map(([k, v]) => `${Math.round(v * 100)}% ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(', ');

        const userPrompt = `DEAL:
Customer: ${cust?.fname ?? ''} ${cust?.lname ?? ''}
Value: EUR${(cust?.priceQuote ?? 0).toLocaleString()}
Archetype: ${dominant}
Ghost risk: ${((seq.ghostRiskScore ?? 0) * 100).toFixed(0)}%
Close readiness: ${((seq.closeReadinessScore ?? 0) * 100).toFixed(0)}%

STRATEGY SUMMARY:
${seq.rationale ?? 'No rationale available.'}

TOUCHPOINTS (${touches.length} total):
${touches.slice(0, 8).map(t => `  Day ${t.dayOffset}: [${t.channel}] ${t.reasoning ?? ''}`).join('\n')}

INSTALLER: ${installerName}

Generate the manager one-pager. dealHeader: "${cust?.fname ?? ''} ${cust?.lname ?? ''} — EUR${(cust?.priceQuote ?? 0).toLocaleString()} — ${dominant}"`;

        const systemPrompt = MANAGER_ONE_PAGER_SYSTEM + `

CRITICAL OUTPUT FORMAT: Return ONLY a raw JSON object — no markdown fences, no preamble, no explanation. Start immediately with { and end with }.
Required keys exactly:
{
  "dealHeader": "one-line tagline",
  "myRead": "2-3 sentences about the customer",
  "myPlan": "outreach plan summary",
  "risksAndMitigations": [{"risk": "...", "mitigation": "..."}],
  "whereIneedHelp": "one specific question for manager",
  "closeTargetDate": "Month YYYY",
  "expectedOutcome": "what you expect"
}`;

        // ── Stream LLM response ────────────────────────────────────────────
        const llmStream = await anthropic.messages.create({
          model:      SONNET,
          max_tokens: 1200,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: userPrompt }],
          stream:     true,
        });

        let fullText = '';
        for await (const event of llmStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            send('delta', { text: event.delta.text });
          }
        }

        // ── Parse and finalise ─────────────────────────────────────────────
        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : fullText);
          send('complete', { onePager: parsed });
        } catch {
          send('gen_error', { message: 'Failed to parse generated content. Please try again.' });
        }

        await audit.managerPdfExported(seq.customerId, sequenceId);
      } catch (err) {
        send('gen_error', { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
