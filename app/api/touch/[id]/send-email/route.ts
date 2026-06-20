import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { strategyTouch, strategy } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/channels/sendEmail';
import { writeAuditLog } from '@/lib/compliance/auditLog';
import { z } from 'zod';

const SendEmailBody = z.object({
  testRecipient: z.string().email(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: touchId } = await params;
    const body = SendEmailBody.parse(await req.json());

    const [touch] = await db.select().from(strategyTouch).where(eq(strategyTouch.id, touchId)).limit(1);
    if (!touch) return NextResponse.json({ error: 'Touch not found' }, { status: 404 });

    if (touch.channel !== 'email') {
      return NextResponse.json({ error: `Channel is '${touch.channel}', not 'email'` }, { status: 400 });
    }

    if (!touch.contentBody) {
      return NextResponse.json({ error: 'Touch has no content body' }, { status: 400 });
    }

    const [strat] = await db.select().from(strategy).where(eq(strategy.id, touch.strategyId)).limit(1);

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;line-height:1.6">${
      touch.contentBody.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
    }</div>`;

    const result = await sendEmail({
      to: body.testRecipient,
      subject: touch.contentSubject ?? 'Message from SunPath Solar',
      html: `<p>${html}</p>`,
    });

    await writeAuditLog({
      actorType: 'installer_user',
      action: 'email.sent',
      targetCustomerId: strat?.customerId,
      metadata: {
        touchId,
        sequenceIndex: touch.sequenceIndex,
        to: body.testRecipient,
        subject: touch.contentSubject,
        providerId: result.providerId,
        status: result.status,
        error: result.error,
      },
    });

    if (result.status === 'failed') {
      return NextResponse.json({ error: result.error, touchId }, { status: 502 });
    }

    return NextResponse.json({
      touchId,
      providerId: result.providerId,
      status: 'sent',
      to: body.testRecipient,
      subject: touch.contentSubject,
    });
  } catch (err) {
    console.error('[send-email] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
