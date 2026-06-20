type Tone = 'reassuring' | 'data_driven' | 'impact' | 'objection_handling' | 'urgency' | 'social_proof';
type Channel = 'email' | 'sms' | 'whatsapp_text' | 'whatsapp_voice' | 'call' | 'video' | 'microsite' | 'postcard' | 'linkedin' | 'in_person';
type ArchetypeKey = 'family' | 'investor' | 'environmentalist' | 'skeptic';
type SequencePosition = 'early' | 'mid' | 'close';

interface ToneRecommendation {
  tone: Tone;
  channels: Channel[];
  rationale: string;
}

const TONE_MATRIX: Record<ArchetypeKey, Record<SequencePosition, ToneRecommendation>> = {
  family: {
    early: {
      tone: 'reassuring',
      channels: ['email', 'whatsapp_voice'],
      rationale: 'Family-dominant customers need comfort and trust before anything else',
    },
    mid: {
      tone: 'social_proof',
      channels: ['postcard', 'sms', 'call'],
      rationale: 'Neighbor success stories resonate strongly with family archetype',
    },
    close: {
      tone: 'reassuring',
      channels: ['call', 'in_person'],
      rationale: 'Close with personal reassurance, not urgency — family hates pressure',
    },
  },
  investor: {
    early: {
      tone: 'data_driven',
      channels: ['email', 'microsite'],
      rationale: 'Investor archetype needs hard ROI numbers immediately',
    },
    mid: {
      tone: 'data_driven',
      channels: ['email', 'linkedin'],
      rationale: 'Reinforce financial case with comparison tables',
    },
    close: {
      tone: 'urgency',
      channels: ['email', 'sms'],
      rationale: 'Investor responds to real incentive deadlines — use if applicable',
    },
  },
  environmentalist: {
    early: {
      tone: 'impact',
      channels: ['email', 'video'],
      rationale: 'Lead with CO2 story and community impact narrative',
    },
    mid: {
      tone: 'social_proof',
      channels: ['microsite', 'postcard'],
      rationale: 'Show other community members who have made the transition',
    },
    close: {
      tone: 'impact',
      channels: ['email', 'whatsapp_text'],
      rationale: 'Close with legacy framing, not price urgency',
    },
  },
  skeptic: {
    early: {
      tone: 'objection_handling',
      channels: ['email', 'postcard'],
      rationale: 'Skeptics need proof and validation before they will engage verbally',
    },
    mid: {
      tone: 'social_proof',
      channels: ['email', 'call'],
      rationale: 'Third-party reviews and references, offered on mid-sequence after trust built',
    },
    close: {
      tone: 'reassuring',
      channels: ['in_person', 'call'],
      rationale: 'Skeptic closes with personal connection, never pressure',
    },
  },
};

export function getToneRecommendation(
  archetype: ArchetypeKey,
  position: SequencePosition,
): ToneRecommendation {
  return TONE_MATRIX[archetype][position];
}

export function channelIsAppropriateForTone(channel: Channel, tone: Tone): boolean {
  const inappropriatePairs: Array<[Channel, Tone]> = [
    ['sms', 'objection_handling'],
    ['postcard', 'urgency'],
    ['linkedin', 'urgency'],
  ];
  return !inappropriatePairs.some(([c, t]) => c === channel && t === tone);
}
