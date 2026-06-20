/**
 * CLI test script: runs persona inference → sequence generation → delta regen
 * on Maria Müller (seeded fixture) and dumps JSON to stdout.
 *
 * Usage: npm run test:strategy
 *
 * Validates that every reasoning field references:
 * - A specific archetype weight (e.g. "60% family")
 * - A specific quote number (e.g. "€130/month" or "€18,400" or "11.8 years")
 */

import { config } from 'dotenv';
// Load .env.local first (user's real keys), fallback to .env
// override:true is required — the shell pre-injects a masked OPENAI_API_KEY placeholder
// that dotenv would otherwise skip (it only sets vars that aren't already defined).
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });
import { db } from '../db/client';
import { customer, customerProfile, quote } from '../db/schema';
import { eq } from 'drizzle-orm';
import { inferPersona } from '../lib/llm/personaInference';
import { generateSequence } from '../lib/llm/sequenceGenerator';
import { regenDelta } from '../lib/llm/deltaRegen';
import { getMarketContext, getMarketContextKey } from '../lib/persuasion/marketContext';

const CUSTOMER_ID = 'cust_maria_mueller';

async function validateReasoning(touches: Array<{ sequenceIndex: number; reasoning: string; dayOffset: number }>) {
  const archetypePatterns = [/\d+%\s*(family|investor|environmentalist|skeptic)/i, /family.weighted|investor.dominant|skeptic.weight/i];
  const numberPatterns = [/€\s*[\d,]+/, /\d+[\.,]\d+\s*(years?|jahre)/i, /\d+\s*(kw|kwh|tons?)/i, /\d+[\.,]?\d*%/];

  const failures: string[] = [];
  for (const t of touches) {
    const hasArchetype = archetypePatterns.some(p => p.test(t.reasoning));
    const hasNumber = numberPatterns.some(p => p.test(t.reasoning));

    if (!hasArchetype) {
      failures.push(`Touch ${t.sequenceIndex} (day ${t.dayOffset}): reasoning lacks specific archetype weight\n  >> "${t.reasoning.slice(0, 100)}..."`);
    }
    if (!hasNumber) {
      failures.push(`Touch ${t.sequenceIndex} (day ${t.dayOffset}): reasoning lacks specific quote number\n  >> "${t.reasoning.slice(0, 100)}..."`);
    }
  }
  return failures;
}

