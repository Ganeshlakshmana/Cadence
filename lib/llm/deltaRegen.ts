import { anthropic, SONNET } from './client';
import { DeltaRegenSchema, type DeltaRegen } from './schemas';
import { DELTA_REGEN_SYSTEM, deltaRegenUserPrompt } from './prompts';

const VALID_CHANNELS = ['email', 'sms', 'whatsapp_text', 'whatsapp_voice', 'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person'];
const VALID_TONES = ['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof'];

const TOUCH_SCHEMA = {
  type: 'object',
  properties: {
    sequenceIndex: { type: 'integer' },
    dayOffset: { type: 'integer', minimum: 0, maximum: 30 },
    channel: { type: 'string', enum: VALID_CHANNELS },
    tone: { type: 'string', enum: VALID_TONES },
    objective: { type: 'string', maxLength: 80 },
    reasoning: {
      type: 'string',
      minLength: 10,
      maxLength: 300,
      description: 'Complete sentence citing specific archetype % and specific quote number. Max 300 chars.',
    },
    contentSubject: { type: ['string', 'null'] },
    contentBody: { type: 'string' },
    contentVariantB: { type: ['string', 'null'] },
    abTestActive: { type: 'boolean' },
  },
  required: ['sequenceIndex', 'dayOffset', 'channel', 'tone', 'objective', 'reasoning', 'contentSubject', 'contentBody', 'contentVariantB', 'abTestActive'],
};

const DELTA_REGEN_TOOL = {
  name: 'regenerate_strategy',
  description: 'Return the modified strategy and a log of every change made.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rationaleSummary: { type: 'string' },
      marketContextApplied: { type: 'string' },
      touches: {
        type: 'array',
        minItems: 5,
        maxItems: 9,
        items: TOUCH_SCHEMA,
      },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            touchIndex: { type: 'integer' },
            changeType: { type: 'string', enum: ['modified', 'added', 'removed', 'rescheduled', 'channel_changed', 'tone_changed'] },
            summary: { type: 'string' },
            before: { type: ['string', 'null'] },
            after: { type: ['string', 'null'] },
          },
          required: ['touchIndex', 'changeType', 'summary', 'before', 'after'],
        },
      },
    },
    required: ['rationaleSummary', 'marketContextApplied', 'touches', 'changes'],
  },
};

interface DeltaRegenInput {
  currentStrategy: object;
  installerFreeTextInstruction: string;
  customerContextBlock: string;
}

export async function regenDelta(input: DeltaRegenInput): Promise<DeltaRegen> {
  const userPrompt = deltaRegenUserPrompt({
    currentStrategyJson: JSON.stringify(input.currentStrategy, null, 2),
    installerFreeTextInstruction: input.installerFreeTextInstruction,
    customerContextBlock: input.customerContextBlock,
  });

  const call = async (strictMode = false): Promise<DeltaRegen> => {
    const systemPrompt = strictMode
      ? DELTA_REGEN_SYSTEM + '\n\nCRITICAL: Previous attempt failed Zod validation. Every reasoning must be ≤300 chars, complete sentence citing archetype % and quote number. Use the tool exactly.'
      : DELTA_REGEN_SYSTEM;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 16000,
      system: systemPrompt,
      tools: [DELTA_REGEN_TOOL],
      tool_choice: { type: 'tool', name: 'regenerate_strategy' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Delta regen: no tool_use block in response');
    }

    return DeltaRegenSchema.parse(block.input);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Delta regen failed validation, retrying:', err);
    try {
      return await call(true);
    } catch (retryErr) {
      throw new Error(`Delta regen failed after retry: ${retryErr}`);
    }
  }
}
