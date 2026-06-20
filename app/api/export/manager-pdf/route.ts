import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { customer, customerProfile, quote, strategy, strategyTouch } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateManagerOnePager } from '@/lib/llm/managerOnePager';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import type { Strategy } from '@/lib/llm/schemas';
import { z } from 'zod';

const ExportBody = z.object({
  strategyId: z.string(),
  installerName: z.string().default('Solar Sales Rep'),
});

export async function POST(req: NextRequest) {
  try {
    const body = ExportBody.parse(await req.json());

    const [strat] = await db.select().from(strategy).where(eq(strategy.id, body.strategyId)).limit(1);
    if (!strat) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });

    const consent = await checkConsent(strat.customerId, 'manager_one_pager');
    assertConsent(consent);

    const [cust] = await db.select().from(customer).where(eq(customer.id, strat.customerId)).limit(1);
    const [profile] = await db.select().from(customerProfile).where(eq(customerProfile.customerId, strat.customerId)).limit(1);
    const [q] = await db.select().from(quote).where(eq(quote.id, strat.quoteId)).limit(1);
    const touches = await db.select().from(strategyTouch).where(eq(strategyTouch.strategyId, body.strategyId));

    const strategyForPager: Strategy = {
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

    const onePager = await generateManagerOnePager({
      customerFirstName: cust?.firstName ?? 'Customer',
      customerLastName: cust?.lastName ?? '',
      totalPrice: q?.totalPrice ?? 0,
      currency: q?.currency ?? 'EUR',
      archetypeBlend: {
        family: profile?.archetypeFamily ?? 0,
        investor: profile?.archetypeInvestor ?? 0,
        environmentalist: profile?.archetypeEnvironmentalist ?? 0,
        skeptic: profile?.archetypeSkeptic ?? 0,
      },
      strategy: strategyForPager,
      ghostRiskScore: strat.ghostRiskScore ?? 0,
      closeReadinessScore: strat.closeReadinessScore ?? 0,
      installerName: body.installerName,
    });

    await audit.managerPdfExported(strat.customerId, body.strategyId);

    // Return the content JSON — frontend ManagerOnePagerPdf.tsx renders the actual PDF
    return NextResponse.json({
      strategyId: body.strategyId,
      generatedAt: new Date().toISOString(),
      installerName: body.installerName,
      customer: {
        firstName: cust?.firstName,
        lastName: cust?.lastName,
        city: cust?.city,
        countryCode: cust?.countryCode,
      },
      quote: {
        totalPrice: q?.totalPrice,
        currency: q?.currency,
        paybackPeriodYears: q?.paybackPeriodYears,
        annualRoiPct: q?.annualRoiPct,
      },
      archetypeBlend: {
        family: profile?.archetypeFamily ?? 0,
        investor: profile?.archetypeInvestor ?? 0,
        environmentalist: profile?.archetypeEnvironmentalist ?? 0,
        skeptic: profile?.archetypeSkeptic ?? 0,
      },
      scores: {
        ghostRisk: strat.ghostRiskScore,
        closeReadiness: strat.closeReadinessScore,
      },
      onePager,
      touchSummary: touches.map(t => ({
        dayOffset: t.dayOffset,
        channel: t.channel,
        objective: t.objective,
      })),
    });
  } catch (err) {
    console.error('Manager PDF export error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
