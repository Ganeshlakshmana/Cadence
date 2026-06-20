interface CloseReadinessInput {
  decisionTimeline: string;
  archetypeInvestor: number;
  inferenceConfidence: number;
  competitorMentioned: boolean;
  hasPositiveResponse: boolean;
  dayOffset: number;
  micrositeVisited: boolean;
  roiFramingPreference: string;
  statedMotivationsCount: number;
  topObjectionsCount: number;
}

export interface CloseReadinessResult {
  score: number; // 0.0 (not ready) to 1.0 (ready to close)
  signals: string[];
  recommendation: 'not_yet' | 'warming_up' | 'close_now';
}

export function calculateCloseReadiness(input: CloseReadinessInput): CloseReadinessResult {
  let score = 0;
  const signals: string[] = [];

  // Strong buying intent signals
  if (input.decisionTimeline === 'asap') {
    score += 0.30;
    signals.push('Customer indicated "asap" decision timeline');
  } else if (input.decisionTimeline === 'this_quarter') {
    score += 0.15;
    signals.push('Customer has a "this quarter" timeline — active buyer');
  }

  // Investor archetype with positive ROI framing = high readiness
  if (input.archetypeInvestor > 0.4 && input.roiFramingPreference !== 'co2_impact') {
    score += input.archetypeInvestor * 0.2;
    signals.push(`${Math.round(input.archetypeInvestor * 100)}% Investor archetype — responds to financial close arguments`);
  }

  // High inference confidence = cleaner profile
  if (input.inferenceConfidence > 0.8) {
    score += 0.10;
    signals.push('High persona confidence — sequence is well-targeted');
  }

  // Positive response in sequence = warm signal
  if (input.hasPositiveResponse) {
    score += 0.20;
    signals.push('Customer has given at least one positive response in the sequence');
  }

  // Microsite visited = deep interest
  if (input.micrositeVisited) {
    score += 0.15;
    signals.push('Customer visited proposal microsite — high engagement signal');
  }

  // Strong motivation set with few objections
  if (input.statedMotivationsCount >= 2 && input.topObjectionsCount <= 1) {
    score += 0.15;
    signals.push(`${input.statedMotivationsCount} stated motivations, only ${input.topObjectionsCount} objection(s) — clean close setup`);
  }

  // Competitor mention reduces readiness (still deciding)
  if (input.competitorMentioned) {
    score -= 0.10;
    signals.push('Competitor mentioned — not exclusively focused on us yet');
  }

  // Early in sequence = not ready yet
  if (input.dayOffset < 5) {
    score = Math.min(score, 0.4);
    signals.push('Early in sequence — too soon for close push');
  }

  score = Math.max(0, Math.min(score, 1.0));

  const recommendation =
    score >= 0.65 ? 'close_now' :
    score >= 0.35 ? 'warming_up' :
    'not_yet';

  return { score, signals, recommendation };
}
