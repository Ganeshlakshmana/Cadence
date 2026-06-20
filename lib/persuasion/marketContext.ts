const marketContextBlocks: Record<string, string> = {
  DE: `GERMAN MARKET CONTEXT (2024-2026):
- Post-2022 energy crisis: gas prices spiked 4x, public consciousness of energy dependence high
- Energiewende narrative is mainstream — independence from grid framing resonates
- EEG feed-in tariff currently 8.2 cents/kWh for systems under 10kW
- Battery storage subsidies vary by Bundesland — check local KfW programs
- Average German household electricity price: 40 cents/kWh, rising 3-5% annually
- Customer concerns often: roof aesthetics, neighborhood reactions, insurance
- Decision pace: typically slower than US, expect 4-8 weeks from quote to signature
- Trust drivers: TÜV certification, German manufacturer panels (SMA, Solarwatt), local installer reputation`,

  US: `US MARKET CONTEXT (2024-2026):
- Federal Investment Tax Credit (ITC): 30% of system cost deductible — must be emphasized
- Net metering policies vary by state — confirm local utility rules before quoting
- Average US household electricity price: 16 cents/kWh, rising 4-6% annually in most regions
- Inflation Reduction Act extended solar incentives through 2032
- Customer concerns often: roof age/condition, HOA restrictions, credit score for financing
- Decision pace: faster than EU — 2-4 weeks common for motivated buyers
- Trust drivers: NABCEP certification, local installer reviews on Google/Yelp, manufacturer warranty`,

  ES: `SPANISH MARKET CONTEXT (2024-2026):
- Autoconsumo legislation since 2018 fully legalized self-consumption — removed "sun tax"
- Average Spanish household electricity price: 28 cents/kWh (volatile, regulated tariff)
- Net-billing credits available for surplus energy fed to grid
- Strong solar resource: Seville averages 1,900+ kWh/m²/year
- IVA (VAT) reduced to 10% on solar installations in most autonomous communities
- Customer concerns often: tramitación (paperwork with utilities), aesthetics on traditional homes
- Decision pace: moderate, 3-6 weeks typical`,

  FR: `FRENCH MARKET CONTEXT (2024-2026):
- MaPrimeRénov' subsidy available for solar installations — check current rates
- EDF obligé purchase obligation for systems under 100kW at set tariff (~13 cents/kWh)
- Average French household electricity price: 25 cents/kWh (regulated by CRE)
- TVA (VAT) reduced to 10% for residential solar systems
- Autoconsommation collective model gaining traction in France
- Customer concerns often: EDF contracts, roof orientation on traditional French architecture, administrative complexity
- Decision pace: 4-8 weeks typical, administrative paperwork adds time`,

  UK: `UK MARKET CONTEXT (2024-2026):
- Smart Export Guarantee (SEG): export tariffs from 3-15p/kWh depending on retailer
- Average UK household electricity price: 24p/kWh (post-2022 price cap era)
- 0% VAT on solar panels and batteries since April 2022 (extended)
- Consumer confidence recovering after 2022-2023 energy crisis
- Customer concerns often: planning permission on listed buildings or conservation areas, roof condition
- Decision pace: 3-6 weeks typical`,
};

export function getMarketContext(countryCode: string): string {
  return marketContextBlocks[countryCode.toUpperCase()]
    ?? `MARKET CONTEXT (${countryCode}):
- Local market framing not yet configured for this country code.
- Focus on universal solar benefits: energy independence, long-term savings, environmental impact.`;
}

export function getMarketContextKey(countryCode: string): string {
  const keys: Record<string, string> = {
    DE: 'DE_energiewende_2024',
    US: 'US_ITC_30pct_2024',
    ES: 'ES_autoconsumo_2024',
    FR: 'FR_maprimereno_2024',
    UK: 'UK_SEG_2024',
  };
  return keys[countryCode.toUpperCase()] ?? `${countryCode}_generic`;
}
