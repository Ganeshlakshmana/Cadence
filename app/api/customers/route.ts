import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { customer, customerProfile, quote, strategy } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { calculateGhostRisk } from '@/lib/scoring/ghostRisk';
import { calculateCloseReadiness } from '@/lib/scoring/closeReadiness';

/**
 * GET /api/customers
 * Read-only. Returns all customers with their profile, latest quote,
 * computed ghost risk and close readiness, and latest strategy stage.
 */
export async function GET() {
  try {
    const customers = await db.select().from(customer);

    const enriched = await Promise.all(customers.map(async (cust) => {
      // Load profile
      const [profile] = await db
        .select()
        .from(customerProfile)
        .where(eq(customerProfile.customerId, cust.id))
        .limit(1);

      // Load latest quote
      const [latestQuote] = await db
        .select()
        .from(quote)
        .where(eq(quote.customerId, cust.id))
        .limit(1);

      // Load latest strategy (to determine stage)
      const [latestStrategy] = await db
        .select()
        .from(strategy)
        .where(eq(strategy.customerId, cust.id))
        .limit(1);

      // Compute scores using our scoring libs
      const decisionTimeline = profile?.decisionTimeline ?? 'exploring';
      const archetypeSkeptic = profile?.archetypeSkeptic ?? 0;
      const archetypeInvestor = profile?.archetypeInvestor ?? 0;
      const competitorMentioned = profile?.competitorMentioned ?? false;
      const topObjections = (profile?.statedObjections as string[] | null) ?? [];
      const statedMotivations = (profile?.statedMotivations as string[] | null) ?? [];

      const ghostRisk = calculateGhostRisk({
        decisionTimeline,
        archetypeSkeptic,
        competitorMentioned,
        daysSinceLastTouch: 3,
        touchesWithNoResponse: 0,
        totalTouches: 1,
        hasStatedObjection: topObjections.length > 0,
        objectionAddressed: false,
      });

      const closeReadiness = calculateCloseReadiness({
        decisionTimeline,
        archetypeInvestor,
        inferenceConfidence: profile?.inferenceConfidence ?? 0.7,
        competitorMentioned,
        hasPositiveResponse: false,
        dayOffset: 0,
        micrositeVisited: false,
        roiFramingPreference: 'monthly_savings',
        statedMotivationsCount: statedMotivations.length,
        topObjectionsCount: topObjections.length,
      });

      // Derive pipeline stage
      let stage = 'Discovery';
      if (latestStrategy) {
        if (latestStrategy.status === 'replay_simulated') stage = 'Contracting';
        else if (latestStrategy.status === 'active') stage = 'Validation';
        else stage = 'Proposal';
      }

      // Archetype weights for the pipeline mix bar
      const archetypeWeights = {
        family:          profile?.archetypeFamily ?? 0,
        investor:        profile?.archetypeInvestor ?? 0,
        environmentalist: profile?.archetypeEnvironmentalist ?? 0,
        skeptic:         profile?.archetypeSkeptic ?? 0,
      };

      return {
        id:            cust.id,
        firstName:     cust.firstName,
        lastName:      cust.lastName,
        name:          `${cust.firstName} ${cust.lastName}`,
        city:          cust.city,
        countryCode:   cust.countryCode,
        irradiance:    cust.solarIrradianceKwhM2Year,
        quoteId:       latestQuote?.id ?? null,
        totalPrice:    latestQuote?.totalPrice ?? 0,
        currency:      latestQuote?.currency ?? 'EUR',
        stage,
        strategyId:    latestStrategy?.id ?? null,
        ghostRisk: {
          score:          ghostRisk.score,
          pct:            Math.round(ghostRisk.score * 100),
          recommendation: ghostRisk.recommendation,
        },
        closeReadiness: {
          score:          closeReadiness.score,
          pct:            Math.round(closeReadiness.score * 100),
          recommendation: closeReadiness.recommendation,
        },
        archetypeWeights,
        lastTouchDate: cust.createdAt
          ? new Date(cust.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : '—',
      };
    }));

    return NextResponse.json({ customers: enriched });
  } catch (err) {
    console.error('GET /api/customers error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
