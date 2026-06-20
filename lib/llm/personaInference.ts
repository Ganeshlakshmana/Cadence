import { zodResponseFormat } from 'openai/helpers/zod';
import { openai, OPENAI_PROFILING_MODEL } from './client';
import { PersonaInferenceSchema, type PersonaInference } from './schemas';
import { PERSONA_INFERENCE_SYSTEM, personaInferenceUserPrompt } from './prompts';

interface PersonaInferenceInput {
  notes: string;
  systemSizeKw: number;
  panelCount: number;
  batteryIncluded: boolean;
  currency: string;
  totalPrice: number;
  estimatedAnnualSavings: number;
  paybackPeriodYears: number;
  co2OffsetTons25yr: number;
}

export async function inferPersona(input: PersonaInferenceInput): Promise<PersonaInference> {
  const userContent = personaInferenceUserPrompt(input);

  const call = async (strictMode = false): Promise<PersonaInference> => {
    const systemContent = strictMode
      ? PERSONA_INFERENCE_SYSTEM + '\n\nCRITICAL: Previous output failed schema validation. Return ONLY strictly valid JSON matching the schema exactly.'
      : PERSONA_INFERENCE_SYSTEM;

    // openai v6: parse() is on chat.completions directly (graduated from beta)
    const response = await openai.chat.completions.parse({
      model: OPENAI_PROFILING_MODEL,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      response_format: zodResponseFormat(PersonaInferenceSchema, 'persona_inference'),
    });

    const parsed = response.choices[0].message.parsed;
    if (!parsed) throw new Error('OpenAI returned null parsed result for persona inference');

    // Re-validate with Zod to enforce min/max constraints JSON Schema layer skips
    return PersonaInferenceSchema.parse(parsed);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Persona inference failed, retrying with strict mode:', err);
    try {
      return await call(true);
    } catch (retryErr) {
      throw new Error(`Persona inference failed after retry: ${retryErr}`);
    }
  }
}
