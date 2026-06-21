// @ts-nocheck — test script; runs against live DB
/**
 * CLI test: generate a sequence for Maria Müller → persist to DB →
 * run replay simulation → persist simulated responses → print journey.
 *
 * Usage: npm run test:replay
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });

import { db, customers, sequences, touchpoints, customerResponses } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateSequence } from '../lib/llm/sequenceGenerator';
import { simulateReplay } from '../lib/llm/replaySimulator';
import { getMarketContext } from '../lib/persuasion/marketContext';

const MARIA_EMAIL = 'maria.mueller@gmail.com';

const SENTIMENT_ICON: Record<string, string> = {
  positive:     '✅',
  neutral:      '➖',
  negative:     '❌',
  objection:    '⚠️',
  ready_to_buy: '🎯',
};

const now = () => Math.floor(Date.now() / 1000);

async function main() {
  console.log('=== SunPath Replay Simulation Test ===\n');

  const [cust] = await db.select().from(customers).where(eq(customers.email, MARIA_EMAIL)).limit(1);
  if (!cust) throw new Error(`Customer ${MARIA_EMAIL} not found — run: npm run db:seed`);

  console.log(`Customer: ${cust.fname} ${cust.lname}`);
  console.log(`Archetypes: ${Math.round((cust.archetypeFamily ?? 0) * 100)}% Family / ${Math.round((cust.archetypeInvestor ?? 0) * 100)}% Investor / ${Math.round((cust.archetypeEnvironmentalist ?? 0) * 100)}% Environmentalist / ${Math.round((cust.archetypeSkeptic ?? 0) * 100)}% Skeptic`);

  // ── Step 1: Generate sequence ─────────────────────────────────────────────
  console.log('\n--- Step 1: Generate sequence ---');
  const marketContextBlock = getMarketContext('DE');

  const generated = await generateSequence({
    fname:                     cust.fname,
    lname:                     cust.lname,
    language:                  cust.language ?? 'de',
    postalCode:                cust.postalCode,
    priceQuote:                cust.priceQuote ?? 0,
    archetypeFamily:           cust.archetypeFamily ?? 0,
    archetypeInvestor:         cust.archetypeInvestor ?? 0,
    archetypeEnvironmentalist: cust.archetypeEnvironmentalist ?? 0,
    archetypeSkeptic:          cust.archetypeSkeptic ?? 0,
    about:                     cust.about,
    marketContextBlock,
  });

  console.log(`Generated ${generated.touches.length} touches`);

  // ── Step 2: Persist sequence + touches ───────────────────────────────────
  console.log('\n--- Step 2: Persist to DB ---');
  const ts = now();

  const [seqRow] = await db.insert(sequences).values({
    customerId:          cust.id,
    totalDays:           30,
    currentDay:          0,
    status:              'active',
    ghostRiskScore:      generated.ghost_risk_score,
    closeReadinessScore: generated.close_readiness_score,
    rationale:           generated.rationale,
    generatedBy:         'claude-sonnet-4-6',
    createdAt:           ts,
    updatedAt:           ts,
  }).returning();

  const touchRows = await db.insert(touchpoints).values(
    generated.touches.map(t => ({
      sequenceId:      seqRow.id,
      customerId:      cust.id,
      dayOffset:       t.day_offset,
      channel:         t.channel,
      contentSubject:  t.content_subject ?? null,
      contentBody:     t.content_body,
      contentImageUrl: t.content_image_url ?? null,
      reasoning:       t.reasoning,
      abVariant:       t.ab_variant ?? null,
      status:          'pending',
      createdAt:       ts,
    }))
  ).returning();

  console.log(`Sequence ID: ${seqRow.id}`);
  console.log(`Touches persisted: ${touchRows.length}`);

  // ── Step 3: Simulate replay ───────────────────────────────────────────────
  console.log('\n--- Step 3: Replay simulation ---');

  const archetypeBlend = {
    family:           cust.archetypeFamily ?? 0,
    investor:         cust.archetypeInvestor ?? 0,
    environmentalist: cust.archetypeEnvironmentalist ?? 0,
    skeptic:          cust.archetypeSkeptic ?? 0,
  };

  const simulation = await simulateReplay({
    customerFirstName: cust.fname,
    preferredLanguage: cust.language ?? 'de',
    formalityRegister: 'formal',
    archetypeBlend,
    topObjections:     [],
    decisionTimeline:  'this_quarter',
    strategy: {
      rationaleSummary:     generated.rationale,
      marketContextApplied: '',
      touches: generated.touches.map((t, i) => ({
        sequenceIndex:   i + 1,
        dayOffset:       t.day_offset,
        channel:         t.channel,
        tone:            'professional',
        objective:       '',
        reasoning:       t.reasoning,
        contentSubject:  t.content_subject ?? null,
        contentBody:     t.content_body,
        contentVariantB: null,
        abTestActive:    false,
      })),
    },
  });

  // ── Step 4: Persist simulated responses as customer_responses ─────────────
  // TODO: replace with real customer_responses from new schema
  for (const r of simulation.simulatedResponses) {
    const touchRow = touchRows[r.touchSequenceIndex - 1];
    if (touchRow) {
      await db.insert(customerResponses).values({
        touchpointId:   touchRow.id,
        customerId:     cust.id,
        dayNumber:      r.occurredDayOffset,
        channel:        touchRow.channel,
        responseText:   r.responseFullText ?? r.responseSummary,
        sentiment:      r.sentiment,
        actionTaken:    r.responseType,
        respondedAt:    ts,
        rawWebhookData: JSON.stringify({ simulated: true }),
        createdAt:      ts,
      });
    }
  }

  await db.update(sequences)
    .set({ status: 'replay_simulated', updatedAt: ts })
    .where(eq(sequences.id, seqRow.id));

  // ── Print journey ─────────────────────────────────────────────────────────
  console.log(`\n=== ${cust.fname.toUpperCase()}'S SIMULATED JOURNEY ===\n`);

  for (const touch of generated.touches) {
    const resp = simulation.simulatedResponses.find(r => r.touchSequenceIndex === touch.day_offset);
    const icon = resp ? (SENTIMENT_ICON[resp.sentiment] ?? '?') : '?';
    console.log(`  Day ${touch.day_offset} | [${touch.channel}]`);
    if (resp) {
      console.log(`    Response: ${icon} ${resp.responseType} — ${resp.responseSummary}`);
    }
    console.log();
  }

  console.log('=== PREDICTED OUTCOME ===\n');
  console.log(`  Outcome:     ${simulation.predictedOutcome.toUpperCase()}`);
  console.log(`  Probability: ${(simulation.predictedCloseProbability * 100).toFixed(0)}%`);
  console.log(`\n  Critical moment: Touch ${simulation.criticalMomentTouchIndex}`);
  console.log(`  ${simulation.criticalMomentDescription}`);

  console.log('\n=== TEST COMPLETE ✅ ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\nReplay test failed:', err);
  process.exit(1);
});
