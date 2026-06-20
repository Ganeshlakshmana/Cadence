import { anthropic, SONNET } from './client';
import { CoachingNoteSchema, type CoachingNote, type ReplaySimulation } from './schemas';
import { COACHING_MODE_SYSTEM } from './prompts';

const COACHING_NOTE_TOOL = {
  name: 'generate_coaching_note',
  description: 'Return a short coaching note for the sales rep based on the simulated journey.',
  input_schema: {
    type: 'object' as const,
    properties: {
      whatWorked: { type: 'string' },
      whatToTryNext: { type: 'string' },
      oneQuestionToAsk: { type: 'string' },
      overallReadiness: { type: 'string', enum: ['close_today', 'one_more_touch', 'needs_rescue', 'likely_lost'] },
    },
    required: ['whatWorked', 'whatToTryNext', 'oneQuestionToAsk', 'overallReadiness'],
  },
};

interface CoachingModeInput {
  customerFirstName: string;
  archetypeBlend: { family: number; investor: number; environmentalist: number; skeptic: number };
  replaySimulation: ReplaySimulation;
}

export async function generateCoachingNote(input: CoachingModeInput): Promise<CoachingNote> {
  const userPrompt = `CUSTOMER: ${input.customerFirstName}
ARCHETYPE: ${Math.round(input.archetypeBlend.family * 100)}% Family, ${Math.round(input.archetypeBlend.investor * 100)}% Investor, ${Math.round(input.archetypeBlend.environmentalist * 100)}% Environmentalist, ${Math.round(input.archetypeBlend.skeptic * 100)}% Skeptic

SIMULATED JOURNEY:
${input.replaySimulation.simulatedResponses.map(r =>
  `  Touch ${r.touchSequenceIndex} (day ${r.occurredDayOffset}): ${r.responseType} — ${r.responseSummary}`
).join('\n')}

PREDICTED OUTCOME: ${input.replaySimulation.predictedOutcome} (${Math.round(input.replaySimulation.predictedCloseProbability * 100)}% probability)
CRITICAL MOMENT: Touch ${input.replaySimulation.criticalMomentTouchIndex} — ${input.replaySimulation.criticalMomentDescription}

Generate the coaching note.`;

  const call = async (strictMode = false): Promise<CoachingNote> => {
    const systemPrompt = strictMode
      ? COACHING_MODE_SYSTEM + '\n\nCRITICAL: Previous attempt failed validation. Use the tool exactly.'
      : COACHING_MODE_SYSTEM;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [COACHING_NOTE_TOOL],
      tool_choice: { type: 'tool', name: 'generate_coaching_note' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Coaching mode: no tool_use block in response');
    }

    return CoachingNoteSchema.parse(block.input);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Coaching mode failed validation, retrying:', err);
    return await call(true);
  }
}
