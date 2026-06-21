// @ts-nocheck — test script; runs against live DB
/**
 * CLI test: geocode Maria Müller's address → live PVGIS irradiance →
 * feed real value into sequenceGenerator → confirm it appears in reasoning.
 *
 * Note: solarIrradianceKwhM2Year is not stored on the customers table in the new
 * schema. The irradiance value is fetched and used in memory only.
 *
 * Usage: npm run test:solar
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });

import { db, customers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { geocodeAddress } from '../lib/geo/geocoding';
import { fetchIrradianceWithFallback } from '../lib/solar/pvgis';
import { generateSequence } from '../lib/llm/sequenceGenerator';
import { getMarketContext } from '../lib/persuasion/marketContext';

const MARIA_EMAIL = 'maria.mueller@gmail.com';

async function main() {
  console.log('=== SunPath Solar Enrichment Test ===\n');

  const [cust] = await db.select().from(customers).where(eq(customers.email, MARIA_EMAIL)).limit(1);
  if (!cust) throw new Error(`Customer ${MARIA_EMAIL} not found — run: npm run db:seed`);

  // ── Step 1: Geocode ───────────────────────────────────────────────────────
  console.log('--- Step 1: Geocode (Nominatim) ---');
  const addressStr = [cust.address, cust.postalCode].filter(Boolean).join(', ');
  console.log(`Input: ${addressStr}`);

  let geo = addressStr ? await geocodeAddress(addressStr) : null;
  if (!geo && cust.postalCode) {
    const fallback = `${cust.postalCode}, DE`;
    console.log(`  (retrying with: ${fallback})`);
    geo = await geocodeAddress(fallback);
  }
  if (!geo) throw new Error('Could not resolve coordinates for this customer');

  console.log(`Lat/Lng:  ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`);
  console.log(`Resolved: ${geo.displayName}`);

  // ── Step 2: Live PVGIS irradiance ─────────────────────────────────────────
  console.log('\n--- Step 2: PVGIS v5_3 PVcalc ---');
  const irradiance = await fetchIrradianceWithFallback(geo.lat, geo.lon, 'DE');
  console.log(`Live irradiance: ${irradiance.toFixed(1)} kWh/m²/yr`);
  console.log('(Note: not persisted — solarIrradianceKwhM2Year column removed from new schema)');

  // ── Step 3: Sequence generation with real irradiance ─────────────────────
  console.log('\n--- Step 3: Sequence generation ---');
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

  console.log('\n=== RESULTS ===');
  console.log(`\nCoordinates:     ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`);
  console.log(`Live irradiance: ${irradiance.toFixed(1)} kWh/m²/yr`);

  console.log('\nTouch reasoning (all touches):');
  for (const t of generated.touches) {
    console.log(`  Day ${t.day_offset} [${t.channel}]: ${t.reasoning}`);
  }

  console.log('\n=== TEST COMPLETE ✅ ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\nSolar test failed:', err);
  process.exit(1);
});
