import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { customer, customerProfile, strategy, strategyTouch, simulatedResponse } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { simulateReplay } from '@/lib/llm/replaySimulator';
import { generateCoachingNote } from '@/lib/llm/coachingMode';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import type { Strategy } from '@/lib/llm/schemas';
import { z } from 'zod';

const ReplayBody = z.object({
  strategyId: z.string(),
  includeCoaching: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const body = ReplayBody.parse(await req.json());

    const [strat] = await db.select().from(strategy).where(eq(strategy.id, body.strategyId)).limit(1);
    if (!strat) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });

    const consent = await checkConsent(strat.customerId, 'replay_simulation');
    assertConsent(consent);

    const [cust] = await db.select().from(customer).where(eq(customer.id, strat.customerId)).limit(1);
    const [profile] = await db.select().from(customerProfile).where(eq(customerProfile.customerId, strat.customerId)).limit(1);
    const touches = await db.select().from(strategyTouch).where(eq(strategyTouch.strategyId, body.strategyId));

    const strategyForSimulation: Strategy = {
      rationaleSummary: strat.rationaleSummary ?? '',
      marketContextApplied: strat.marketContextApplied ?? '',
      touches: touches.map(t => ({
        sequenceIndex: t.sequenceIndex,
        dayOffset: t.dayOffset,
        channel: t.channel as Strategy['touches'][number]['channel'],
        tone: t.tone as Strategy['touches'][number]['tone'],
        objective: t.objective ?? '',
        reasoning: t.reasoning,
        contentSubject: t.contentSubject ?? null,
        contentBody: t.contentBody,
        contentVariantB: t.contentVariantB ?? null,
        abTestActive: t.abTestActive ?? false,
      })),
    };

    const simulation = await simulateReplay({
      customerFirstName: cust?.firstName ?? 'Customer',
      preferredLanguage: cust?.preferredLanguage ?? 'de',
      formalityRegister: cust?.formalityRegister ?? 'formal',
      archetypeBlend: {
        family: profile?.archetypeFamily ?? 0,
        investor: profile?.archetypeInvestor ?? 0,
        environmentalist: profile?.archetypeEnvironmentalist ?? 0,
        skeptic: profile?.archetypeSkeptic ?? 0,
      },
      topObjections: (profile?.statedObjections as string[] | null) ?? [],
      decisionTimeline: profile?.decisionTimeline ?? 'exploring',
      strategy: strategyForSimulation,
    });

    // Persist simulated responses
    for (const r of simulation.simulatedResponses) {
      const touch = touches.find(t => t.sequenceIndex === r.touchSequenceIndex);
      if (touch) {
        await db.insert(simulatedResponse).values({
          strategyTouchId: touch.id,
          responseType: r.responseType,
          responseSummary: r.responseSummary,
          responseFullText: r.responseFullText ?? null,
          sentiment: r.sentiment,
          occurredDayOffset: r.occurredDayOffset,
        });
      }
    }

    // Update strategy status
    await db.update(strategy)
      .set({ status: 'replay_simulated', updatedAt: new Date() })
      .where(eq(strategy.id, body.strategyId));

    await audit.replaySimulated(strat.customerId, body.strategyId);

    let coaching = null;
    if (body.includeCoaching) {
      coaching = await generateCoachingNote({
        customerFirstName: cust?.firstName ?? 'Customer',
        archetypeBlend: {
          family: profile?.archetypeFamily ?? 0,
          investor: profile?.archetypeInvestor ?? 0,
          environmentalist: profile?.archetypeEnvironmentalist ?? 0,
          skeptic: profile?.archetypeSkeptic ?? 0,
        },
        replaySimulation: simulation,
      });
    }

    return NextResponse.json({
      strategyId: body.strategyId,
      simulation,
      coaching,
    });
  } catch (err) {
    console.error('Replay simulation error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
