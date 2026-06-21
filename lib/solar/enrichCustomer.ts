// TODO: latitude, longitude, solarIrradianceKwhM2Year columns were removed from the
// customers table in the new schema. DB persistence is skipped until those columns
// are re-added or moved to a separate solar_data table.
import { geocodeAddress } from '../geo/geocoding';
import { fetchIrradianceWithFallback } from './pvgis';

export interface CustomerEnrichInput {
  id: string;
  address: string | null;
  postalCode: string | null;
}

export interface EnrichResult {
  lat: number;
  lon: number;
  irradiance: number;
  source: 'pvgis' | 'country_fallback';
}

export async function enrichCustomerSolar(cust: CustomerEnrichInput): Promise<EnrichResult> {
  const addressStr = [cust.address, cust.postalCode].filter(Boolean).join(', ');
  const geo = addressStr ? await geocodeAddress(addressStr) : null;

  if (!geo) {
    const irradiance = 1100;
    console.warn(`[enrichCustomer] Could not geocode ${cust.id} — using fallback ${irradiance} kWh/m²/yr`);
    return { lat: 0, lon: 0, irradiance, source: 'country_fallback' };
  }

  const irradiance = await fetchIrradianceWithFallback(geo.lat, geo.lon, 'DE');
  return { lat: geo.lat, lon: geo.lon, irradiance, source: 'pvgis' };
}
