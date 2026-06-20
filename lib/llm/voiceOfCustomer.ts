import { zodResponseFormat } from 'openai/helpers/zod';
import { openai, OPENAI_PROFILING_MODEL } from './client';
import { z } from 'zod';

const VoiceOfCustomerSchema = z.object({
  verbatimPhrases: z.array(z.string()).min(0).max(8),
});

const VOICE_OF_CUSTOMER_SYSTEM = `You are extracting verbatim emotional and motivational phrases from sales rep notes about a homeowner's solar consultation.

Extract the customer's exact wording (or close paraphrase removing identifying details) for:
- Emotional statements about family, values, fears
- Motivational statements about why they want solar
- Specific timeline or urgency language
- Concerns or objections in their own words

Max 8 phrases. Quality over quantity. Only include phrases with real personalization value.
Paraphrase only to remove names, addresses, or other PII.

Output ONLY valid JSON: { "verbatimPhrases": ["phrase1", "phrase2", ...] }`;

export async function extractVerbatimPhrases(notes: string): Promise<string[]> {
  const call = async (strictMode = false): Promise<string[]> => {
    const systemContent = strictMode
      ? VOICE_OF_CUSTOMER_SYSTEM + '\n\nCRITICAL: Previous output failed validation. Return ONLY valid JSON.'
      : VOICE_OF_CUSTOMER_SYSTEM;

    // openai v6: parse() is on chat.completions directly (graduated from beta)
    const response = await openai.chat.completions.parse({
      model: OPENAI_PROFILING_MODEL,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: `INSTALLER NOTES:\n${notes}` },
      ],
      response_format: zodResponseFormat(VoiceOfCustomerSchema, 'voice_of_customer'),
    });

    const parsed = response.choices[0].message.parsed;
    if (!parsed) throw new Error('OpenAI returned null parsed result for voice-of-customer');

    const validated = VoiceOfCustomerSchema.parse(parsed);
    return validated.verbatimPhrases;
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Voice-of-customer extraction failed, retrying:', err);
    return await call(true);
  }
}
