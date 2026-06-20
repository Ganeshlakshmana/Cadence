import { NextRequest, NextResponse } from 'next/server';
import { fetchIrradiance, getRelativeToNationalAverage } from '@/lib/solar/pvgis';
import { db } from '@/db/client';
import { customer } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const customerId = searchParams.get('customerId');
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

    // Cache on customer row if customerId provided
    if (customerId) {
      await db.update(customer)
        .set({ solarIrradianceKwhM2Year: result.annualIrradianceKwhM2 })
        .where(eq(customer.id, customerId));
    }

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
