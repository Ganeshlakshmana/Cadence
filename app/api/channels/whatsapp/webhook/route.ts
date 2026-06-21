import { NextRequest, NextResponse } from 'next/server';
import { db, customers, touchpoints, customerResponses, auditLog } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { runWhatsAppAgent, persistAgentResult } from '@/lib/agents/whatsappAgent';

const now = () => Math.floor(Date.now() / 1000);

const xml = (body: string) =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status:  200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });

const twiml    = ()            => xml('');
const twimlMsg = (msg: string) => xml(`<Message>${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message>`);

function normalisePhone(raw: string): string {
  let n = raw.replace(/^whatsapp:/i, '');
  if (!n.startsWith('+')) n = '+' + n;
  return n;
}

export async function POST(req: NextRequest) {
  try {
    const text   = await req.text();
    const params = new URLSearchParams(text);

    const messageBody = params.get('Body');
    const fromRaw     = params.get('From');
    const messageSid  = params.get('MessageSid') ?? params.get('SmsSid') ?? '';

    // Status callback — no Body field
    if (!messageBody || !fromRaw) return twiml();

    const fromPhone = normalisePhone(fromRaw);

    // Find customer
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, fromPhone))
      .limit(1);

    if (!cust) return twiml();

    const ts = now();

    // Link to most recently sent touchpoint
    const [touch] = await db
      .select()
      .from(touchpoints)
      .where(and(eq(touchpoints.customerId, cust.id), eq(touchpoints.status, 'sent')))
      .orderBy(desc(touchpoints.sentAt))
      .limit(1);

    // ── Store inbound message ─────────────────────────────────────────────────
    const [response] = await db.insert(customerResponses).values({
      touchpointId:   touch?.id ?? null,
      customerId:     cust.id,
      channel:        'whatsapp_text',
      responseText:   messageBody.slice(0, 4000),
      sentiment:      'neutral',
      actionTaken:    'replied',
      respondedAt:    ts,
      rawWebhookData: JSON.stringify({ messageSid, from: fromRaw, to: params.get('To'), body: messageBody }),
      createdAt:      ts,
    }).returning();

    await db.insert(auditLog).values({
      actor:      'webhook',
      action:     'whatsapp_reply_received',
      entityType: 'customer_response',
      entityId:   response.id,
      metadata:   JSON.stringify({ customerId: cust.id, messageSid }),
      createdAt:  ts,
    });

    // ── Run agent (hard rules + LLM) ─────────────────────────────────────────
    const result = await runWhatsAppAgent(cust.id, messageBody);

    // ── Persist result (fire-and-forget, don't delay TwiML) ──────────────────
    persistAgentResult(result, cust.id, response.id)
      .catch(err => console.error('WhatsApp agent persist failed', err));

    // ── Reply via TwiML ───────────────────────────────────────────────────────
    return twimlMsg(result.text);

  } catch (err) {
    console.error('POST /api/channels/whatsapp/webhook', err);
    return twiml();
  }
}
