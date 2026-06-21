import { anthropic, SONNET } from './client';
import { unwrapArrayFields } from './toolInput';
import { z } from 'zod';

// ── Channel enum (new schema) ─────────────────────────────────────────────────

const CHANNELS = [
  'email', 'sms', 'whatsapp_text', 'whatsapp_voice',
  'phone_call', 'voice_note', 'postcard', 'video', 'linkedin', 'in_person',
] as const;
type Channel = typeof CHANNELS[number];

function normalizeChannel(raw: string): Channel {
  const v = raw.toLowerCase().replace(/[^a-z_]/g, '');
  if ((CHANNELS as readonly string[]).includes(v)) return v as Channel;
  if (/whatsapp.*voice|voice.*whatsapp/.test(v)) return 'whatsapp_voice';
  if (/whatsapp/.test(v)) return 'whatsapp_text';
  if (/phone.*call|call.*phone|^call$/.test(v)) return 'phone_call';
  if (/voice.*note|note.*voice/.test(v)) return 'voice_note';
  if (/sms|text/.test(v)) return 'sms';
  if (/video|loom|zoom/.test(v)) return 'video';
  if (/post|mail|letter/.test(v)) return 'postcard';
  if (/linkedin/.test(v)) return 'linkedin';
  if (/person|visit|meet/.test(v)) return 'in_person';
  return 'email';
}

// ── Zod schema for tool output ────────────────────────────────────────────────

const TouchSchema = z.object({
  day_offset:        z.number().int().min(1).max(30),
  channel:           z.string().transform(normalizeChannel),
  content_subject:   z.string().nullable(),
  content_body:      z.string().min(10),
  content_image_url: z.string().nullable(),
  reasoning:         z.string().min(10),
  ab_variant:        z.enum(['A', 'B']).nullable().catch(null),
});

const SequenceOutputSchema = z.object({
  rationale:            z.string().min(10).transform(s => s.slice(0, 600)),
  ghost_risk_score:     z.number().min(0).max(1),
  close_readiness_score: z.number().min(0).max(1),
  touches:              z.array(TouchSchema).min(5).max(9),
});

export type SequenceOutput = z.infer<typeof SequenceOutputSchema>;

// ── Input interface (maps to new customers table) ─────────────────────────────

export interface SequenceGeneratorInput {
  fname:                     string;
  lname:                     string;
  language:                  string;
  postalCode:                string | null;
  priceQuote:                number;
  archetypeFamily:           number;
  archetypeInvestor:         number;
  archetypeEnvironmentalist: number;
  archetypeSkeptic:          number;
  about:                     string | null;
  marketContextBlock:        string;
  productName:               string | null;
  productType:               string | null;
  productDescription:        string | null;
  productWarranty:           string | null;
}

// ── Claude tool definition ────────────────────────────────────────────────────

const SEQUENCE_TOOL = {
  name: 'generate_sequence',
  description: 'Return the complete multi-touch outreach sequence for this customer.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rationale: {
        type: 'string',
        description: '2–3 sentences: overall sequence arc, archetype-weighting rationale, where the close is targeted.',
      },
      ghost_risk_score: {
        type: 'number', minimum: 0, maximum: 1,
        description: 'Estimated probability this customer ghosts (0 = unlikely, 1 = certain).',
      },
      close_readiness_score: {
        type: 'number', minimum: 0, maximum: 1,
        description: 'Estimated probability of close within 30 days.',
      },
      touches: {
        type: 'array', minItems: 5, maxItems: 9,
        description: 'Return as a real JSON array, NOT a JSON-encoded string.',
        items: {
          type: 'object',
          properties: {
            day_offset: {
              type: 'integer', minimum: 1, maximum: 30,
              description: 'Day number (1–30) when this touch is sent.',
            },
            channel: {
              type: 'string',
              enum: [...CHANNELS],
            },
            content_subject: {
              type: ['string', 'null'],
              description: 'Email subject line. Null for all non-email channels.',
            },
            content_body: {
              type: 'string',
              description: "Full message body written in the customer's language. Avoid double-quote characters inside this value — use single quotes instead.",
            },
            content_image_url: {
              type: ['string', 'null'],
              description: 'Set to "/placeholders/solar-install.jpg" for whatsapp_voice or voice_note channels. Null for all others.',
            },
            reasoning: {
              type: 'string',
              description: '2–3 sentences citing the specific archetype % driving this choice, why this channel on this day, and the intended outcome.',
            },
            ab_variant: {
              type: ['string', 'null'],
              enum: ['A', 'B', null],
              description: 'Assign "A" to exactly one touch and "B" to exactly one different touch for A/B testing. All other touches must be null.',
            },
          },
          required: ['day_offset', 'channel', 'content_subject', 'content_body', 'content_image_url', 'reasoning', 'ab_variant'],
        },
      },
    },
    required: ['rationale', 'ghost_risk_score', 'close_readiness_score', 'touches'],
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior solar sales strategist building a personalised outreach sequence for a specific customer. The installer will see your reasoning — it must be specific to this customer, never generic.

