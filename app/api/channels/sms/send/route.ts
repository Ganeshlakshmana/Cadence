import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, customers, touchpoints, auditLog } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendSms } from '@/lib/channels/sendSms';

const now = () => Math.floor(Date.now() / 1000);

const SendBody = z.object({
  touchpoint_id: z.string().optional(),
  customer_id:   z.string(),
  body:          z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const payload = SendBody.parse(await req.json());

    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, payload.customer_id))
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
    if (!cust.phone) {
      return NextResponse.json({ data: null, error: 'Customer has no phone number' }, { status: 422 });
    }

    const result = await sendSms(cust.phone, payload.body);

    const ts = now();

    if (payload.touchpoint_id) {
      await db
        .update(touchpoints)
        .set({ status: 'sent', sentAt: ts })
        .where(eq(touchpoints.id, payload.touchpoint_id));
    }

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'sms_sent',
      entityType: 'touchpoint',
      entityId:   payload.touchpoint_id ?? null,
      metadata:   JSON.stringify({ customerId: payload.customer_id, to: cust.phone, sid: result.sid }),
      createdAt:  ts,
    });

    return NextResponse.json({ data: { success: true, sid: result.sid }, error: null });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: err.issues[0]?.message ?? 'Validation error' },
        { status: 400 },
      );
    }
    console.error('POST /api/channels/sms/send', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
