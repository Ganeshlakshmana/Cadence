import { anthropic, SONNET } from './client';
import { RescueTouchSchema, type RescueTouch } from './schemas';
import { RESCUE_INSERT_SYSTEM } from './prompts';

const RESCUE_INSERT_TOOL = {
  name: 'generate_rescue_touch',
  description: 'Return a single rescue touchpoint and a one-sentence rationale for the installer.',
  input_schema: {
    type: 'object' as const,
    properties: {
      touch: {
        type: 'object',
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
      rationale: { type: 'string' },
    },
    required: ['touch', 'rationale'],
  },
};

interface RescueInsertInput {
  customerFirstName: string;
  postalCode: string;
  ghostRiskScore: number;
  ghostRiskSignals: string[];
  existingTouchCount: number;
  preferredLanguage: string;
  formalityRegister: string;
}

export async function generateRescueInsert(input: RescueInsertInput): Promise<RescueTouch> {
  const userPrompt = `CUSTOMER: ${input.customerFirstName}
Postal code: ${input.postalCode}
Language: ${input.preferredLanguage} (${input.formalityRegister})
Ghost risk score: ${input.ghostRiskScore.toFixed(2)}
Ghost risk signals: ${input.ghostRiskSignals.join(', ')}
Current sequence has ${input.existingTouchCount} touches.`;

  const call = async (strictMode = false): Promise<RescueTouch> => {
    const systemPrompt = strictMode
      ? RESCUE_INSERT_SYSTEM + '\n\nCRITICAL: Previous attempt failed validation. Use the tool exactly.'
      : RESCUE_INSERT_SYSTEM;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 2048,
      system: systemPrompt,
      tools: [RESCUE_INSERT_TOOL],
      tool_choice: { type: 'tool', name: 'generate_rescue_touch' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Rescue insert: no tool_use block in response');
    }

    return RescueTouchSchema.parse(block.input);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Rescue insert failed validation, retrying:', err);
    return await call(true);
  }
}
