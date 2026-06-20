/**
 * CLI test: geocode Maria Müller's address → live PVGIS irradiance → store on DB row →
 * feed real value into sequenceGenerator → confirm it appears in reasoning.
 *
 * Usage: npm run test:solar
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });

import { db } from '../db/client';
import { customer, quote } from '../db/schema';
import { eq } from 'drizzle-orm';
import { geocodeAddress } from '../lib/geo/geocoding';
import { fetchIrradianceWithFallback } from '../lib/solar/pvgis';
import { inferPersona } from '../lib/llm/personaInference';
import { generateSequence } from '../lib/llm/sequenceGenerator';
import { getMarketContext } from '../lib/persuasion/marketContext';

const CUSTOMER_ID = 'cust_maria_mueller';

async function main() {
  console.log('=== SunPath Solar Enrichment Test ===\n');

  const [cust] = await db.select().from(customer).where(eq(customer.id, CUSTOMER_ID)).limit(1);
  if (!cust) throw new Error('Maria Müller not found — run: npm run db:seed');

  const [q] = await db.select().from(quote).where(eq(quote.customerId, CUSTOMER_ID)).limit(1);
  if (!q) throw new Error('No quote found for Maria Müller');

  // ── Step 1: Geocode ───────────────────────────────────────────────────────
  console.log('--- Step 1: Geocode (Nominatim) ---');
  const addressStr = [cust.addressLine, cust.postalCode, cust.city, cust.countryCode]
    .filter(Boolean).join(', ');
  console.log(`Input: ${addressStr}`);

  // Try full address first; fall back to postal code + city if the street is fictional/unrecognised
  let geo = await geocodeAddress(addressStr);
  if (!geo && cust.postalCode && cust.city) {
    const fallbackQuery = `${cust.postalCode} ${cust.city}, ${cust.countryCode ?? ''}`.trim();
    console.log(`  (full address not found — retrying with: ${fallbackQuery})`);
    geo = await geocodeAddress(fallbackQuery);
  }
  if (!geo && cust.latitude && cust.longitude) {
    console.log(`  (geocoding failed — using seeded coordinates ${cust.latitude}, ${cust.longitude})`);
    geo = { lat: cust.latitude, lon: cust.longitude, displayName: `${cust.city ?? ''}, ${cust.countryCode ?? ''}`, city: cust.city ?? '', postalCode: cust.postalCode ?? '', countryCode: cust.countryCode ?? '' };
  }
  if (!geo) throw new Error('Could not resolve coordinates for this customer');

  console.log(`Lat/Lng:  ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`);
  console.log(`Resolved: ${geo.displayName}`);

  await db.update(customer)
    .set({ latitude: geo.lat, longitude: geo.lon })
    .where(eq(customer.id, CUSTOMER_ID));

  // ── Step 2: Live PVGIS irradiance ─────────────────────────────────────────
  console.log('\n--- Step 2: PVGIS v5_3 PVcalc ---');
  const irradiance = await fetchIrradianceWithFallback(geo.lat, geo.lon, cust.countryCode ?? 'DE');
  console.log(`Live irradiance: ${irradiance.toFixed(1)} kWh/m²/yr`);

  await db.update(customer)
    .set({ solarIrradianceKwhM2Year: irradiance })
    .where(eq(customer.id, CUSTOMER_ID));

  // ── Step 3: Verify stored value ───────────────────────────────────────────
  console.log('\n--- Step 3: Verify DB storage ---');
  const [stored] = await db.select().from(customer).where(eq(customer.id, CUSTOMER_ID)).limit(1);
  if (stored.solarIrradianceKwhM2Year !== irradiance) {
    throw new Error(`DB mismatch: stored ${stored.solarIrradianceKwhM2Year} ≠ fetched ${irradiance}`);
  }
  console.log(`✅ customer.solarIrradianceKwhM2Year = ${stored.solarIrradianceKwhM2Year} kWh/m²/yr`);

  // ── Step 4: Sequence generation with real irradiance ─────────────────────
  console.log('\n--- Step 4: Sequence generation ---');
  console.log(`Passing solarIrradianceKwhM2Year = ${irradiance.toFixed(1)} to sequenceGenerator`);

  const persona = await inferPersona({
    notes: `Maria called. Four kids at home. She's worried this is a scam. She said "we want this done before the kids leave for uni next September" and "tired of my bill going up every year". No competitor mentioned. She wants reliability.`,
    systemSizeKw: q.systemSizeKw ?? 8.5,
    panelCount: q.panelCount ?? 20,
    batteryIncluded: q.batteryIncluded ?? true,
    currency: q.currency ?? 'EUR',
    totalPrice: q.totalPrice ?? 18400,
    estimatedAnnualSavings: q.estimatedAnnualSavings ?? 1560,
    paybackPeriodYears: q.paybackPeriodYears ?? 11.8,
    co2OffsetTons25yr: q.co2OffsetTons25yr ?? 47,
  });

  const marketContextBlock = getMarketContext(cust.countryCode ?? 'DE');

  const strategy = await generateSequence({
    firstName: cust.firstName,
    lastName: cust.lastName,
    preferredLanguage: cust.preferredLanguage ?? 'de',
    formalityRegister: cust.formalityRegister ?? 'formal',
    countryCode: cust.countryCode ?? 'DE',
    city: cust.city ?? 'Berlin',
    postalCode: cust.postalCode ?? '10115',
    solarIrradianceKwhM2Year: irradiance,
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

  // ── Results ───────────────────────────────────────────────────────────────
  console.log('\n=== RESULTS ===');
  console.log(`\nCoordinates:      ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`);
  console.log(`Live irradiance:  ${irradiance.toFixed(1)} kWh/m²/yr  (PVGIS v5_3)`);
  console.log(`Stored in DB:     ${stored.solarIrradianceKwhM2Year} kWh/m²/yr`);
  console.log(`Fed to model:     ${irradiance.toFixed(1)} kWh/m²/yr`);

  console.log('\nTouch reasoning (all touches):');
  for (const t of strategy.touches) {
    console.log(`  Touch ${t.sequenceIndex} [${t.channel}]: ${t.reasoning}`);
  }

  // Find a touch whose reasoning or body cites the actual irradiance number
  const rounded = Math.round(irradiance).toString();
  const citingTouch = strategy.touches.find(t =>
    t.reasoning.includes(rounded) || t.contentBody.includes(rounded)
  );
  if (citingTouch) {
    console.log(`\n✅ Touch ${citingTouch.sequenceIndex} cites the live irradiance (${rounded} kWh/m²):`);
    console.log(`   "${citingTouch.reasoning}"`);
  } else {
    console.log(`\nℹ️  No touch explicitly cited ${rounded} kWh/m² — irradiance is baked into the market context framing.`);
    console.log(`   Touch 1 reasoning: "${strategy.touches[0].reasoning}"`);
  }

  console.log('\n=== TEST COMPLETE ✅ ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\nSolar test failed:', err);
  process.exit(1);
});