HARD RULES (all non-negotiable):

1. REASONING: every touch's reasoning MUST cite the specific archetype % driving the choice (e.g. "68% family-weighted") and the specific price (e.g. "€24,800 quote"). Generic reasoning like "this builds rapport" will be rejected.

2. CHANNEL CHOICE by dominant archetype:
   - Family-heavy (≥0.55): lead with warm email, then voice_note by day 5, in-person or phone_call by day 14
   - Investor-heavy (≥0.55): lead with data email, follow with video ROI walk-through, postcard with numbers
   - Environmentalist-heavy (≥0.55): lead with CO₂ impact email, postcard with local impact stats
   - Skeptic-heavy (≥0.55): lead with proof email + reviews, NO phone_call before day 10

3. CHANNEL LADDER: text-light first (email, sms), voice/video later as trust builds. Never phone_call before day 4 unless requested.

4. TIMING: front-load days 1–5 (3–4 touches), taper after day 10. Days 22–30 = close window (at most 2 touches).

5. SKEPTIC RULE: if archetype_skeptic > 0.25, at least one touch MUST be pure objection handling. Address the biggest objection on touch 2 or 3, never touch 1.

6. URGENCY: only in the final 1–2 touches, only if there is a real reason. Never fabricate urgency.

7. ABOUT FIELD: the installer notes contain verbatim customer phrases — weave 2–3 into content_body exactly as written.

8. LANGUAGE: write content_body in the customer's language (language field). Use appropriate formality.

9. MARKET CONTEXT: incorporate the provided market block into framing.

10. A/B VARIANTS: exactly ONE touch gets ab_variant "A" and exactly ONE different touch gets ab_variant "B". Typically the day-1 opener and the final close touch. All other touches: ab_variant null.

11. SEQUENCE LENGTH: 5–9 touches. Fewer for high-confidence buyers, more for skeptic-heavy or comparison-shoppers.

12. CHANNEL DIVERSITY: use at least 4 different channels across the sequence. Include at least one of: whatsapp_voice, voice_note, video, postcard.

13. FIRST TOUCH: always email, always personal — never a template greeting.

14. content_image_url: set to "/placeholders/solar-install.jpg" for whatsapp_voice or voice_note channels only. Null for everything else.

15. ARCHETYPE DEPTH — every content_body must feel personally researched, not templated. Go beyond generic solar benefits:

   INVESTOR (weight ≥ 0.30 — applies even if not dominant):
   - Open with the specific payback math: quote amount ÷ estimated annual savings = payback years. State it as a sentence, e.g. "At current rates your €22,000 system pays itself back in 7 years — then produces free electricity for 18+ more."
   - Reference a real electricity price trend from the market context (e.g. Germany: 40¢/kWh, rising 3-5% annually since 2010). Frame solar as locking in today's cost against tomorrow's grid increases.
   - Compare the ROI to alternatives: "A savings account returns 2-3% annually. Solar typically returns 8-12% — tax-free."
   - Mention property value uplift: studies consistently show solar adds 4-6% to home resale value.
   - At least one touch must include a concrete forward projection — what the customer's electricity bill looks like in 10 years without solar vs. with it.
   - Frame the decision window: if tariffs or subsidies are time-limited, name them specifically.

   FAMILY (weight ≥ 0.30):
   - Anchor to emotional security, not spreadsheets: the feeling of knowing your home produces its own power when prices spike.
   - Mention energy independence as protection for the household — "whatever happens to energy prices, your family's covered."
   - If the product has battery/backup capability, weave in outage protection: "the lights stay on even when the grid doesn't."
   - Talk about legacy: a home that generates its own power is a better home to inherit.
   - Write at least one touch that reads like a personal letter to the household, not a sales pitch — warm, specific, no jargon.

   ENVIRONMENTALIST (weight ≥ 0.30):
   - Lead with a specific, local CO₂ impact number: tons offset per year, equivalent cars removed from road, trees planted.
   - Reference the national grid's carbon intensity from the market context — how much dirtier the grid is vs. rooftop solar.
   - Connect the customer's decision to the broader movement (e.g. Germany's Energiewende targets, Spain's autoconsumo wave).
   - Frame the purchase as joining something larger than a financial transaction — a collective shift, not just a product.
   - Avoid financializing the message for this archetype unless investor weight is also significant.

   SKEPTIC (weight ≥ 0.25 — lower threshold, applies broadly):
   - Never open with enthusiasm. Open with acknowledgment: "You've probably seen solar claims that didn't hold up."
   - Lead with third-party proof: independent certifications (TÜV, NABCEP), warranty depth in years, manufacturer track record.
   - Name the objection explicitly in touch 2 or 3 — don't dance around it. "The main concern we hear from people like you is X. Here's what the data actually shows."
   - Use hedged, precise language: "typically," "in similar installations," "based on independent audits" — never overpromise.
   - One touch must be pure objection-handling with zero sales framing. Give them information and stop.