async function main() {
  console.log('=== SunPath Strategy Test ===\n');
  console.log(`Customer: ${CUSTOMER_ID}\n`);

  // Load fixture customer
  const [cust] = await db.select().from(customer).where(eq(customer.id, CUSTOMER_ID)).limit(1);
  if (!cust) throw new Error(`Fixture customer ${CUSTOMER_ID} not found. Run: npm run db:seed`);

  const [profile] = await db.select().from(customerProfile).where(eq(customerProfile.customerId, CUSTOMER_ID)).limit(1);
  const [q] = await db.select().from(quote).where(eq(quote.customerId, CUSTOMER_ID)).limit(1);
  if (!q) throw new Error('No quote found for Maria Müller. Run: npm run db:seed');

  console.log(`Customer: ${cust.firstName} ${cust.lastName}`);
  console.log(`Quote: €${q.totalPrice} | €${q.monthlyEquivalentSavings}/month | ${q.paybackPeriodYears}yr payback\n`);

  // ── Step 1: Persona Inference ─────────────────────────────────────────────
  console.log('--- Step 1: Persona Inference (Haiku) ---');
  const installerNotes = `Maria called yesterday. She's worried this is a scam — her neighbor got burned by a different company last year. Husband is skeptical too. She said "we want this done before the kids leave for uni next September" and she's "tired of my bill going up every year." Four kids at home. She mentioned her neighbor just got solar and regrets not getting the battery. No competitor mentioned. She wants reliability above all.`;

  const persona = await inferPersona({
    notes: installerNotes,
    systemSizeKw: q.systemSizeKw ?? 8.5,
    panelCount: q.panelCount ?? 20,
    batteryIncluded: q.batteryIncluded ?? true,
    currency: q.currency ?? 'EUR',
    totalPrice: q.totalPrice ?? 18400,
    estimatedAnnualSavings: q.estimatedAnnualSavings ?? 1560,
    paybackPeriodYears: q.paybackPeriodYears ?? 11.8,
    co2OffsetTons25yr: q.co2OffsetTons25yr ?? 47,
  });

  console.log('\nPersona inference result:');
  console.log(JSON.stringify(persona, null, 2));

  // ── Step 2: Sequence Generation ───────────────────────────────────────────
  console.log('\n--- Step 2: Sequence Generation (Sonnet) ---');
  const marketContextBlock = getMarketContext(cust.countryCode ?? 'DE');
  const marketContextApplied = getMarketContextKey(cust.countryCode ?? 'DE');

  const strategy = await generateSequence({
    firstName: cust.firstName,
    lastName: cust.lastName,
    preferredLanguage: cust.preferredLanguage ?? 'de',
    formalityRegister: cust.formalityRegister ?? 'formal',
    countryCode: cust.countryCode ?? 'DE',
    city: cust.city ?? 'Berlin',
    postalCode: cust.postalCode ?? '10115',
    solarIrradianceKwhM2Year: cust.solarIrradianceKwhM2Year ?? 1050,
    archetypeFamily: persona.archetypeBlend.family,
    archetypeInvestor: persona.archetypeBlend.investor,
    archetypeEnvironmentalist: persona.archetypeBlend.environmentalist,
    archetypeSkeptic: persona.archetypeBlend.skeptic,
    customerVerbatimPhrases: persona.customerVerbatimPhrases,
    statedMotivations: persona.statedMotivations,
    topObjections: persona.topObjections,
    decisionTimeline: persona.decisionTimeline,
    competitorMentioned: persona.competitorMentioned,
    competitorNames: persona.competitorNames,
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

  console.log('\nStrategy result:');
  console.log(JSON.stringify(strategy, null, 2));
  console.log(`\nMarket context applied: ${marketContextApplied}`);
  console.log(`Touch count: ${strategy.touches.length}`);

  // ── Validate reasoning ────────────────────────────────────────────────────
  console.log('\n--- Reasoning validation ---');
  const failures = await validateReasoning(strategy.touches);
  if (failures.length > 0) {
    console.error('\n❌ REASONING VALIDATION FAILED:');
    failures.forEach(f => console.error(f));
    console.error('\nDO NOT PROCEED until reasoning is specific. Improve the prompts.');
    process.exit(1);
  } else {
    console.log('✅ All touches have specific archetype weights AND specific quote numbers in reasoning');
  }

  // ── Step 3: Delta Regen (bonus — failure does not block Steps 1-2) ─────────
  console.log('\n--- Step 3: Delta Regeneration (Sonnet) ---');
  const customerContextBlock = `Customer: Maria Müller
Language: de (formal)
Country: DE
Archetypes: Family ${persona.archetypeBlend.family}, Investor ${persona.archetypeBlend.investor}, Environmentalist ${persona.archetypeBlend.environmentalist}, Skeptic ${persona.archetypeBlend.skeptic}
Quote: EUR${q.totalPrice} total, EUR${q.monthlyEquivalentSavings}/month savings, ${q.paybackPeriodYears}yr payback`;

  try {
    const delta = await regenDelta({
      currentStrategy: strategy,
      installerFreeTextInstruction: 'Make the tone warmer and more reassuring throughout. Maria responded positively to the voice note concept — add one more personal touch around day 10. Remove any urgency framing.',
      customerContextBlock,
    });

    console.log('\nDelta regen result:');
    console.log(JSON.stringify(delta, null, 2));
    console.log(`\nChanges made: ${delta.changes.length}`);
    delta.changes.forEach(c => {
      console.log(`  Touch ${c.touchIndex}: [${c.changeType}] ${c.summary}`);
    });

    console.log('\n--- Delta reasoning validation ---');
    const deltaFailures = await validateReasoning(delta.touches);
    if (deltaFailures.length > 0) {
      console.warn('\n⚠️  DELTA REASONING VALIDATION FAILED (non-fatal):');
      deltaFailures.forEach(f => console.warn(f));
    } else {
      console.log('✅ Delta touches also have specific archetype weights AND quote numbers');
    }
  } catch (deltaErr) {
    console.warn(`\n⚠️  Step 3 (deltaRegen) failed — skipping (non-fatal): ${deltaErr}`);
  }

  console.log('\n=== TEST COMPLETE ✅ ===');
  console.log('Steps 1 and 2 passed. The strategy engine is producing specific, archetype-weighted, number-grounded reasoning.');
  console.log('Ready to proceed to Step 4: Solar reality integration.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
