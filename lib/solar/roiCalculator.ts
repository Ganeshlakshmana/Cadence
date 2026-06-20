interface ROIInput {
  systemSizeKw: number;
  totalPrice: number;
  annualIrradianceKwhM2: number;
  systemEfficiencyPct?: number; // default 0.8
  electricityPricePerkWh: number;
  annualPriceIncreaseRate?: number; // default 0.04 (4%)
  currency?: string;
  co2GridIntensityGperKwh?: number; // grams CO2 per kWh of grid electricity (default 400g DE average)
}

export interface ROIResult {
  estimatedAnnualProductionKwh: number;
  estimatedAnnualSavings: number;
  monthlyEquivalentSavings: number;
  paybackPeriodYears: number;
  annualRoiPct: number;
  co2OffsetTons25yr: number;
  twentyFiveYearNetSavings: number;
  currency: string;
}

export function calculateROI(input: ROIInput): ROIResult {
  const efficiency = input.systemEfficiencyPct ?? 0.80;
  const annualPriceIncrease = input.annualPriceIncreaseRate ?? 0.04;
  const currency = input.currency ?? 'EUR';
  const co2Intensity = input.co2GridIntensityGperKwh ?? 400;

  // Annual production: irradiance (kWh/m²) × system size (kW) × efficiency
  // For a 1kW system at 1 kWh/m²/year irradiance → ~1 kWh/year (rough approximation)
  // Real PVGIS gives actual production for 1kW, we scale linearly
  const estimatedAnnualProductionKwh = input.annualIrradianceKwhM2 * input.systemSizeKw * efficiency * 0.12;
  // 0.12 is a rough kWh/m²→kWh/kWp conversion factor; PVGIS gives exact values

  // Annual savings: production × electricity price
  const estimatedAnnualSavings = estimatedAnnualProductionKwh * input.electricityPricePerkWh;
  const monthlyEquivalentSavings = estimatedAnnualSavings / 12;

  // Simple payback period
  const paybackPeriodYears = input.totalPrice / estimatedAnnualSavings;

  // Annual ROI %
  const annualRoiPct = (estimatedAnnualSavings / input.totalPrice) * 100;

  // 25-year savings with price increase
  let cumulativeSavings = 0;
  let yearlySavings = estimatedAnnualSavings;
  for (let y = 0; y < 25; y++) {
    cumulativeSavings += yearlySavings;
    yearlySavings *= (1 + annualPriceIncrease);
  }
  const twentyFiveYearNetSavings = cumulativeSavings - input.totalPrice;

  // CO2 offset over 25 years
  const co2OffsetTons25yr = (estimatedAnnualProductionKwh * 25 * co2Intensity) / 1_000_000;

  return {
    estimatedAnnualProductionKwh: Math.round(estimatedAnnualProductionKwh),
    estimatedAnnualSavings: Math.round(estimatedAnnualSavings),
    monthlyEquivalentSavings: Math.round(monthlyEquivalentSavings),
    paybackPeriodYears: Math.round(paybackPeriodYears * 10) / 10,
    annualRoiPct: Math.round(annualRoiPct * 10) / 10,
    co2OffsetTons25yr: Math.round(co2OffsetTons25yr * 10) / 10,
    twentyFiveYearNetSavings: Math.round(twentyFiveYearNetSavings),
    currency,
  };
}

// Electricity prices by country (€/kWh, 2024 estimates)
export const ELECTRICITY_PRICES: Record<string, number> = {
  DE: 0.40,
  US: 0.16,
  ES: 0.28,
  FR: 0.25,
  UK: 0.24,
  AT: 0.35,
  CH: 0.32,
  NL: 0.38,
  IT: 0.30,
  PT: 0.22,
};

export function getElectricityPrice(countryCode: string): number {
  return ELECTRICITY_PRICES[countryCode.toUpperCase()] ?? 0.25;
}
