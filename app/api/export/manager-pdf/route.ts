// @ts-nocheck — stale file; uses old schema tables, pending migration update
import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, customerResponses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateManagerOnePager } from '@/lib/llm/managerOnePager';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { z } from 'zod';

const ExportBody = z.object({
  sequenceId:    z.string(),
  installerName: z.string().default('Solar Sales Rep'),
});

export async function POST(req: NextRequest) {
  try {
    const body = ExportBody.parse(await req.json());

    const [seq] = await db.select().from(sequences).where(eq(sequences.id, body.sequenceId)).limit(1);
    if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    const consent = await checkConsent(seq.customerId, 'manager_one_pager');
    assertConsent(consent);

    const [cust] = await db.select().from(customers).where(eq(customers.id, seq.customerId)).limit(1);
    const touches = await db.select().from(touchpoints).where(eq(touchpoints.sequenceId, body.sequenceId));

    // Map touchpoints to the Strategy shape expected by generateManagerOnePager
    const strategyForPager = {
      rationaleSummary:      seq.rationale ?? '',
      marketContextApplied:  '',
      touches: touches.map((t, i) => ({
        sequenceIndex:   i + 1,
        dayOffset:       t.dayOffset,
        channel:         t.channel as string,
        tone:            'professional' as const,
        objective:       '',
        reasoning:       t.reasoning ?? '',
        contentSubject:  t.contentSubject ?? null,
        contentBody:     t.contentBody ?? '',
        contentVariantB: null,
        abTestActive:    false,
      })),
    };

    const onePager = await generateManagerOnePager({
      customerFirstName:   cust?.fname ?? 'Customer',
      customerLastName:    cust?.lname ?? '',
      totalPrice:          cust?.priceQuote ?? 0,
      currency:            'EUR',
      archetypeBlend: {
        family:           cust?.archetypeFamily ?? 0,
        investor:         cust?.archetypeInvestor ?? 0,
        environmentalist: cust?.archetypeEnvironmentalist ?? 0,
        skeptic:          cust?.archetypeSkeptic ?? 0,
      },
      strategy:            strategyForPager,
      ghostRiskScore:      seq.ghostRiskScore ?? 0,
      closeReadinessScore: seq.closeReadinessScore ?? 0,
      installerName:       body.installerName,
    });

    // ── Channel stats for live status table ──────────────────────────────────
    const statsMap: Record<string, { channel: string; scheduled: number; sent: number; replies: number }> = {};
    for (const t of touches) {
      if (!statsMap[t.channel]) statsMap[t.channel] = { channel: t.channel, scheduled: 0, sent: 0, replies: 0 };
      statsMap[t.channel].scheduled++;
      if (t.status === 'sent') statsMap[t.channel].sent++;
    }

    const allReplies = await db.select().from(customerResponses).where(eq(customerResponses.customerId, seq.customerId));
    const realReplies = allReplies.filter(r => {
      if (!r.rawWebhookData) return true;
      try { return !JSON.parse(r.rawWebhookData).simulated; }
      catch { return true; }
    });
    for (const r of realReplies) {
      const ch = r.channel ?? 'unknown';
      if (statsMap[ch]) statsMap[ch].replies++;
      else statsMap[ch] = { channel: ch, scheduled: 0, sent: 0, replies: 1 };
    }

    await audit.managerPdfExported(seq.customerId, body.sequenceId);

    return NextResponse.json({
      sequenceId:    body.sequenceId,
      customerId:    seq.customerId,
      generatedAt:   new Date().toISOString(),
      installerName: body.installerName,
      customer: {
        firstName: cust?.fname,
        lastName:  cust?.lname,
      },
      priceQuote:    cust?.priceQuote,
      archetypeBlend: {
        family:           cust?.archetypeFamily ?? 0,
        investor:         cust?.archetypeInvestor ?? 0,
        environmentalist: cust?.archetypeEnvironmentalist ?? 0,
        skeptic:          cust?.archetypeSkeptic ?? 0,
      },
      scores: {
        ghostRisk:      seq.ghostRiskScore,
        closeReadiness: seq.closeReadinessScore,
      },
      onePager,
      touchSummary: touches.map(t => ({
        dayOffset: t.dayOffset,
        channel:   t.channel,
        reasoning: t.reasoning,
      })),
      channelStats: Object.values(statsMap),
    });
  } catch (err) {
    console.error('Manager PDF export error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
