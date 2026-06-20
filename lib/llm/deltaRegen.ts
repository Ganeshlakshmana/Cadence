import { anthropic, SONNET } from './client';
import { DeltaRegenSchema, type DeltaRegen } from './schemas';
import { DELTA_REGEN_SYSTEM, deltaRegenUserPrompt } from './prompts';
import { unwrapArrayFields } from './toolInput';

const VALID_CHANNELS = ['email', 'sms', 'whatsapp_text', 'whatsapp_voice', 'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person'];
const VALID_TONES = ['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof'];

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
        description: 'Return as a real JSON array of objects — NOT as a JSON-encoded string.',
        items: {
          type: 'object',
          properties: {
            sequenceIndex: { type: 'integer' },
            dayOffset: { type: 'integer', minimum: 0, maximum: 30 },
            channel: { type: 'string', enum: VALID_CHANNELS },
            tone: { type: 'string', enum: VALID_TONES },
            objective: { type: 'string', maxLength: 80 },
            reasoning: { type: 'string', minLength: 10, maxLength: 300, description: 'Complete sentence citing specific archetype % AND specific quote number. Max 300 chars.' },
            contentSubject: { type: ['string', 'null'] },
            contentBody: { type: 'string', description: 'Customer-language message body. Do NOT use double-quote characters (") inside this value — use „..." or single quotes instead.' },
            contentVariantB: { type: ['string', 'null'], description: 'A/B variant body or null. Do NOT use double-quote characters (") inside this value.' },
            abTestActive: { type: 'boolean' },
          },
          required: ['sequenceIndex', 'dayOffset', 'channel', 'tone', 'objective', 'reasoning', 'contentSubject', 'contentBody', 'contentVariantB', 'abTestActive'],
        },
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
      ? DELTA_REGEN_SYSTEM + '\n\nCRITICAL: Previous output failed JSON validation. Use the tool exactly. reasoning ≤300 chars per touch.'
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
    if (!block || block.type !== 'tool_use') throw new Error('Delta regen: no tool_use block in response');

    const inp = unwrapArrayFields(block.input as Record<string, unknown>, ['touches', 'changes']);
    return DeltaRegenSchema.parse(inp);
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
