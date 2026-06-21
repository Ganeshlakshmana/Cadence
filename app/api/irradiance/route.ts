import { NextRequest, NextResponse } from 'next/server';
import { fetchIrradiance, getRelativeToNationalAverage } from '@/lib/solar/pvgis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const countryCode = searchParams.get('countryCode') ?? 'DE';

    if (!lat || !lon) {
      return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      return NextResponse.json({ error: 'lat and lon must be valid numbers' }, { status: 400 });
    }

    const result = await fetchIrradiance(latNum, lonNum);
    const relative = getRelativeToNationalAverage(result.annualIrradianceKwhM2, countryCode);

    // TODO: cache irradiance on customer row once a solar_data column or table is added
    // (solarIrradianceKwhM2Year was removed from the customers table in the new schema)

    return NextResponse.json({
      lat: latNum,
      lon: lonNum,
      annualIrradianceKwhM2: result.annualIrradianceKwhM2,
      annualEnergyKwh: result.annualEnergyKwh,
      relative,
      displayLabel: `${Math.round(result.annualIrradianceKwhM2)} kWh/m²/year (${relative.label})`,
    });
  } catch (err) {
    console.error('Irradiance fetch error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
