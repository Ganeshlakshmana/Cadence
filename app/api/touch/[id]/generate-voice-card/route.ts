import { NextRequest, NextResponse } from 'next/server';
import { db, customers, touchpoints } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateVoiceNote, buildVoiceScript } from '@/lib/elevenlabs/client';
import { generateImageCard } from '@/lib/channels/renderWhatsAppCard';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: touchId } = await params;

    // ── Load touchpoint ───────────────────────────────────────────────────────
    const [touch] = await db
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.id, touchId))
      .limit(1);

    if (!touch) {
      return NextResponse.json({ data: null, error: 'Touchpoint not found' }, { status: 404 });
    }
    if (touch.channel !== 'whatsapp_voice' && touch.channel !== 'voice_note') {
      return NextResponse.json(
        { data: null, error: 'generate-voice-card is only for whatsapp_voice or voice_note touchpoints' },
        { status: 400 },
      );
    }
    if (!touch.contentBody) {
      return NextResponse.json({ data: null, error: 'Touchpoint has no content body' }, { status: 422 });
    }

    // ── Load customer ─────────────────────────────────────────────────────────
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, touch.customerId))
      .limit(1);

    if (!cust) {
      return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
    }

    // ── Generate image card + voice note in parallel ──────────────────────────
    const script = buildVoiceScript({
      installerName:     'Your Solar Advisor',
      companyName:       'SunPath Solar',
      customerFirstName: cust.fname,
      languageCode:      cust.language ?? 'en',
      mainMessage:       touch.contentBody,
    });

    const [imageUrl, audioUrl] = await Promise.all([
      generateImageCard(cust, touch),
      generateVoiceNote({ script, languageCode: cust.language ?? 'en', installerName: 'Your Solar Advisor', customerFirstName: cust.fname }),
    ]);

    // ── Persist URLs to touchpoint ────────────────────────────────────────────
    await db
      .update(touchpoints)
      .set({ contentImageUrl: imageUrl, contentAudioUrl: audioUrl })
      .where(eq(touchpoints.id, touchId));

    return NextResponse.json({
      data: { image_url: imageUrl, audio_url: audioUrl },
      error: null,
    });

  } catch (err) {
    console.error('POST /api/touch/[id]/generate-voice-card', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
