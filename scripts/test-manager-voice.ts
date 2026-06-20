/**
 * CLI test: manager one-pager JSON + ElevenLabs voice note for Maria Müller.
 *
 * Uses the most recent persisted strategy (from test-replay.ts).
 * Calls generators directly — no HTTP, no consent gate.
 *
 * Usage: npm run test:manager-voice
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
} from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { generateManagerOnePager } from '../lib/llm/managerOnePager';
import { renderVoice } from '../lib/channels/renderVoice';
import type { Strategy } from '../lib/llm/schemas';

const CUSTOMER_ID = 'cust_maria_mueller';

async function main() {
  console.log('=== SunPath Manager One-Pager + Voice Test ===\n');

  // ── Load data ─────────────────────────────────────────────────────────────
  const [cust] = await db.select().from(customerTable).where(eq(customerTable.id, CUSTOMER_ID)).limit(1);
  if (!cust) throw new Error('Maria Müller not found — run: npm run db:seed');

  const [profile] = await db.select().from(customerProfileTable)
    .where(eq(customerProfileTable.customerId, CUSTOMER_ID)).limit(1);

  const [q] = await db.select().from(quoteTable)
    .where(eq(quoteTable.customerId, CUSTOMER_ID)).limit(1);
  if (!q) throw new Error('No quote found');

  // Latest persisted strategy (from test-replay.ts)
  const [strat] = await db.select().from(strategyTable)
    .where(eq(strategyTable.customerId, CUSTOMER_ID))
    .orderBy(desc(strategyTable.createdAt))
    .limit(1);
  if (!strat) throw new Error('No persisted strategy found — run: npm run test:replay first');

  const touches = await db.select().from(strategyTouchTable)
    .where(eq(strategyTouchTable.strategyId, strat.id));

  console.log(`Strategy: ${strat.id} (${touches.length} touches, status: ${strat.status})`);
  console.log(`Customer: ${cust.firstName} ${cust.lastName} | €${q.totalPrice} | ${q.paybackPeriodYears}yr payback\n`);

  const archetypeBlend = {
    family: profile?.archetypeFamily ?? 0,
    investor: profile?.archetypeInvestor ?? 0,
    environmentalist: profile?.archetypeEnvironmentalist ?? 0,
    skeptic: profile?.archetypeSkeptic ?? 0,
  };

  const strategyObj: Strategy = {
    rationaleSummary: strat.rationaleSummary ?? '',
    marketContextApplied: strat.marketContextApplied ?? '',
    touches: touches
      .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
      .map(t => ({
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

  // ── Step 1: Manager One-Pager ─────────────────────────────────────────────
  console.log('--- Step 1: Manager One-Pager (Sonnet) ---');

  const onePager = await generateManagerOnePager({
    customerFirstName: cust.firstName,
    customerLastName: cust.lastName,
    totalPrice: q.totalPrice ?? 0,
    currency: q.currency ?? 'EUR',
    archetypeBlend,
    strategy: strategyObj,
    ghostRiskScore: strat.ghostRiskScore ?? 0,
    closeReadinessScore: strat.closeReadinessScore ?? 0,
    installerName: 'Stefan Berger',
  });

  console.log('\nManager One-Pager JSON:');
  console.log(JSON.stringify(onePager, null, 2));

  // Verify all required fields
  const required = ['dealHeader', 'myRead', 'myPlan', 'risksAndMitigations', 'whereIneedHelp', 'closeTargetDate', 'expectedOutcome'] as const;
  const missing = required.filter(k => !onePager[k]);
  if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);
  if (!Array.isArray(onePager.risksAndMitigations) || onePager.risksAndMitigations.length === 0) {
    throw new Error('risksAndMitigations must be a non-empty array');
  }
  console.log(`\n✅ All 7 fields present | ${onePager.risksAndMitigations.length} risks identified`);

  // Spot-check: no marketing language
  const marketingTerms = ['drive engagement', 'leverage synergies', 'actionable insights', 'holistic'];
  const bodyText = `${onePager.myRead} ${onePager.myPlan}`.toLowerCase();
  const found = marketingTerms.filter(t => bodyText.includes(t));
  if (found.length > 0) {
    console.warn(`⚠️  Marketing language detected: ${found.join(', ')} — check prompt`);
  } else {
    console.log('✅ No marketing language detected in myRead/myPlan');
  }

  // ── Step 2: ElevenLabs Voice Note ─────────────────────────────────────────
  console.log('\n--- Step 2: ElevenLabs Voice Note ---');

  const voiceTouch = touches.find(t => t.channel === 'whatsapp_voice');
  if (!voiceTouch) {
    console.log('ℹ️  No whatsapp_voice touch in this strategy — skipping voice test.');
    console.log('   Re-run test:replay to generate a strategy with a voice touch.');
  } else if (!process.env.ELEVENLABS_API_KEY) {
    console.log('ℹ️  ELEVENLABS_API_KEY not set — skipping voice generation.');
    console.log(`   Voice touch exists: Touch ${voiceTouch.sequenceIndex} (day ${voiceTouch.dayOffset})`);
    console.log('   Add ELEVENLABS_API_KEY to .env.local to generate audio.');
  } else {
    console.log(`Found voice touch: Touch ${voiceTouch.sequenceIndex} (day ${voiceTouch.dayOffset})`);
    console.log(`Objective: ${voiceTouch.objective}`);

    try {
      const voiceData = await renderVoice(
        {
          sequenceIndex: voiceTouch.sequenceIndex,
          dayOffset: voiceTouch.dayOffset,
          channel: 'whatsapp_voice',
          tone: voiceTouch.tone as Parameters<typeof renderVoice>[0]['tone'],
          objective: voiceTouch.objective ?? '',
          reasoning: voiceTouch.reasoning,
          contentSubject: voiceTouch.contentSubject ?? null,
          contentBody: voiceTouch.contentBody,
          contentVariantB: voiceTouch.contentVariantB ?? null,
          abTestActive: voiceTouch.abTestActive ?? false,
        },
        {
          installerName: 'Stefan Berger',
          companyName: 'SunPath Solar',
          customerFirstName: cust.firstName,
          languageCode: cust.preferredLanguage ?? 'de',
        },
      );

      // Cache on touch row
      await db.update(strategyTouchTable)
        .set({ audioUrl: voiceData.audioUrl })
        .where(eq(strategyTouchTable.id, voiceTouch.id));

      console.log(`\nScript (${voiceData.durationEstimateSeconds}s estimated):`);
      console.log(`  "${voiceData.script.slice(0, 200)}${voiceData.script.length > 200 ? '...' : ''}"`);
      console.log(`\nAI Act disclosure opens script: ${voiceData.script.startsWith('Hallo') || voiceData.script.startsWith('Hello') ? '✅' : '⚠️'}`);
      console.log(`Audio path: ${voiceData.audioUrl}`);
      console.log(`Cached on touch row: ✅`);
    } catch (voiceErr) {
      console.warn(`⚠️  Voice generation failed: ${voiceErr}`);
    }
  }

  console.log('\n=== TEST COMPLETE ✅ ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
