import { db, customers, sequences } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────────────────────

type CustomerRow = typeof customers.$inferSelect;
type SequenceRow = typeof sequences.$inferSelect;
type ArchetypeKey = 'family' | 'investor' | 'environmentalist' | 'skeptic';

export interface VoiceCallResult {
  callId: string;
  status: string;
}

export interface TranscriptMessage {
  role: 'agent' | 'user';
  message: string;
  time_in_call_secs?: number;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const CONVAI_BASE = 'https://api.elevenlabs.io/v1/convai';

function xiHeaders(): Record<string, string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not set');
  return { 'xi-api-key': key, 'Content-Type': 'application/json' };
}

// ── Archetype helpers ─────────────────────────────────────────────────────────

function dominantArchetype(cust: CustomerRow): ArchetypeKey {
  const scores: [ArchetypeKey, number][] = [
    ['family',           cust.archetypeFamily           ?? 0],
    ['investor',         cust.archetypeInvestor         ?? 0],
    ['environmentalist', cust.archetypeEnvironmentalist ?? 0],
    ['skeptic',          cust.archetypeSkeptic          ?? 0],
  ];
  return scores.reduce((best, curr) => curr[1] > best[1] ? curr : best)[0];
}

function pct(val: number | null): string {
  return `${Math.round((val ?? 0) * 100)}%`;
}

// ── System prompt builder ─────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German', en: 'English', fr: 'French',
  es: 'Spanish', nl: 'Dutch', it: 'Italian',
};

const ARCHETYPE_GUIDANCE: Record<ArchetypeKey, (cust: CustomerRow) => string> = {
  family: () =>
    `This customer is motivated by family security and long-term stability.
- Lead with: 25-year manufacturer warranty, zero-maintenance promise, protection against rising energy bills
- Reassure: installation is 1–2 days, clean, no disruption to daily family life
- Emotional anchor: "your family will have predictable energy costs for decades"
- Offer to send a post-installation care guide by email`,

  investor: (cust) =>
    `This customer thinks in financial returns — lead with numbers.
- Quote the exact payback period and annual ROI from their offer
- Compare to stock market or savings account: "solar at 7–9% ROI vs. a 3% savings account"
- Reference the quote price (${cust.priceQuote ? '€' + cust.priceQuote.toLocaleString('de-DE') : 'their quote'}) as capital allocation, not an expense
- Offer to send a full 25-year financial model spreadsheet by email`,

  environmentalist: () =>
    `This customer is motivated by environmental impact and energy independence.
- Lead with CO2 offset (typical: 40–60 tonnes over 25 years) and grid independence
- Frame it as an act of leadership in their community, not just a household decision
- Avoid pure financial framing — it may feel transactional to them
- Offer to send a community solar impact report and local renewable stats by email`,

  skeptic: () =>
    `This customer needs proof, transparency, and zero pressure.
- Never push for commitment — explicitly say "take all the time you need"
- Address objections with third-party data: government subsidy rates, installer certification
- Offer a reference: a real customer they can call, or a government information portal
- Keep the call short — offer to send detailed written information by email for them to review at their own pace`,
};

