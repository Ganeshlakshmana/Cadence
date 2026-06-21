import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { customer, customerProfile, quote, strategy, strategyTouch } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/customers/[id]
 * Returns a single customer with profile, quote, and latest strategy + touches.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [cust] = await db.select().from(customer).where(eq(customer.id, id)).limit(1);
    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const [profile] = await db
      .select()
      .from(customerProfile)
      .where(eq(customerProfile.customerId, id))
      .limit(1);

    const [latestQuote] = await db
      .select()
      .from(quote)
      .where(eq(quote.customerId, id))
      .limit(1);

    const [latestStrategy] = await db
      .select()
      .from(strategy)
      .where(eq(strategy.customerId, id))
      .limit(1);

    let touches: typeof strategyTouch.$inferSelect[] = [];
    if (latestStrategy) {
      touches = await db
        .select()
        .from(strategyTouch)
        .where(eq(strategyTouch.strategyId, latestStrategy.id))
        .orderBy(strategyTouch.sequenceIndex);
    }

    return NextResponse.json({
      customer: {
        id:              cust.id,
        firstName:       cust.firstName,
        lastName:        cust.lastName,
        city:            cust.city,
        countryCode:     cust.countryCode,
        latitude:        cust.latitude,
        longitude:       cust.longitude,
        irradiance:      cust.solarIrradianceKwhM2Year,
        preferredChannel: cust.preferredChannel,
        preferredLanguage: cust.preferredLanguage,
        formalityRegister: cust.formalityRegister,
        consentDataProcessing: cust.consentDataProcessing,
      },
      profile: profile ? {
        archetypeFamily:          profile.archetypeFamily,
        archetypeInvestor:        profile.archetypeInvestor,
        archetypeEnvironmentalist: profile.archetypeEnvironmentalist,
        archetypeSkeptic:         profile.archetypeSkeptic,
        statedMotivations:        profile.statedMotivations,
        statedObjections:         profile.statedObjections,
        customerVerbatimPhrases:  profile.customerVerbatimPhrases,
        decisionTimeline:         profile.decisionTimeline,
        inferenceConfidence:      profile.inferenceConfidence,
      } : null,
      quote: latestQuote ? {
        id:                     latestQuote.id,
        systemSizeKw:           latestQuote.systemSizeKw,
        panelCount:             latestQuote.panelCount,
        batteryIncluded:        latestQuote.batteryIncluded,
        batteryKwh:             latestQuote.batteryKwh,
        totalPrice:             latestQuote.totalPrice,
        currency:               latestQuote.currency,
        financingType:          latestQuote.financingType,
        estimatedAnnualSavings: latestQuote.estimatedAnnualSavings,
        monthlyEquivalentSavings: latestQuote.monthlyEquivalentSavings,
        paybackPeriodYears:     latestQuote.paybackPeriodYears,
        annualRoiPct:           latestQuote.annualRoiPct,
        co2OffsetTons25yr:      latestQuote.co2OffsetTons25yr,
      } : null,
      strategy: latestStrategy ? {
        id:                latestStrategy.id,
        status:            latestStrategy.status,
        ghostRiskScore:    latestStrategy.ghostRiskScore,
        ghostRiskSignals:  latestStrategy.ghostRiskSignals,
        closeReadinessScore: latestStrategy.closeReadinessScore,
        rationaleSummary:  latestStrategy.rationaleSummary,
        touches: touches.map(t => ({
          id:             t.id,
          sequenceIndex:  t.sequenceIndex,
          dayOffset:      t.dayOffset,
          channel:        t.channel,
          tone:           t.tone,
          objective:      t.objective,
          reasoning:      t.reasoning,
          contentSubject: t.contentSubject,
          contentBody:    t.contentBody,
          abTestActive:   t.abTestActive,
          audioUrl:       t.audioUrl,
        })),
      } : null,
    });
  } catch (err) {
    console.error('GET /api/customers/[id] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
