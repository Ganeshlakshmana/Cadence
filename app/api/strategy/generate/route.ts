import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { customer, customerProfile, quote, strategy, strategyTouch } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { inferPersona } from '@/lib/llm/personaInference';
import { generateSequence } from '@/lib/llm/sequenceGenerator';
import { getMarketContext, getMarketContextKey } from '@/lib/persuasion/marketContext';
import { calculateGhostRisk } from '@/lib/scoring/ghostRisk';
import { calculateCloseReadiness } from '@/lib/scoring/closeReadiness';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { enrichCustomerSolar } from '@/lib/solar/enrichCustomer';
import { z } from 'zod';

const GenerateStrategyBody = z.object({
  customerId: z.string(),
  quoteId: z.string(),
  installerNotes: z.string().min(10),
});

export async function POST(req: NextRequest) {
  try {
    const body = GenerateStrategyBody.parse(await req.json());

    // Consent gate — must run before any PII-touching LLM call
    const consent = await checkConsent(body.customerId, 'sequence_generation');
    assertConsent(consent);

    // Load customer + profile + quote
    const [cust] = await db.select().from(customer).where(eq(customer.id, body.customerId)).limit(1);
    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const [profile] = await db.select().from(customerProfile).where(eq(customerProfile.customerId, body.customerId)).limit(1);
    const [q] = await db.select().from(quote).where(eq(quote.id, body.quoteId)).limit(1);
    if (!q) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

    // Step 1: Infer persona (or use existing if profile has weights)
    let personaWeights = profile
      ? {
          family: profile.archetypeFamily ?? 0,
          investor: profile.archetypeInvestor ?? 0,
          environmentalist: profile.archetypeEnvironmentalist ?? 0,
          skeptic: profile.archetypeSkeptic ?? 0,
        }
      : null;

    let topObjections: string[] = (profile?.statedObjections as string[] | null) ?? [];
    let statedMotivations: string[] = (profile?.statedMotivations as string[] | null) ?? [];
    let verbatimPhrases: string[] = (profile?.customerVerbatimPhrases as string[] | null) ?? [];
    let competitorMentioned = profile?.competitorMentioned ?? false;
    let competitorNames: string[] = (profile?.competitorNames as string[] | null) ?? [];
    let decisionTimeline = profile?.decisionTimeline ?? 'exploring';

    // If no profile data yet, run persona inference
    if (!personaWeights || (personaWeights.family === 0 && personaWeights.investor === 0)) {
      const persona = await inferPersona({
        notes: body.installerNotes,
        systemSizeKw: q.systemSizeKw ?? 8,
        panelCount: q.panelCount ?? 20,
        batteryIncluded: q.batteryIncluded ?? false,
        currency: q.currency ?? 'EUR',
        totalPrice: q.totalPrice ?? 0,
        estimatedAnnualSavings: q.estimatedAnnualSavings ?? 0,
        paybackPeriodYears: q.paybackPeriodYears ?? 0,
        co2OffsetTons25yr: q.co2OffsetTons25yr ?? 0,
      });

      personaWeights = persona.archetypeBlend;
      topObjections = persona.topObjections;
      statedMotivations = persona.statedMotivations;
      verbatimPhrases = persona.customerVerbatimPhrases;
      competitorMentioned = persona.competitorMentioned;
      competitorNames = persona.competitorNames;
      decisionTimeline = persona.decisionTimeline;

      await audit.personaInferred(body.customerId, persona.inferenceConfidence);
    }

    // Step 2: Get market context
    const countryCode = cust.countryCode ?? 'DE';
    const marketContextBlock = getMarketContext(countryCode);
    const marketContextApplied = getMarketContextKey(countryCode);

    // Ensure real PVGIS irradiance is stored before generating
    let solarIrradianceKwhM2Year = cust.solarIrradianceKwhM2Year;
    if (!solarIrradianceKwhM2Year) {
      const enriched = await enrichCustomerSolar(cust);
      solarIrradianceKwhM2Year = enriched.irradiance;
    }

    // Step 3: Generate sequence
    const generated = await generateSequence({
      firstName: cust.firstName,
      lastName: cust.lastName,
      preferredLanguage: cust.preferredLanguage ?? 'de',
      formalityRegister: cust.formalityRegister ?? 'formal',
      countryCode,
      city: cust.city ?? '',
      postalCode: cust.postalCode ?? '',
      solarIrradianceKwhM2Year,
      archetypeFamily: personaWeights.family,
      archetypeInvestor: personaWeights.investor,
      archetypeEnvironmentalist: personaWeights.environmentalist,
      archetypeSkeptic: personaWeights.skeptic,
      customerVerbatimPhrases: verbatimPhrases,
      statedMotivations,
      topObjections,
      decisionTimeline,
      competitorMentioned,
      competitorNames,
      systemSizeKw: q.systemSizeKw ?? 8,
      panelCount: q.panelCount ?? 20,
      currency: q.currency ?? 'EUR',
      totalPrice: q.totalPrice ?? 0,
      monthlyEquivalentSavings: q.monthlyEquivalentSavings ?? 0,
      paybackPeriodYears: q.paybackPeriodYears ?? 0,
      annualRoiPct: q.annualRoiPct ?? 0,
      co2OffsetTons25yr: q.co2OffsetTons25yr ?? 0,
      marketContextBlock,
    });

    // Step 4: Score ghost risk + close readiness
    const ghostRisk = calculateGhostRisk({
      decisionTimeline,
      archetypeSkeptic: personaWeights.skeptic,
      competitorMentioned,
      daysSinceLastTouch: 0,
      touchesWithNoResponse: 0,
      totalTouches: generated.touches.length,
      hasStatedObjection: topObjections.length > 0,
      objectionAddressed: generated.touches.some(t => t.tone === 'objection_handling'),
    });

    const closeReadiness = calculateCloseReadiness({
      decisionTimeline,
      archetypeInvestor: personaWeights.investor,
      inferenceConfidence: profile?.inferenceConfidence ?? 0.7,
      competitorMentioned,
      hasPositiveResponse: false,
      dayOffset: 0,
      micrositeVisited: false,
      roiFramingPreference: 'monthly_savings',
      statedMotivationsCount: statedMotivations.length,
      topObjectionsCount: topObjections.length,
    });

    // Step 5: Persist to DB
    const [newStrategy] = await db.insert(strategy).values({
      customerId: body.customerId,
      quoteId: body.quoteId,
      status: 'draft',
      ghostRiskScore: ghostRisk.score,
      ghostRiskSignals: ghostRisk.signals,
      closeReadinessScore: closeReadiness.score,
      rationaleSummary: generated.rationaleSummary,
      marketContextApplied,
      generatedBy: 'claude-sonnet-4-6',
    }).returning();

    // Insert all touches
    await db.insert(strategyTouch).values(
      generated.touches.map(t => ({
        strategyId: newStrategy.id,
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

    await audit.strategyGenerated(body.customerId, newStrategy.id, 'claude-sonnet-4-6');

    return NextResponse.json({
      strategyId: newStrategy.id,
      rationaleSummary: generated.rationaleSummary,
      marketContextApplied,
      ghostRisk: { score: ghostRisk.score, signals: ghostRisk.signals, recommendation: ghostRisk.recommendation },
      closeReadiness: { score: closeReadiness.score, signals: closeReadiness.signals, recommendation: closeReadiness.recommendation },
      touches: generated.touches,
      personaWeights,
    });
  } catch (err) {
    console.error('Strategy generation error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
