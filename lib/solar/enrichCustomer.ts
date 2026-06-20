import { db } from '../../db/client';
import { customer } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { geocodeAddress } from '../geo/geocoding';
import { fetchIrradianceWithFallback } from './pvgis';

export interface CustomerEnrichInput {
  id: string;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface EnrichResult {
  lat: number;
  lon: number;
  irradiance: number;
  source: 'pvgis' | 'country_fallback';
}

export async function enrichCustomerSolar(cust: CustomerEnrichInput): Promise<EnrichResult> {
  let lat = cust.latitude;
  let lon = cust.longitude;

  if (!lat || !lon) {
    const address = [cust.addressLine, cust.postalCode, cust.city, cust.countryCode]
      .filter(Boolean).join(', ');
    const geo = await geocodeAddress(address);
    if (geo) {
      lat = geo.lat;
      lon = geo.lon;
      await db.update(customer)
        .set({ latitude: lat, longitude: lon })
        .where(eq(customer.id, cust.id));
    }
  }

  const country = cust.countryCode?.toUpperCase() ?? 'DE';

  if (!lat || !lon) {
    const countryDefaults: Record<string, number> = {
      DE: 1100, FR: 1400, ES: 1700, UK: 950, AT: 1200,
      NL: 950, IT: 1600, PT: 1900, CH: 1300, US: 1600,
    };
    const irradiance = countryDefaults[country] ?? 1100;
    console.warn(`[enrichCustomer] Could not geocode ${cust.id} — using country default ${irradiance} kWh/m²/yr`);
    await db.update(customer)
      .set({ solarIrradianceKwhM2Year: irradiance })
      .where(eq(customer.id, cust.id));
    return { lat: 0, lon: 0, irradiance, source: 'country_fallback' };
  }

  const irradiance = await fetchIrradianceWithFallback(lat, lon, country);
  await db.update(customer)
    .set({ solarIrradianceKwhM2Year: irradiance })
    .where(eq(customer.id, cust.id));

  return { lat, lon, irradiance, source: 'pvgis' };
}
