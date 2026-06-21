import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, customers, touchpoints, auditLog } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendWhatsAppText, sendWhatsAppImageVoice, sendWhatsAppAudio } from '@/lib/channels/sendWhatsApp';

const now = () => Math.floor(Date.now() / 1000);

const SendBody = z.object({
  touchpoint_id:    z.string(),
  customer_id:      z.string(),
  message_type:     z.enum(['text', 'image_voice', 'audio']),
  content_body:     z.string().min(1),
  content_image_url: z.string().url().optional().nullable(),
  content_audio_url: z.string().url().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = SendBody.parse(await req.json());

    // ── Load customer + consent check ─────────────────────────────────────────
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, body.customer_id))
      .limit(1);

    if (!cust) {
      return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
    }
    if (!cust.whatsappEnabled) {
      return NextResponse.json(
        { data: null, error: 'WhatsApp not enabled for this customer' },
        { status: 403 },
      );
    }
    if (!cust.consentMarketing) {
      return NextResponse.json(
        { data: null, error: 'Customer has not consented to marketing communications' },
        { status: 403 },
      );
    }

    const phone = cust.phone;
    if (!phone) {
      return NextResponse.json({ data: null, error: 'Customer has no phone number' }, { status: 422 });
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    let sid: string;

    if (body.message_type === 'image_voice') {
      if (!body.content_image_url || !body.content_audio_url) {
        return NextResponse.json(
          { data: null, error: 'image_voice requires content_image_url and content_audio_url' },
          { status: 400 },
        );
      }
      const results = await sendWhatsAppImageVoice(
        phone,
        body.content_image_url,
        body.content_audio_url,
        body.content_body,
      );
      sid = results.map(r => r.sid).join(',');
    } else if (body.message_type === 'audio') {
      if (!body.content_audio_url) {
        return NextResponse.json(
          { data: null, error: 'audio requires content_audio_url' },
          { status: 400 },
        );
      }
      const result = await sendWhatsAppAudio(phone, body.content_audio_url);
      sid = result.sid;
    } else {
      const result = await sendWhatsAppText(phone, body.content_body);
      sid = result.sid;
    }

    const ts = now();

    // ── Update touchpoint ─────────────────────────────────────────────────────
    await db
      .update(touchpoints)
      .set({ status: 'sent', sentAt: ts })
      .where(eq(touchpoints.id, body.touchpoint_id));

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'whatsapp_sent',
      entityType: 'touchpoint',
      entityId:   body.touchpoint_id,
      metadata:   JSON.stringify({
        customerId:  body.customer_id,
        to:          phone,
        messageType: body.message_type,
        sid,
      }),
      createdAt: ts,
    });

    return NextResponse.json({ data: { success: true, sid }, error: null });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: err.issues[0]?.message ?? 'Validation error' },
        { status: 400 },
      );
    }
    console.error('POST /api/channels/whatsapp/send', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
