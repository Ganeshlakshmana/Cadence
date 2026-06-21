import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, customers, touchpoints, auditLog } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendGmailEmail } from '@/lib/channels/gmail';

const now = () => Math.floor(Date.now() / 1000);

const SendBody = z.object({
  touchpoint_id: z.string().optional(),
  customer_id:   z.string().optional(),
  to_email:      z.string().email(),
  subject:       z.string().min(1),
  html_body:     z.string().min(1),
  thread_id:     z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = SendBody.parse(await req.json());

    // ── Consent gate (customer-facing sends only) ─────────────────────────────
    if (body.customer_id) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, body.customer_id))
        .limit(1);

      if (!cust) {
        return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
      }
      if (!cust.consentMarketing) {
        return NextResponse.json(
          { data: null, error: 'Customer has not consented to marketing communications' },
          { status: 403 },
        );
      }
    }

    // ── Send via Gmail API ────────────────────────────────────────────────────
    const result = await sendGmailEmail({
      to:       body.to_email,
      subject:  body.subject,
      htmlBody: body.html_body,
      threadId: body.thread_id,
    });

    const ts = now();

    const isBriefShare = !body.touchpoint_id && !body.customer_id;

    if (result.status === 'failed') {
      await db.insert(auditLog).values({
        actor:      'system',
        action:     'email_send_failed',
        entityType: isBriefShare ? 'brief_share' : 'touchpoint',
        entityId:   body.touchpoint_id ?? null,
        metadata:   JSON.stringify({ error: result.error, to: body.to_email }),
        createdAt:  ts,
      });
      return NextResponse.json(
        { data: null, error: `Gmail send failed: ${result.error}` },
        { status: 502 },
      );
    }

    // ── Update touchpoint status (customer-facing sends only) ─────────────────
    if (body.touchpoint_id) {
      await db
        .update(touchpoints)
        .set({ status: 'sent', sentAt: ts })
        .where(eq(touchpoints.id, body.touchpoint_id));
    }

    await db.insert(auditLog).values({
      actor:      'system',
      action:     isBriefShare ? 'brief_share.sent' : 'email_sent',
      entityType: isBriefShare ? 'brief_share' : 'touchpoint',
      entityId:   body.touchpoint_id ?? null,
      metadata:   JSON.stringify({
        customerId: body.customer_id ?? null,
        to:         body.to_email,
        subject:    body.subject,
        messageId:  result.messageId,
        threadId:   result.threadId,
      }),
      createdAt: ts,
    });

    return NextResponse.json({
      data: {
        success:    true,
        message_id: result.messageId,
        thread_id:  result.threadId,
      },
      error: null,
    });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: err.issues[0]?.message ?? 'Validation error' },
        { status: 400 },
      );
    }
    console.error('POST /api/channels/gmail/send', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
