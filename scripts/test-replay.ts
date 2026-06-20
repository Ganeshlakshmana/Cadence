/**
 * CLI test: generate a strategy for Maria Müller → persist to DB →
 * run replay simulation → persist simulated responses → print full journey.
 *
 * Usage: npm run test:replay
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });

import { db } from '../db/client';
import {
  customer as customerTable,
  customerProfile as customerProfileTable,
  quote as quoteTable,
  strategy as strategyTable,
  strategyTouch as strategyTouchTable,
  simulatedResponse as simulatedResponseTable,
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateSequence } from '../lib/llm/sequenceGenerator';
import { simulateReplay } from '../lib/llm/replaySimulator';
import { getMarketContext } from '../lib/persuasion/marketContext';
import type { Strategy } from '../lib/llm/schemas';

const CUSTOMER_ID = 'cust_maria_mueller';

function jsonArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

const SENTIMENT_ICON: Record<string, string> = {
  positive: '✅',
  neutral: '➖',
  negative: '❌',
  objection: '⚠️',
  ready_to_buy: '🎯',
};

async function main() {
  console.log('=== SunPath Replay Simulation Test ===\n');

  // ── Load fixture data ─────────────────────────────────────────────────────
  const [cust] = await db.select().from(customerTable).where(eq(customerTable.id, CUSTOMER_ID)).limit(1);
  if (!cust) throw new Error('Maria Müller not found — run: npm run db:seed');

  const [profile] = await db.select().from(customerProfileTable)
    .where(eq(customerProfileTable.customerId, CUSTOMER_ID)).limit(1);
  if (!profile) throw new Error('No profile found for Maria Müller');

  const [q] = await db.select().from(quoteTable).where(eq(quoteTable.customerId, CUSTOMER_ID)).limit(1);
  if (!q) throw new Error('No quote found for Maria Müller');

  const archetypeBlend = {
    family: profile.archetypeFamily ?? 0,
    investor: profile.archetypeInvestor ?? 0,
    environmentalist: profile.archetypeEnvironmentalist ?? 0,
    skeptic: profile.archetypeSkeptic ?? 0,
  };
  const topObjections = jsonArr(profile.statedObjections);
  const verbatimPhrases = jsonArr(profile.customerVerbatimPhrases);
  const statedMotivations = jsonArr(profile.statedMotivations);

  console.log(`Customer: ${cust.firstName} ${cust.lastName}`);
  console.log(`Archetype: ${Math.round(archetypeBlend.family * 100)}% Family / ${Math.round(archetypeBlend.investor * 100)}% Investor / ${Math.round(archetypeBlend.environmentalist * 100)}% Environmentalist / ${Math.round(archetypeBlend.skeptic * 100)}% Skeptic`);
  console.log(`Irradiance: ${cust.solarIrradianceKwhM2Year ?? 1115} kWh/m²/yr`);

  // ── Step 1: Generate strategy ─────────────────────────────────────────────
  console.log('\n--- Step 1: Generate strategy ---');
  const marketContextBlock = getMarketContext(cust.countryCode ?? 'DE');

  const generated = await generateSequence({
    firstName: cust.firstName,
    lastName: cust.lastName,
    preferredLanguage: cust.preferredLanguage ?? 'de',
    formalityRegister: cust.formalityRegister ?? 'formal',
    countryCode: cust.countryCode ?? 'DE',
    city: cust.city ?? 'Berlin',
    postalCode: cust.postalCode ?? '10115',
    solarIrradianceKwhM2Year: cust.solarIrradianceKwhM2Year ?? 1115,
    archetypeFamily: archetypeBlend.family,
    archetypeInvestor: archetypeBlend.investor,
    archetypeEnvironmentalist: archetypeBlend.environmentalist,
    archetypeSkeptic: archetypeBlend.skeptic,
    customerVerbatimPhrases: verbatimPhrases,
    statedMotivations,
    topObjections,
    decisionTimeline: profile.decisionTimeline ?? 'this_quarter',
    competitorMentioned: profile.competitorMentioned ?? false,
    competitorNames: jsonArr(profile.competitorNames),
    systemSizeKw: q.systemSizeKw ?? 8.5,
    panelCount: q.panelCount ?? 20,
    currency: q.currency ?? 'EUR',
    totalPrice: q.totalPrice ?? 18400,
    monthlyEquivalentSavings: q.monthlyEquivalentSavings ?? 130,
    paybackPeriodYears: q.paybackPeriodYears ?? 11.8,
    annualRoiPct: q.annualRoiPct ?? 8.5,
    co2OffsetTons25yr: q.co2OffsetTons25yr ?? 47,
    marketContextBlock,
  });

  console.log(`Generated ${generated.touches.length} touches`);

  // ── Step 2: Persist strategy + touches to DB ──────────────────────────────
  console.log('\n--- Step 2: Persist to DB ---');
  const [stratRow] = await db.insert(strategyTable).values({
    customerId: CUSTOMER_ID,
    quoteId: q.id,
    status: 'draft',
    ghostRiskScore: null,
    ghostRiskSignals: [],
    closeReadinessScore: null,
    rationaleSummary: generated.rationaleSummary,
    marketContextApplied: generated.marketContextApplied,
    generatedBy: 'claude-sonnet-4-6',
  }).returning();

  const touchRows = await db.insert(strategyTouchTable).values(
    generated.touches.map(t => ({
      strategyId: stratRow.id,
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
      status: 'pending',
    }))
  ).returning();

  console.log(`Strategy ID: ${stratRow.id}`);
  console.log(`Touches persisted: ${touchRows.length}`);

  // ── Step 3: Simulate replay ───────────────────────────────────────────────
  console.log('\n--- Step 3: Replay simulation ---');

  const strategyForSim: Strategy = {
    rationaleSummary: generated.rationaleSummary,
    marketContextApplied: generated.marketContextApplied,
    touches: generated.touches,
  };

  const simulation = await simulateReplay({
    customerFirstName: cust.firstName,
    preferredLanguage: cust.preferredLanguage ?? 'de',
    formalityRegister: cust.formalityRegister ?? 'formal',
    archetypeBlend,
    topObjections,
    decisionTimeline: profile.decisionTimeline ?? 'this_quarter',
    strategy: strategyForSim,
  });

  // ── Step 4: Persist simulated responses ───────────────────────────────────
  for (const r of simulation.simulatedResponses) {
    const touchRow = touchRows.find(t => t.sequenceIndex === r.touchSequenceIndex);
    if (touchRow) {
      await db.insert(simulatedResponseTable).values({
        strategyTouchId: touchRow.id,
        responseType: r.responseType,
        responseSummary: r.responseSummary,
        responseFullText: r.responseFullText ?? null,
        sentiment: r.sentiment,
        occurredDayOffset: r.occurredDayOffset,
      });
    }
  }

  await db.update(strategyTable)
    .set({ status: 'replay_simulated', updatedAt: new Date() })
    .where(eq(strategyTable.id, stratRow.id));

  // ── Print Maria's simulated journey ───────────────────────────────────────
  console.log('\n=== MARIA\'S SIMULATED JOURNEY ===\n');

  const ignoredCount = simulation.simulatedResponses.filter(r =>
    r.responseType === 'ignored' || r.responseType === 'call_voicemail'
  ).length;
  const ghostRate = (ignoredCount / simulation.simulatedResponses.length * 100).toFixed(0);

  for (const touch of generated.touches) {
    const resp = simulation.simulatedResponses.find(r => r.touchSequenceIndex === touch.sequenceIndex);
    const isCritical = touch.sequenceIndex === simulation.criticalMomentTouchIndex;
    const icon = resp ? SENTIMENT_ICON[resp.sentiment] ?? '?' : '?';
    const criticalFlag = isCritical ? ' ◀ CRITICAL MOMENT' : '';

    console.log(`  Touch ${touch.sequenceIndex} | Day ${touch.dayOffset} | [${touch.channel}]${criticalFlag}`);
    console.log(`    Tone:     ${touch.tone}`);
    console.log(`    Objective: ${touch.objective.slice(0, 70)}`);
    if (resp) {
      console.log(`    Response: ${icon} ${resp.responseType} — ${resp.responseSummary}`);
      if (resp.responseFullText) {
        console.log(`    Reply:    "${resp.responseFullText.slice(0, 120)}"`);
      }
    }
    console.log();
  }

  console.log('=== PREDICTED OUTCOME ===\n');
  console.log(`  Outcome:       ${simulation.predictedOutcome.toUpperCase()}`);
  console.log(`  Probability:   ${(simulation.predictedCloseProbability * 100).toFixed(0)}%`);
  console.log(`  Ghost rate:    ${ghostRate}% of touches ignored/voicemail (target ~40%)`);
  console.log(`\n  Critical moment: Touch ${simulation.criticalMomentTouchIndex}`);
  console.log(`  ${simulation.criticalMomentDescription}`);

  console.log('\n=== TEST COMPLETE ✅ ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\nReplay test failed:', err);
  process.exit(1);
});
