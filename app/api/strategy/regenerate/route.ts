import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { customer, customerProfile, quote, strategy, strategyTouch } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { regenDelta } from '@/lib/llm/deltaRegen';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { z } from 'zod';

const RegenerateBody = z.object({
  strategyId: z.string(),
  instruction: z.string().min(5),
});

export async function POST(req: NextRequest) {
  try {
    const body = RegenerateBody.parse(await req.json());

    const [strat] = await db.select().from(strategy).where(eq(strategy.id, body.strategyId)).limit(1);
    if (!strat) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });

    const consent = await checkConsent(strat.customerId, 'sequence_generation');
    assertConsent(consent);

    // Load existing touches
    const existingTouches = await db
      .select()
      .from(strategyTouch)
      .where(eq(strategyTouch.strategyId, body.strategyId));

    // Build customer context block for the prompt
    const [cust] = await db.select().from(customer).where(eq(customer.id, strat.customerId)).limit(1);
    const [profile] = await db.select().from(customerProfile).where(eq(customerProfile.customerId, strat.customerId)).limit(1);
    const [q] = await db.select().from(quote).where(eq(quote.id, strat.quoteId)).limit(1);

    const customerContextBlock = `Customer: ${cust?.firstName} ${cust?.lastName}
Country: ${cust?.countryCode}, Language: ${cust?.preferredLanguage} (${cust?.formalityRegister})
Archetypes: Family ${profile?.archetypeFamily ?? 0}, Investor ${profile?.archetypeInvestor ?? 0}, Environmentalist ${profile?.archetypeEnvironmentalist ?? 0}, Skeptic ${profile?.archetypeSkeptic ?? 0}
Quote: ${q?.currency ?? 'EUR'}${q?.totalPrice ?? 0} total, ${q?.currency ?? 'EUR'}${q?.monthlyEquivalentSavings ?? 0}/month savings, ${q?.paybackPeriodYears ?? 0}yr payback`;

    const currentStrategy = {
      rationaleSummary: strat.rationaleSummary,
      marketContextApplied: strat.marketContextApplied,
      touches: existingTouches.map(t => ({
        sequenceIndex: t.sequenceIndex,
        dayOffset: t.dayOffset,
        channel: t.channel,
        tone: t.tone,
        objective: t.objective,
        reasoning: t.reasoning,
        contentSubject: t.contentSubject,
        contentBody: t.contentBody,
        contentVariantB: t.contentVariantB,
        abTestActive: t.abTestActive,
      })),
    };

    const delta = await regenDelta({
      currentStrategy,
      installerFreeTextInstruction: body.instruction,
      customerContextBlock,
    });

    // Replace all touches in DB
    await db.delete(strategyTouch).where(eq(strategyTouch.strategyId, body.strategyId));
    await db.insert(strategyTouch).values(
      delta.touches.map(t => ({
        strategyId: body.strategyId,
        sequenceIndex: t.sequenceIndex,
        dayOffset: t.dayOffset,
        channel: t.channel,
        tone: t.tone,
        objective: t.objective,
        reasoning: t.reasoning,
        contentSubject: t.contentSubject ?? null,
        contentBody: t.contentBody,
        contentVariantB: t.contentVariantB ?? null,
        abTestActive: t.abTestActive,
        abCampaignTag: t.abTestActive ? `day${t.dayOffset}_${t.channel}` : null,
        status: 'pending',
      }))
    );

    await audit.strategyRegenerated(strat.customerId, body.strategyId, body.instruction);

    return NextResponse.json({
      strategyId: body.strategyId,
      rationaleSummary: delta.rationaleSummary,
      touches: delta.touches,
      changes: delta.changes,
    });
  } catch (err) {
    console.error('Strategy regeneration error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