Use the generate_sequence tool to return your response.`;

// ── User prompt builder ───────────────────────────────────────────────────────

function buildUserPrompt(input: SequenceGeneratorInput): string {
  const dominantArchetype = (() => {
    const w = {
      Family: input.archetypeFamily,
      Investor: input.archetypeInvestor,
      Environmentalist: input.archetypeEnvironmentalist,
      Skeptic: input.archetypeSkeptic,
    };
    return Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
  })();

  return `CUSTOMER:
Name: ${input.fname} ${input.lname}
Language: ${input.language}
Postal code: ${input.postalCode ?? 'unknown'}
Price quote: ${input.priceQuote.toLocaleString('en')} (currency from market context)

ARCHETYPE BLEND:
Family:           ${(input.archetypeFamily * 100).toFixed(0)}%
Investor:         ${(input.archetypeInvestor * 100).toFixed(0)}%
Environmentalist: ${(input.archetypeEnvironmentalist * 100).toFixed(0)}%
Skeptic:          ${(input.archetypeSkeptic * 100).toFixed(0)}%
Dominant:         ${dominantArchetype}

PRODUCT BEING SOLD:
${input.productName ? `${input.productName} (${input.productType})${input.productWarranty ? ` — ${input.productWarranty} warranty` : ''}
${input.productDescription ?? ''}` : 'No specific product assigned — use general Reonic Solar messaging.'}

INSTALLER NOTES (extract verbatim phrases for reuse):
${input.about ?? 'No installer notes provided.'}

MARKET CONTEXT:
${input.marketContextBlock}

PRODUCT RULE: If a product is assigned above, every content_body must reference the specific product name at least once. Frame features using the customer's dominant archetype (e.g. for investor: ROI/payback; for family: reliability/outage protection; for eco: CO₂ offset).`;
}

// ── Post-process: guarantee exactly one A and one B ───────────────────────────

function enforceAbVariants(output: SequenceOutput): SequenceOutput {
  const touches = output.touches.map(t => ({ ...t }));

  // Clear any duplicate As or Bs (keep first occurrence of each)
  let seenA = false;
  let seenB = false;
  for (const t of touches) {
    if (t.ab_variant === 'A') { if (seenA) t.ab_variant = null; else seenA = true; }
    if (t.ab_variant === 'B') { if (seenB) t.ab_variant = null; else seenB = true; }
  }

  // Assign missing variants
  if (!seenA) touches[0].ab_variant = 'A';
  if (!seenB) {
    const fallback = touches.findIndex(t => t.ab_variant === null);
    if (fallback !== -1) touches[fallback].ab_variant = 'B';
  }

  return { ...output, touches };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateSequence(input: SequenceGeneratorInput): Promise<SequenceOutput> {
  const userPrompt = buildUserPrompt(input);

  const call = async (strictMode = false): Promise<SequenceOutput> => {
    const system = strictMode
      ? SYSTEM_PROMPT + '\n\nCRITICAL: previous attempt failed validation. Ensure ab_variant "A" appears on exactly one touch and "B" on exactly one different touch. All others must be null. Return a real JSON array for touches, not a string.'
      : SYSTEM_PROMPT;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 16000,
      system,
      tools: [SEQUENCE_TOOL],
      tool_choice: { type: 'tool', name: 'generate_sequence' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('sequenceGenerator: no tool_use block in response');

    const inp = unwrapArrayFields(block.input as Record<string, unknown>, ['touches']);
    const parsed = SequenceOutputSchema.parse(inp);
    return enforceAbVariants(parsed);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Sequence generation failed validation, retrying in strict mode:', err);
    try {
      return await call(true);
    } catch (retryErr) {
      throw new Error(`Sequence generation failed after retry: ${retryErr}`);
    }
  }
}
