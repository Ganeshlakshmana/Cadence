// @ts-nocheck — test script; runs against live DB
/**
 * CLI test script: sequence generation → delta regen for Maria Müller (seeded fixture).
 *
 * Usage: npm run test:strategy
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });

import { db, customers, sequences, touchpoints } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateSequence } from '../lib/llm/sequenceGenerator';
import { regenDelta } from '../lib/llm/deltaRegen';
import { getMarketContext, getMarketContextKey } from '../lib/persuasion/marketContext';

const MARIA_EMAIL = 'maria.mueller@gmail.com';

async function main() {
  console.log('=== SunPath Strategy Test ===\n');

  // Look up Maria by email (seed uses nanoid IDs now)
  const [cust] = await db.select().from(customers).where(eq(customers.email, MARIA_EMAIL)).limit(1);
  if (!cust) throw new Error(`Customer ${MARIA_EMAIL} not found — run: npm run db:seed`);

  console.log(`Customer: ${cust.fname} ${cust.lname}`);
  console.log(`Quote: €${cust.priceQuote}`);
  console.log(`Archetypes: Family ${cust.archetypeFamily}, Investor ${cust.archetypeInvestor}, Environmentalist ${cust.archetypeEnvironmentalist}, Skeptic ${cust.archetypeSkeptic}\n`);

  // ── Step 1: Sequence Generation ───────────────────────────────────────────
  console.log('--- Step 1: Sequence Generation (Sonnet) ---');
  const marketContextBlock = getMarketContext('DE');
  const marketContextApplied = getMarketContextKey('DE');

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

  console.log('\nSequence result:');
  console.log(JSON.stringify(generated, null, 2));
  console.log(`\nMarket context applied: ${marketContextApplied}`);
  console.log(`Touch count: ${generated.touches.length}`);

  // ── Step 2: Delta Regen ───────────────────────────────────────────────────
  console.log('\n--- Step 2: Delta Regeneration (Sonnet) ---');
  const customerContextBlock = `Customer: ${cust.fname} ${cust.lname}
Language: ${cust.language ?? 'de'}
Archetypes: Family ${cust.archetypeFamily}, Investor ${cust.archetypeInvestor}, Environmentalist ${cust.archetypeEnvironmentalist}, Skeptic ${cust.archetypeSkeptic}
Quote: €${cust.priceQuote} total`;

  try {
    const delta = await regenDelta({
      currentStrategy: {
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
      installerFreeTextInstruction: 'Make the tone warmer. Add one more personal touch around day 10.',
      customerContextBlock,
    });

    console.log('\nDelta regen result:');
    console.log(JSON.stringify(delta, null, 2));
    console.log(`\nChanges: ${delta.changes.length}`);
    delta.changes.forEach(c => {
      console.log(`  Touch ${c.touchIndex}: [${c.changeType}] ${c.summary}`);
    });
  } catch (deltaErr) {
    console.warn(`\n⚠️  deltaRegen failed (non-fatal): ${deltaErr}`);
  }

  console.log('\n=== TEST COMPLETE ✅ ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
