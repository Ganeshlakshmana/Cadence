// @ts-nocheck — test script; runs against live DB
/**
 * CLI test: manager one-pager JSON + ElevenLabs voice note for Maria Müller.
 *
 * Uses the most recent persisted sequence (from test-replay.ts).
 * Calls generators directly — no HTTP, no consent gate.
 *
 * Usage: npm run test:manager-voice
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });

import { db, customers, sequences, touchpoints } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { generateManagerOnePager } from '../lib/llm/managerOnePager';
import { renderVoice } from '../lib/channels/renderVoice';

const MARIA_EMAIL = 'maria.mueller@gmail.com';

async function main() {
  console.log('=== SunPath Manager One-Pager + Voice Test ===\n');

  const [cust] = await db.select().from(customers).where(eq(customers.email, MARIA_EMAIL)).limit(1);
  if (!cust) throw new Error(`Customer ${MARIA_EMAIL} not found — run: npm run db:seed`);

  const [seq] = await db.select().from(sequences)
    .where(eq(sequences.customerId, cust.id))
    .orderBy(desc(sequences.createdAt))
    .limit(1);
  if (!seq) throw new Error('No persisted sequence found — run: npm run test:replay first');

  const touches = await db.select().from(touchpoints)
    .where(eq(touchpoints.sequenceId, seq.id));

  console.log(`Sequence: ${seq.id} (${touches.length} touches, status: ${seq.status})`);
  console.log(`Customer: ${cust.fname} ${cust.lname} | €${cust.priceQuote}\n`);

  const archetypeBlend = {
    family:           cust.archetypeFamily ?? 0,
    investor:         cust.archetypeInvestor ?? 0,
    environmentalist: cust.archetypeEnvironmentalist ?? 0,
    skeptic:          cust.archetypeSkeptic ?? 0,
  };

  const strategyObj = {
    rationaleSummary:     seq.rationale ?? '',
    marketContextApplied: '',
    touches: touches
      .sort((a, b) => a.dayOffset - b.dayOffset)
      .map((t, i) => ({
        sequenceIndex:   i + 1,
        dayOffset:       t.dayOffset,
        channel:         t.channel,
        tone:            'professional',
        objective:       '',
        reasoning:       t.reasoning ?? '',
        contentSubject:  t.contentSubject ?? null,
        contentBody:     t.contentBody ?? '',
        contentVariantB: null,
        abTestActive:    false,
      })),
  };

  // ── Step 1: Manager One-Pager ─────────────────────────────────────────────
  console.log('--- Step 1: Manager One-Pager (Sonnet) ---');

  const onePager = await generateManagerOnePager({
    customerFirstName:   cust.fname,
    customerLastName:    cust.lname,
    totalPrice:          cust.priceQuote ?? 0,
    currency:            'EUR',
    archetypeBlend,
    strategy:            strategyObj,
    ghostRiskScore:      seq.ghostRiskScore ?? 0,
    closeReadinessScore: seq.closeReadinessScore ?? 0,
    installerName:       'Stefan Berger',
  });

  console.log('\nManager One-Pager JSON:');
  console.log(JSON.stringify(onePager, null, 2));

  const required = ['dealHeader', 'myRead', 'myPlan', 'risksAndMitigations', 'whereIneedHelp', 'closeTargetDate', 'expectedOutcome'] as const;
  const missing = required.filter(k => !onePager[k]);
  if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);
  console.log(`\n✅ All 7 fields present | ${onePager.risksAndMitigations.length} risks identified`);

  // ── Step 2: ElevenLabs Voice Note ─────────────────────────────────────────
  console.log('\n--- Step 2: ElevenLabs Voice Note ---');

  const voiceTouch = touches.find(t => t.channel === 'whatsapp_voice');
  if (!voiceTouch) {
    console.log('ℹ️  No whatsapp_voice touch — skipping voice test. Re-run test:replay to get one.');
  } else if (!process.env.ELEVENLABS_API_KEY) {
    console.log('ℹ️  ELEVENLABS_API_KEY not set — skipping voice generation.');
    console.log(`   Voice touch exists: day ${voiceTouch.dayOffset}`);
  } else {
    console.log(`Found voice touch: day ${voiceTouch.dayOffset}`);

    try {
      const voiceData = await renderVoice(
        {
          sequenceIndex:   1,
          dayOffset:       voiceTouch.dayOffset,
          channel:         'whatsapp_voice',
          tone:            'warm',
          objective:       '',
          reasoning:       voiceTouch.reasoning ?? '',
          contentSubject:  voiceTouch.contentSubject ?? null,
          contentBody:     voiceTouch.contentBody ?? '',
          contentVariantB: null,
          abTestActive:    false,
        },
        {
          installerName:     'Stefan Berger',
          companyName:       'SunPath Solar',
          customerFirstName: cust.fname,
          languageCode:      cust.language ?? 'de',
        },
      );

      await db.update(touchpoints)
        .set({ contentAudioUrl: voiceData.audioUrl })
        .where(eq(touchpoints.id, voiceTouch.id));

      console.log(`\nScript (${voiceData.durationEstimateSeconds}s estimated):`);
      console.log(`  "${voiceData.script.slice(0, 200)}${voiceData.script.length > 200 ? '...' : ''}"`);
      console.log(`Audio path: ${voiceData.audioUrl}`);
      console.log('Cached on touch row: ✅');
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
