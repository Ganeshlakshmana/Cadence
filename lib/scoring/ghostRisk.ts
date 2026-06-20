interface GhostRiskInput {
  decisionTimeline: string;
  archetypeSkeptic: number;
  competitorMentioned: boolean;
  daysSinceLastTouch: number;
  touchesWithNoResponse: number;
  totalTouches: number;
  hasStatedObjection: boolean;
  objectionAddressed: boolean;
}

export interface GhostRiskResult {
  score: number; // 0.0 (low risk) to 1.0 (high risk)
  signals: string[];
  recommendation: 'on_track' | 'watch' | 'rescue_needed';
}

export function calculateGhostRisk(input: GhostRiskInput): GhostRiskResult {
  let score = 0;
  const signals: string[] = [];

  // Decision timeline risk
  if (input.decisionTimeline === 'exploring') {
    score += 0.25;
    signals.push('Customer is in exploratory mode — no firm timeline');
  }

  // High skeptic weight increases ghost risk
  if (input.archetypeSkeptic > 0.3) {
    score += input.archetypeSkeptic * 0.3;
    signals.push(`Skeptic archetype at ${Math.round(input.archetypeSkeptic * 100)}% — historically higher ghost rate`);
  }

  // Competitor mention = comparison shopping = higher ghost risk
  if (input.competitorMentioned) {
    score += 0.15;
    signals.push('Competitor mentioned — customer is actively comparison shopping');
  }

  // Days since last touch
  if (input.daysSinceLastTouch > 7) {
    score += Math.min((input.daysSinceLastTouch - 7) * 0.04, 0.25);
    signals.push(`${input.daysSinceLastTouch} days since last touch — engagement cooling`);
  }

  // No-response rate
  const noResponseRate = input.totalTouches > 0
    ? input.touchesWithNoResponse / input.totalTouches
    : 0;

  if (noResponseRate > 0.5) {
    score += noResponseRate * 0.25;
    signals.push(`${Math.round(noResponseRate * 100)}% of touches ignored — low engagement`);
  }

  // Unaddressed objection = major risk
  if (input.hasStatedObjection && !input.objectionAddressed) {
    score += 0.20;
    signals.push('Customer stated objection has not been addressed in sequence');
  }

  // Cap at 1.0
  score = Math.min(score, 1.0);

  const recommendation =
    score >= 0.6 ? 'rescue_needed' :
    score >= 0.35 ? 'watch' :
    'on_track';

  return { score, signals, recommendation };
}
