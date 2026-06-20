import { anthropic, SONNET } from './client';
import { CompetitiveTouchSchema, type CompetitiveTouch } from './schemas';
import { COMPETITIVE_DISPLACEMENT_SYSTEM } from './prompts';

const COMPETITIVE_TOUCH_TOOL = {
  name: 'generate_competitive_touch',
  description: 'Return a single fair competitor-comparison touchpoint.',
  input_schema: {
    type: 'object' as const,
    properties: {
      dayOffset: { type: 'integer', minimum: 0, maximum: 30 },
      channel: { type: 'string', enum: ['email', 'sms', 'whatsapp_text', 'whatsapp_voice', 'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person'] },
      tone: { type: 'string', enum: ['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof'] },
      objective: { type: 'string', maxLength: 80 },
      reasoning: { type: 'string', minLength: 50, maxLength: 300 },
      contentSubject: { type: ['string', 'null'] },
      contentBody: { type: 'string' },
      contentVariantB: { type: ['string', 'null'] },
      abTestActive: { type: 'boolean' },
    },
    required: ['dayOffset', 'channel', 'tone', 'objective', 'reasoning', 'contentSubject', 'contentBody', 'contentVariantB', 'abTestActive'],
  },
};

interface CompetitiveDisplacementInput {
  competitorNames: string[];
  customerFirstName: string;
  preferredLanguage: string;
  formalityRegister: string;
  currency: string;
  totalPrice: number;
  dayOffset: number;
}

export async function generateCompetitiveDisplacement(input: CompetitiveDisplacementInput): Promise<CompetitiveTouch> {
  const userPrompt = `Customer: ${input.customerFirstName}
Language: ${input.preferredLanguage} (${input.formalityRegister})
Competitor(s) mentioned: ${input.competitorNames.join(', ')}
Our quote total: ${input.currency}${input.totalPrice.toLocaleString()}
Recommended day offset for this touch: ${input.dayOffset}

Generate a fair side-by-side comparison touchpoint.`;

  const call = async (strictMode = false): Promise<CompetitiveTouch> => {
    const systemPrompt = strictMode
      ? COMPETITIVE_DISPLACEMENT_SYSTEM + '\n\nCRITICAL: Previous attempt failed validation. Use the tool exactly.'
      : COMPETITIVE_DISPLACEMENT_SYSTEM;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 2048,
      system: systemPrompt,
      tools: [COMPETITIVE_TOUCH_TOOL],
      tool_choice: { type: 'tool', name: 'generate_competitive_touch' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Competitive displacement: no tool_use block in response');
    }

    return CompetitiveTouchSchema.parse(block.input);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Competitive displacement failed validation, retrying:', err);
    return await call(true);
  }
}
