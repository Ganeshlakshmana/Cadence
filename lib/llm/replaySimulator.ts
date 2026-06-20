import { anthropic, SONNET } from './client';
import { ReplaySimulationSchema, type ReplaySimulation, type Strategy } from './schemas';
import { REPLAY_SIMULATOR_SYSTEM } from './prompts';
import { unwrapArrayFields } from './toolInput';

const REPLAY_SIM_TOOL = {
  name: 'simulate_replay',
  description: 'Return simulated customer responses to each touchpoint and a predicted outcome.',
  input_schema: {
    type: 'object' as const,
    properties: {
      simulatedResponses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            touchSequenceIndex: { type: 'integer' },
            responseType: { type: 'string', enum: ['opened_not_clicked', 'clicked_no_reply', 'replied_positive', 'replied_objection', 'replied_question', 'ignored', 'call_answered', 'call_voicemail', 'booked_meeting', 'unsubscribed'] },
            responseSummary: { type: 'string' },
            responseFullText: { type: ['string', 'null'] },
            sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'objection', 'ready_to_buy'] },
            occurredDayOffset: { type: 'integer' },
          },
          required: ['touchSequenceIndex', 'responseType', 'responseSummary', 'responseFullText', 'sentiment', 'occurredDayOffset'],
        },
      },
      predictedOutcome: { type: 'string', enum: ['closed_won', 'closed_lost', 'still_engaged_at_day_30', 'ghosted'] },
      predictedCloseProbability: { type: 'number', minimum: 0, maximum: 1 },
      criticalMomentTouchIndex: { type: 'integer' },
      criticalMomentDescription: { type: 'string' },
    },
    required: ['simulatedResponses', 'predictedOutcome', 'predictedCloseProbability', 'criticalMomentTouchIndex', 'criticalMomentDescription'],
  },
};

interface ReplaySimulatorInput {
  customerFirstName: string;
  preferredLanguage: string;
  formalityRegister: string;
  archetypeBlend: { family: number; investor: number; environmentalist: number; skeptic: number };
  topObjections: string[];
  decisionTimeline: string;
  strategy: Strategy;
}

export async function simulateReplay(input: ReplaySimulatorInput): Promise<ReplaySimulation> {
  const userPrompt = `CUSTOMER: ${input.customerFirstName}
Language: ${input.preferredLanguage} (${input.formalityRegister})
Archetype: ${Math.round(input.archetypeBlend.family * 100)}% Family, ${Math.round(input.archetypeBlend.investor * 100)}% Investor, ${Math.round(input.archetypeBlend.environmentalist * 100)}% Environmentalist, ${Math.round(input.archetypeBlend.skeptic * 100)}% Skeptic
Decision timeline: ${input.decisionTimeline}
Top objections: ${input.topObjections.join(', ')}

PLANNED SEQUENCE (${input.strategy.touches.length} touches):
${input.strategy.touches.map(t =>
  `  Touch ${t.sequenceIndex} (day ${t.dayOffset}): [${t.channel}] ${t.tone} — ${t.objective}`
).join('\n')}

Overall strategy arc: ${input.strategy.rationaleSummary}

Simulate how ${input.customerFirstName} would respond to each touchpoint. Be realistic — ghost rate ~40%.`;

  const call = async (strictMode = false): Promise<ReplaySimulation> => {
    const systemPrompt = strictMode
      ? REPLAY_SIMULATOR_SYSTEM + '\n\nCRITICAL: Return ONLY valid JSON via the tool. Use the tool exactly.'
      : REPLAY_SIMULATOR_SYSTEM;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [REPLAY_SIM_TOOL],
      tool_choice: { type: 'tool', name: 'simulate_replay' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('Replay simulator: no tool_use block in response');

    const inp = unwrapArrayFields(block.input as Record<string, unknown>, ['simulatedResponses']);
    return ReplaySimulationSchema.parse(inp);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Replay simulation failed validation, retrying:', err);
    try {
      return await call(true);
    } catch (retryErr) {
      throw new Error(`Replay simulation failed after retry: ${retryErr}`);
    }
  }
}
