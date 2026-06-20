export interface Objection {
  id: string;
  label: string;
  archetype: 'family' | 'investor' | 'environmentalist' | 'skeptic' | 'universal';
  responseApproach: string;
  keyPoints: string[];
}

export const OBJECTION_LIBRARY: Objection[] = [
  {
    id: 'price_too_high',
    label: 'The price is too high',
    archetype: 'investor',
    responseApproach: 'Reframe as investment, not expense. Show 25-year total value vs upfront cost.',
    keyPoints: [
      'Monthly payment vs monthly savings comparison',
      'System pays for itself in X years, then profit',
      'Financing options that flip it to cash-flow positive month 1',
    ],
  },
  {
    id: 'payback_too_long',
    label: 'Payback period is too long',
    archetype: 'investor',
    responseApproach: 'Contextualize against alternatives. Solar ROI vs savings account, bond returns.',
    keyPoints: [
      'Rising electricity prices accelerate payback',
      'Hard asset that adds to property value',
      'Battery storage adds resilience value beyond ROI',
    ],
  },
  {
    id: 'worried_about_scam',
    label: 'Is this a scam / are you legitimate?',
    archetype: 'skeptic',
    responseApproach: 'Proof without pressure. Third-party validation first, no urgency.',
    keyPoints: [
      'Share certifications (TÜV, NABCEP, local trade body)',
      'Local customer references in same postal code',
      'Online reviews with verifiable profiles',
      'Physical address and phone number upfront',
    ],
  },
  {
    id: 'roof_damage',
    label: 'Worried about roof damage during installation',
    archetype: 'family',
    responseApproach: 'Walk through installation process, show warranty covers roof penetrations.',
    keyPoints: [
      'Modern rail systems minimize penetrations',
      'Roofer and solar warranty covers any installation damage',
      'Post-install roof inspection included',
    ],
  },
  {
    id: 'winter_performance',
    label: 'Will it work in winter / cloudy weather?',
    archetype: 'skeptic',
    responseApproach: 'Show real annual production data, not just summer peak.',
    keyPoints: [
      'Annual production accounts for all weather',
      'PVGIS data shows actual regional average output',
      'Modern panels work in diffuse light, not just direct sun',
    ],
  },
  {
    id: 'aesthetics',
    label: 'Will it look ugly on my roof?',
    archetype: 'family',
    responseApproach: 'Modern panel aesthetics, before/after photos from local installs.',
    keyPoints: [
      'All-black panels available',
      'Low-profile mounting blends with roof line',
      'Neighbor photos from same housing type',
    ],
  },
  {
    id: 'comparing_competitor',
    label: 'I got a cheaper quote from a competitor',
    archetype: 'investor',
    responseApproach: 'Fair comparison, not disparagement. Focus on differentiators.',
    keyPoints: [
      'Compare panel brand quality and efficiency',
      'Warranty terms: product + performance + workmanship',
      'Post-install support and monitoring',
      'Local installer vs national chain service model',
    ],
  },
  {
    id: 'need_to_discuss_spouse',
    label: 'Need to discuss with spouse / partner',
    archetype: 'family',
    responseApproach: 'Make it easy to share. Provide shareable summary, offer joint call.',
    keyPoints: [
      'Proposal microsite link for easy sharing',
      'Offer to schedule a joint call with both partners',
      'No-pressure timeline',
    ],
  },
  {
    id: 'grid_tied_reliability',
    label: 'What happens during a power outage?',
    archetype: 'family',
    responseApproach: 'Explain battery storage option. Grid-tied clarification.',
    keyPoints: [
      'Battery storage adds resilience',
      'Grid-tied systems shut off during outage (safety)',
      'Battery + solar = full home backup capability',
    ],
  },
  {
    id: 'co2_impact_real',
    label: 'Will this actually make a difference for the climate?',
    archetype: 'environmentalist',
    responseApproach: 'Show real CO2 numbers. Contextualize against relatable equivalents.',
    keyPoints: [
      'X tons CO2 offset over 25 years = Y cars off road',
      'German/EU electricity grid carbon intensity',
      'Combined with EV charging: full household decarbonization',
    ],
  },
];

export function findObjectionsForArchetype(archetype: string): Objection[] {
  return OBJECTION_LIBRARY.filter(o => o.archetype === archetype || o.archetype === 'universal');
}
