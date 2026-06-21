// @ts-nocheck — stale file; uses old schema tables, pending migration update
import { NextRequest, NextResponse } from 'next/server';
import { db, touchpoints, sequences, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { renderVoice } from '@/lib/channels/renderVoice';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { z } from 'zod';

const AudioBody = z.object({
  installerName: z.string().default('Your Solar Advisor'),
  companyName:   z.string().default('SunPath Solar'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: touchId } = await params;
    const body = AudioBody.parse(await req.json());

    const [touch] = await db.select().from(touchpoints).where(eq(touchpoints.id, touchId)).limit(1);
    if (!touch) return NextResponse.json({ error: 'Touch not found' }, { status: 404 });

    if (touch.channel !== 'whatsapp_voice') {
      return NextResponse.json({ error: 'This touch is not a voice channel' }, { status: 400 });
    }

    const [seq] = await db.select().from(sequences).where(eq(sequences.id, touch.sequenceId)).limit(1);
    const consent = await checkConsent(seq.customerId, 'voice_generation');
    assertConsent(consent);

    const [cust] = await db.select().from(customers).where(eq(customers.id, seq.customerId)).limit(1);

    if (touch.contentAudioUrl) {
      return NextResponse.json({ touchId, audioUrl: touch.contentAudioUrl, cached: true });
    }

    const voiceData = await renderVoice(
      {
        sequenceIndex:   1,
        dayOffset:       touch.dayOffset,
        channel:         'whatsapp_voice',
        tone:            'warm',
        objective:       '',
        reasoning:       touch.reasoning ?? '',
        contentSubject:  touch.contentSubject ?? null,
        contentBody:     touch.contentBody ?? '',
        contentVariantB: null,
        abTestActive:    false,
      },
      {
        installerName:      body.installerName,
        companyName:        body.companyName,
        customerFirstName:  cust?.fname ?? 'Customer',
        languageCode:       cust?.language ?? 'en',
      },
    );

    await db.update(touchpoints)
      .set({ contentAudioUrl: voiceData.audioUrl })
      .where(eq(touchpoints.id, touchId));

    await audit.voiceGenerated(seq.customerId, touchId, voiceData.audioUrl);

    return NextResponse.json({
      touchId,
      audioUrl:                voiceData.audioUrl,
      script:                  voiceData.script,
      durationEstimateSeconds: voiceData.durationEstimateSeconds,
      aiActDisclosure:         voiceData.aiActDisclosure,
      cached:                  false,
    });
  } catch (err) {
    console.error('Audio generation error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
