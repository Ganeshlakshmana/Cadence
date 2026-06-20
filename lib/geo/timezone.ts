// Approximate IANA timezone from lat/lng using a region-based lookup.
// For the hackathon, a simple approach: use country code if available,
// else approximate by longitude.

const COUNTRY_TIMEZONES: Record<string, string> = {
  DE: 'Europe/Berlin',
  AT: 'Europe/Vienna',
  CH: 'Europe/Zurich',
  FR: 'Europe/Paris',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  PT: 'Europe/Lisbon',
  UK: 'Europe/London',
  GB: 'Europe/London',
  US: 'America/New_York', // east coast default; refine if needed
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  IN: 'Asia/Kolkata',
};

export function getTimezoneForCountry(countryCode: string): string {
  return COUNTRY_TIMEZONES[countryCode.toUpperCase()] ?? 'UTC';
}

export function approximateTimezoneFromCoordinates(lat: number, lon: number): string {
  // Very rough approximation by longitude bands
  if (lon >= -180 && lon < -120) return 'America/Los_Angeles';
  if (lon >= -120 && lon < -90) return 'America/Denver';
  if (lon >= -90 && lon < -60) return 'America/Chicago';
  if (lon >= -60 && lon < -30) return 'America/New_York';
  if (lon >= -30 && lon < 0) return 'Atlantic/Azores';
  if (lon >= 0 && lon < 15) return 'Europe/London';
  if (lon >= 15 && lon < 30) return 'Europe/Berlin';
  if (lon >= 30 && lon < 45) return 'Europe/Helsinki';
  if (lon >= 45 && lon < 60) return 'Asia/Dubai';
  if (lon >= 60 && lon < 90) return 'Asia/Karachi';
  if (lon >= 90 && lon < 120) return 'Asia/Bangkok';
  if (lon >= 120 && lon < 150) return 'Asia/Shanghai';
  return 'Asia/Tokyo';
}
