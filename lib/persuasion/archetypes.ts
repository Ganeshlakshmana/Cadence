export const ARCHETYPES = {
  family: {
    label: 'Family',
    description: 'Prioritizes stability, no surprises, predictability, warranty, peace of mind',
    triggers: ['stability', 'reliability', 'peace of mind', 'protect family', 'no surprises', 'warranty'],
    avoidTriggers: ['speculation', 'risk', 'uncertain', 'experimental'],
    preferredChannels: ['email', 'whatsapp_voice', 'call'],
    preferredTones: ['reassuring', 'social_proof'],
  },
  investor: {
    label: 'Investor',
    description: 'Prioritizes hard ROI numbers, payback period, returns vs alternatives',
    triggers: ['ROI', 'payback', 'returns', 'IRR', 'annual savings', 'vs ETF', 'inflation hedge'],
    avoidTriggers: ['feeling', 'emotion', 'community', 'story'],
    preferredChannels: ['email', 'microsite', 'linkedin'],
    preferredTones: ['data_driven', 'urgency'],
  },
  environmentalist: {
    label: 'Environmentalist',
    description: 'Prioritizes climate impact, CO2 offset, legacy, community',
    triggers: ['CO2', 'climate', 'planet', 'legacy', 'children', 'community', 'clean energy'],
    avoidTriggers: ['price urgency', 'financial pressure', 'limited time'],
    preferredChannels: ['email', 'video', 'microsite'],
    preferredTones: ['impact', 'social_proof'],
  },
  skeptic: {
    label: 'Skeptic',
    description: 'Prioritizes objection handling, proof, third-party validation, fears being scammed',
    triggers: ['proof', 'reviews', 'TÜV', 'certification', 'guarantee', 'references', 'third-party'],
    avoidTriggers: ['pressure', 'urgency', 'limited offer', 'act now'],
    preferredChannels: ['email', 'postcard', 'call'],
    preferredTones: ['objection_handling', 'social_proof'],
    delayCall: true, // No calls before day 10
  },
} as const;

export type ArchetypeKey = keyof typeof ARCHETYPES;
export type ArchetypeBlend = Record<ArchetypeKey, number>;

export function dominantArchetype(blend: ArchetypeBlend): ArchetypeKey {
  return (Object.entries(blend) as [ArchetypeKey, number][])
    .sort(([, a], [, b]) => b - a)[0][0];
}

export function formatBlendLabel(blend: ArchetypeBlend): string {
  return (Object.entries(blend) as [ArchetypeKey, number][])
    .filter(([, v]) => v > 0.05)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `${Math.round(v * 100)}% ${ARCHETYPES[k].label}`)
    .join(', ');
}
