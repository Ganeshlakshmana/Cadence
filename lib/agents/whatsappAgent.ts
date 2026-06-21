import { db, customers, touchpoints, customerResponses, aiFollowups, auditLog } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { anthropic, SONNET } from '@/lib/llm/client';

// ── Escalation message sent to customer ──────────────────────────────────────

export const ESCALATION_MSG =
  'Your query has been escalated to a human agent. Someone from our team will get back to you shortly.';

// ── Hard rule patterns ────────────────────────────────────────────────────────
// Checked before LLM to catch obvious cases instantly.

const HARD_RULES: RegExp[] = [
  // Explicit human request
  /\b(speak|talk|chat)\s+(to|with)\s+(a\s+)?(human|person|agent|someone|rep(resentative)?)\b/i,
  /\bhuman\s+agent\b/i,
  /\breal\s+person\b/i,
  /\b(manager|supervisor|complaint)\b/i,
  // Legal / contract disputes
  /\b(lawyer|attorney|lawsuit|court|sue|solicitor|legal\s+action)\b/i,
  // Price negotiation
  /\b(negotiate|haggle|bargain)\b/i,
  /\b(better|lower|cheaper|discount)\s+(price|deal|offer|rate|quote)\b/i,
  /\bprice\s+(match|drop|reduce|cut)\b/i,
  // Fraud / anger signals
  /\b(scam|fraud|cheat|rip.?off|con\s+artist)\b/i,
  /\b(terrible|awful|horrible|unacceptable|disgusting)\b/i,
  /\bthis\s+is\s+(ridiculous|outrageous|absurd)\b/i,
];

function checkHardRules(message: string): { escalate: true; reason: string } | null {
  for (const re of HARD_RULES) {
    if (re.test(message)) {
      return { escalate: true, reason: `hard_rule:${re.source.slice(0, 40)}` };
    }
  }
  return null;
}

// ── Conversation history loader ───────────────────────────────────────────────

interface Turn {
  role: 'advisor' | 'customer';
  text: string;
  ts: number;
}

async function loadHistory(customerId: string, limit = 20): Promise<Turn[]> {
  const [outbound, inbound] = await Promise.all([
    db.select({
      text:      touchpoints.contentBody,
      ts:        touchpoints.sentAt,
    })
    .from(touchpoints)
    .where(eq(touchpoints.customerId, customerId))
    .orderBy(desc(touchpoints.sentAt))
    .limit(limit),

    db.select({
      text:      customerResponses.responseText,
      ts:        customerResponses.respondedAt,
    })
    .from(customerResponses)
    .where(eq(customerResponses.customerId, customerId))
    .orderBy(desc(customerResponses.respondedAt))
    .limit(limit),
  ]);

  const turns: Turn[] = [
    ...outbound.map(r => ({ role: 'advisor' as const, text: r.text ?? '', ts: r.ts ?? 0 })),
    ...inbound.map(r  => ({ role: 'customer' as const, text: r.text ?? '', ts: r.ts ?? 0 })),
  ];

  return turns
    .filter(t => t.text.trim())
    .sort((a, b) => a.ts - b.ts)
    .slice(-limit);
}

function formatHistory(turns: Turn[]): string {
  if (!turns.length) return '(no prior conversation)';
  return turns
    .map(t => `${t.role === 'advisor' ? 'ADVISOR' : 'CUSTOMER'}: ${t.text.slice(0, 400)}`)
    .join('\n');
}

// ── LLM agent tools ───────────────────────────────────────────────────────────

const AGENT_TOOLS = [
  {
    name: 'send_reply',
    description: 'Send a WhatsApp reply to the customer. Use for general solar questions, status updates, friendly follow-ups, and anything you can answer confidently.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'The reply message to send. Max 400 chars. Match the customer\'s language.',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'escalate_to_human',
    description: 'Escalate to a human agent. Use when: customer is angry, requesting price negotiation, asking legal questions, requesting a contract change, or the question requires account-specific authority you don\'t have.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Internal reason for escalation (not shown to customer). 1 sentence.',
        },
      },
      required: ['reason'],
    },
  },
];

