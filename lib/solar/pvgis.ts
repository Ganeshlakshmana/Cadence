interface PVGISResponse {
  outputs: {
    totals: {
      fixed: {
        E_y: number; // Annual energy [kWh]
        'H(i)_y': number; // Annual irradiation [kWh/m²]
      };
    };
  };
}

export interface PVGISResult {
  annualIrradianceKwhM2: number;
  annualEnergyKwh: number;
  peakPowerKw: number;
}

export async function fetchIrradiance(lat: number, lon: number, peakPowerKw = 1): Promise<PVGISResult> {
  const url = new URL('https://re.jrc.ec.europa.eu/api/v5_3/PVcalc');
  url.searchParams.set('lat', lat.toFixed(4));
  url.searchParams.set('lon', lon.toFixed(4));
  url.searchParams.set('peakpower', peakPowerKw.toString());
  url.searchParams.set('loss', '14');
  url.searchParams.set('outputformat', 'json');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'SunPath/1.0 (hackathon; contact@sunpath.app)' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`PVGIS API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as PVGISResponse;
  const totals = data.outputs.totals.fixed;

  return {
    annualIrradianceKwhM2: totals['H(i)_y'],
    annualEnergyKwh: totals.E_y,
    peakPowerKw,
  };
}

export async function fetchIrradianceWithFallback(lat: number, lon: number, countryCode: string): Promise<number> {
  try {
    const result = await fetchIrradiance(lat, lon);
    return result.annualIrradianceKwhM2;
  } catch (err) {
    const fallback = NATIONAL_AVERAGES_KWH_M2[countryCode.toUpperCase()] ?? 1100;
    console.warn(`[PVGIS] fetch failed (${lat},${lon}): ${err}. Using country default: ${fallback} kWh/m²/yr`);
    return fallback;
  }
}

// Country-level averages for relative comparison display
const NATIONAL_AVERAGES_KWH_M2: Record<string, number> = {
  DE: 1100,
  US: 1600,
  ES: 1700,
  FR: 1400,
  UK: 950,
  AT: 1200,
  CH: 1300,
  NL: 950,
  IT: 1600,
  PT: 1900,
};

export function getRelativeToNationalAverage(
  irradiance: number,
  countryCode: string,
): { pct: number; label: string } {
  const avg = NATIONAL_AVERAGES_KWH_M2[countryCode.toUpperCase()] ?? 1200;
  const pct = Math.round(((irradiance - avg) / avg) * 100);
  const label = pct >= 0 ? `${pct}% above average` : `${Math.abs(pct)}% below average`;
  return { pct, label };
}
