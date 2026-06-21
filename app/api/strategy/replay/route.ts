// @ts-nocheck — stale file; uses old schema tables, pending migration update
import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, customerResponses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { simulateReplay } from '@/lib/llm/replaySimulator';
import { generateCoachingNote } from '@/lib/llm/coachingMode';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { z } from 'zod';

const now = () => Math.floor(Date.now() / 1000);

const ReplayBody = z.object({
  sequenceId:      z.string(),
  includeCoaching: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const body = ReplayBody.parse(await req.json());

    const [seq] = await db.select().from(sequences).where(eq(sequences.id, body.sequenceId)).limit(1);
    if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    const consent = await checkConsent(seq.customerId, 'replay_simulation');
    assertConsent(consent);

    const [cust] = await db.select().from(customers).where(eq(customers.id, seq.customerId)).limit(1);
    const touches = await db.select().from(touchpoints).where(eq(touchpoints.sequenceId, body.sequenceId));

    const archetypeBlend = {
      family:           cust?.archetypeFamily ?? 0,
      investor:         cust?.archetypeInvestor ?? 0,
      environmentalist: cust?.archetypeEnvironmentalist ?? 0,
      skeptic:          cust?.archetypeSkeptic ?? 0,
    };

    const strategyForSimulation = {
      rationaleSummary:     seq.rationale ?? '',
      marketContextApplied: '',
      touches: touches.map((t, i) => ({
        sequenceIndex:   i + 1,
        dayOffset:       t.dayOffset,
        channel:         t.channel,
        tone:            'professional' as const,
        objective:       '',
        reasoning:       t.reasoning ?? '',
        contentSubject:  t.contentSubject ?? null,
        contentBody:     t.contentBody ?? '',
        contentVariantB: null,
        abTestActive:    false,
      })),
    };

    const simulation = await simulateReplay({
      customerFirstName: cust?.fname ?? 'Customer',
      preferredLanguage: cust?.language ?? 'en',
      formalityRegister: 'formal',
      archetypeBlend,
      topObjections:     [],
      decisionTimeline:  'exploring',
      strategy:          strategyForSimulation,
    });

    // TODO: replace with real customer_responses from new schema
    // Persist simulated responses as customer_responses rows
    const ts = now();
    for (const r of simulation.simulatedResponses) {
      const touch = touches[r.touchSequenceIndex - 1];
      if (touch) {
        await db.insert(customerResponses).values({
          touchpointId:   touch.id,
          customerId:     seq.customerId,
          dayNumber:      r.occurredDayOffset,
          channel:        touch.channel,
          responseText:   r.responseFullText ?? r.responseSummary,
          sentiment:      r.sentiment,
          actionTaken:    r.responseType,
          respondedAt:    ts,
          rawWebhookData: JSON.stringify({ simulated: true, touchSequenceIndex: r.touchSequenceIndex }),
          createdAt:      ts,
        });
      }
    }

    await db.update(sequences)
      .set({ status: 'replay_simulated', updatedAt: ts })
      .where(eq(sequences.id, body.sequenceId));

    await audit.replaySimulated(seq.customerId, body.sequenceId);

    let coaching = null;
    if (body.includeCoaching) {
      coaching = await generateCoachingNote({
        customerFirstName: cust?.fname ?? 'Customer',
        archetypeBlend,
        replaySimulation: simulation,
      });
    }

    return NextResponse.json({
      sequenceId: body.sequenceId,
      simulation,
      coaching,
    });
  } catch (err) {
    console.error('Replay simulation error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