// ── Agent result type ─────────────────────────────────────────────────────────

export type AgentResult =
  | { action: 'reply';    text: string }
  | { action: 'escalate'; text: string; reason: string };

// ── Main agent function ───────────────────────────────────────────────────────

export async function runWhatsAppAgent(
  customerId: string,
  inboundMessage: string,
): Promise<AgentResult> {
  // 1. Hard rule check — no LLM call needed
  const hardMatch = checkHardRules(inboundMessage);
  if (hardMatch) {
    return { action: 'escalate', text: ESCALATION_MSG, reason: hardMatch.reason };
  }

  // 2. Load customer + conversation history
  const [cust] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!cust) throw new Error(`Customer not found: ${customerId}`);

  const history = await loadHistory(customerId);

  const systemPrompt = `You are a WhatsApp solar sales assistant for Cadence Solar. You are handling a live conversation with ${cust.fname} ${cust.lname}.

Customer profile:
- Language: ${cust.language ?? 'en'} — respond in this language
- Archetype: Family ${Math.round((cust.archetypeFamily ?? 0) * 100)}% / Investor ${Math.round((cust.archetypeInvestor ?? 0) * 100)}% / Environmentalist ${Math.round((cust.archetypeEnvironmentalist ?? 0) * 100)}% / Skeptic ${Math.round((cust.archetypeSkeptic ?? 0) * 100)}%
- Quote: ${cust.priceQuote ? `€${cust.priceQuote.toLocaleString('en')}` : 'pending'}
- Notes: ${cust.about ?? 'none'}

Rules:
- Keep replies under 400 characters (WhatsApp readability)
- Never invent pricing, financing terms, or installation timelines you're not sure about
- If unsure about anything specific → escalate, don't guess
- Warm, professional tone. No emojis unless the customer uses them first`;

  const userPrompt = `CONVERSATION HISTORY:
${formatHistory(history)}

CUSTOMER JUST SENT:
${inboundMessage}

Decide: reply directly or escalate to a human agent.`;

  // 3. Claude LLM decision
  const res = await anthropic.messages.create({
    model:       SONNET,
    max_tokens:  512,
    system:      systemPrompt,
    tools:       AGENT_TOOLS,
    tool_choice: { type: 'auto' },
    messages:    [{ role: 'user', content: userPrompt }],
  });

  const block = res.content.find(b => b.type === 'tool_use');

  if (!block || block.type !== 'tool_use') {
    // Fallback — no tool call, escalate safely
    return { action: 'escalate', text: ESCALATION_MSG, reason: 'llm_no_tool_call' };
  }

  const inp = block.input as Record<string, string>;

  if (block.name === 'escalate_to_human') {
    return {
      action: 'escalate',
      text:   ESCALATION_MSG,
      reason: `llm_escalation:${inp.reason ?? 'unknown'}`,
    };
  }

  return {
    action: 'reply',
    text:   (inp.message ?? '').slice(0, 1600),
  };
}

// ── Persist agent result to DB ────────────────────────────────────────────────

export async function persistAgentResult(
  result:     AgentResult,
  customerId: string,
  responseId: string,
): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);

  const [followup] = await db.insert(aiFollowups).values({
    responseId:       responseId,
    customerId,
    triggerReason:    result.action === 'escalate' ? result.reason : 'whatsapp_agent_reply',
    generatedContent: JSON.stringify({ text: result.text, action: result.action }),
    channel:          'whatsapp_text',
    status:           result.action === 'escalate' ? 'escalated' : 'sent',
    generatedBy:      'claude-sonnet-4-6',
    generatedAt:      ts,
  }).returning();

  await db.insert(auditLog).values({
    actor:      'agent',
    action:     result.action === 'escalate' ? 'whatsapp_escalated' : 'whatsapp_agent_replied',
    entityType: 'ai_followup',
    entityId:   followup.id,
    metadata:   JSON.stringify({
      customerId,
      action:    result.action,
      ...(result.action === 'escalate' ? { reason: result.reason } : {}),
    }),
    createdAt: ts,
  });
}
