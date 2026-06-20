interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    country_code?: string;
  };
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'SunPath/1.0 (hackathon; contact@sunpath.app)',
      'Accept-Language': 'en',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Nominatim API error: ${res.status} ${res.statusText}`);
  }

  const results = (await res.json()) as NominatimResult[];
  if (!results || results.length === 0) return null;

  const r = results[0];
  return {
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    displayName: r.display_name,
    city: r.address?.city ?? r.address?.town ?? r.address?.village ?? '',
    postalCode: r.address?.postcode ?? '',
    countryCode: (r.address?.country_code ?? '').toUpperCase(),
  };
}