function buildSystemPrompt(cust: CustomerRow, sequence: SequenceRow | null): string {
  const dominant  = dominantArchetype(cust);
  const lang      = LANGUAGE_NAMES[cust.language ?? 'en'] ?? 'English';
  const priceStr  = cust.priceQuote
    ? `€${cust.priceQuote.toLocaleString('de-DE')}`
    : 'as quoted';

  const scoreContext = sequence
    ? `\n- Close readiness score: ${Math.round((sequence.closeReadinessScore ?? 0) * 100)}/100`
    + `\n- Ghost risk score: ${Math.round((sequence.ghostRiskScore ?? 0) * 100)}/100`
    : '';

  const aboutContext = cust.about
    ? `\n\nINSTALLER NOTES (do not reveal you read these — use them to pre-empt concerns naturally):\n${cust.about}`
    : '';

  return `You are a professional solar sales advisor making a personal follow-up call on behalf of the installation company.

LANGUAGE: Respond entirely in ${lang}. If the customer switches language mid-call, follow them.

CUSTOMER PROFILE:
- Name: ${cust.fname} ${cust.lname}
- Quote total: ${priceStr}
- Primary archetype: ${dominant} (${pct(cust[`archetype${dominant.charAt(0).toUpperCase() + dominant.slice(1) as Capitalize<ArchetypeKey>}` as keyof CustomerRow] as number | null)})
- Archetype blend — Family ${pct(cust.archetypeFamily)} / Investor ${pct(cust.archetypeInvestor)} / Environmentalist ${pct(cust.archetypeEnvironmentalist)} / Skeptic ${pct(cust.archetypeSkeptic)}${scoreContext}${aboutContext}

CALL STRUCTURE:
1. Greet ${cust.fname} by first name; introduce yourself as their solar advisor
2. Reference their quote (${priceStr}) briefly — show you know their specific situation
3. Open question: "What questions or concerns can I answer for you today?"
4. Listen actively, then respond using the archetype guidance below

ARCHETYPE GUIDANCE:
${ARCHETYPE_GUIDANCE[dominant](cust)}

UNIVERSAL RULES:
- Never use urgency tactics ("limited time", "last spot", "prices going up next week")
- If you don't know a specific answer, say: "I'll send that to you in writing today" — and mean it
- Aim for 5–8 minutes; let the customer guide the pace
- Close every call by offering a written follow-up email with the specific details discussed
- You represent a trustworthy, certified professional company — integrity is non-negotiable`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initiate an ElevenLabs Conversational AI voice call for a customer.
 * Returns the conversation ID (callId) and initial status.
 */
export async function initiateVoiceCall(customerId: string): Promise<VoiceCallResult> {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) throw new Error('ELEVENLABS_AGENT_ID not set');

  // 1. Load customer
  const [cust] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!cust) throw new Error(`Customer not found: ${customerId}`);

  // 2. Load latest sequence for context scores
  const [sequence] = await db
    .select()
    .from(sequences)
    .where(eq(sequences.customerId, customerId))
    .orderBy(desc(sequences.createdAt))
    .limit(1);

  // 3. Build dynamic system prompt
  const systemPrompt = buildSystemPrompt(cust, sequence ?? null);
  const dominant     = dominantArchetype(cust);

  // 4. Call ElevenLabs Conversational AI
  const res = await fetch(`${CONVAI_BASE}/conversation`, {
    method:  'POST',
    headers: xiHeaders(),
    body:    JSON.stringify({
      agent_id: agentId,
      conversation_initiation_client_data: {
        dynamic_variables: {
          customer_name:    cust.fname,
          quote_price:      cust.priceQuote ?? 0,
          archetype_primary: dominant,
        },
        conversation_config_override: {
          agent: {
            prompt: {
              prompt: systemPrompt,
            },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { conversation_id?: string; id?: string; status?: string };
  const callId = data.conversation_id ?? data.id ?? '';
  const status = data.status ?? 'initiated';

  return { callId, status };
}

/**
 * Fetch the full transcript for a completed conversation.
 * Returns a human-readable string with AGENT / CUSTOMER turns.
 */
export async function getCallTranscript(callId: string): Promise<string> {
  const res = await fetch(`${CONVAI_BASE}/conversations/${callId}`, {
    headers: xiHeaders(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs transcript fetch ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    transcript?: TranscriptMessage[];
    data?: { transcript?: TranscriptMessage[] };
  };

  const messages: TranscriptMessage[] =
    data.transcript ?? data.data?.transcript ?? [];

  if (!messages.length) return '(no transcript available)';

  return messages
    .map(m => {
      const speaker = m.role === 'agent' ? 'ADVISOR' : 'CUSTOMER';
      return `${speaker}: ${m.message}`;
    })
    .join('\n\n');
}
