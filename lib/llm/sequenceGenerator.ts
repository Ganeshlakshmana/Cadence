import { anthropic, SONNET } from './client';
import { StrategySchema, type Strategy } from './schemas';
import { SEQUENCE_GENERATION_SYSTEM, sequenceGenerationUserPrompt } from './prompts';

const VALID_CHANNELS = ['email', 'sms', 'whatsapp_text', 'whatsapp_voice', 'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person'];
const VALID_TONES = ['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof'];

const STRATEGY_TOOL = {
  name: 'generate_strategy',
  description: 'Return the complete multi-touch sales sequence strategy as structured data.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rationaleSummary: {
        type: 'string',
        description: '2-3 sentences explaining the overall sequence arc to the installer.',
      },
      marketContextApplied: { type: 'string' },
      touches: {
        type: 'array',
        minItems: 5,
        maxItems: 9,
        items: {
          type: 'object',
          properties: {
            sequenceIndex: { type: 'integer' },
            dayOffset: { type: 'integer', minimum: 0, maximum: 30 },
            channel: { type: 'string', enum: [...VALID_CHANNELS] },
            tone: { type: 'string', enum: [...VALID_TONES] },
            objective: { type: 'string', maxLength: 80 },
            reasoning: {
              type: 'string',
              minLength: 10,
              maxLength: 300,
              description: 'Complete sentence citing specific archetype % (e.g. "40% family") AND specific quote number (e.g. "€130/month"). Max 300 chars.',
            },
            contentSubject: { type: ['string', 'null'] },
            contentBody: { type: 'string' },
            contentVariantB: { type: ['string', 'null'] },
            abTestActive: { type: 'boolean' },
          },
          required: ['sequenceIndex', 'dayOffset', 'channel', 'tone', 'objective', 'reasoning', 'contentSubject', 'contentBody', 'contentVariantB', 'abTestActive'],
        },
      },
    },
    required: ['rationaleSummary', 'marketContextApplied', 'touches'],
  },
};

interface SequenceGeneratorInput {
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  formalityRegister: string;
  countryCode: string;
  city: string;
  postalCode: string;
  solarIrradianceKwhM2Year: number;
  archetypeFamily: number;
  archetypeInvestor: number;
  archetypeEnvironmentalist: number;
  archetypeSkeptic: number;
  customerVerbatimPhrases: string[];
  statedMotivations: string[];
  topObjections: string[];
  decisionTimeline: string;
  competitorMentioned: boolean;
  competitorNames: string[];
  systemSizeKw: number;
  panelCount: number;
  currency: string;
  totalPrice: number;
  monthlyEquivalentSavings: number;
  paybackPeriodYears: number;
  annualRoiPct: number;
  co2OffsetTons25yr: number;
  marketContextBlock: string;
}

export async function generateSequence(input: SequenceGeneratorInput): Promise<Strategy> {
  const userPrompt = sequenceGenerationUserPrompt(input);

  const call = async (strictMode = false): Promise<Strategy> => {
    const systemPrompt = strictMode
      ? SEQUENCE_GENERATION_SYSTEM + '\n\nCRITICAL: Previous attempt failed Zod validation. Every reasoning must be ≤300 chars, a complete sentence citing archetype % and quote number. Use the tool exactly.'
      : SEQUENCE_GENERATION_SYSTEM;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 16000,
      system: systemPrompt,
      tools: [STRATEGY_TOOL],
      tool_choice: { type: 'tool', name: 'generate_strategy' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Sequence generator: no tool_use block in response');
    }

    return StrategySchema.parse(block.input);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Sequence generation failed validation, retrying with strict mode:', err);
    try {
      return await call(true);
    } catch (retryErr) {
      throw new Error(`Sequence generation failed after retry: ${retryErr}`);
    }
  }
}
