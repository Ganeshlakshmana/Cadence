import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { strategyTouch, strategy, customer, customerProfile } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { renderVoice } from '@/lib/channels/renderVoice';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { z } from 'zod';

const AudioBody = z.object({
  installerName: z.string().default('Your Solar Advisor'),
  companyName: z.string().default('SunPath Solar'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: touchId } = await params;
    const body = AudioBody.parse(await req.json());

    const [touch] = await db.select().from(strategyTouch).where(eq(strategyTouch.id, touchId)).limit(1);
    if (!touch) return NextResponse.json({ error: 'Touch not found' }, { status: 404 });

    if (touch.channel !== 'whatsapp_voice') {
      return NextResponse.json({ error: 'This touch is not a voice channel' }, { status: 400 });
    }

    // Voice cloning requires explicit consent
    const [strat] = await db.select().from(strategy).where(eq(strategy.id, touch.strategyId)).limit(1);
    const consent = await checkConsent(strat.customerId, 'voice_generation');
    assertConsent(consent);

    const [cust] = await db.select().from(customer).where(eq(customer.id, strat.customerId)).limit(1);

    // Return cached audio if already generated
    if (touch.audioUrl) {
      return NextResponse.json({ touchId, audioUrl: touch.audioUrl, cached: true });
    }

    const voiceData = await renderVoice(
      {
        sequenceIndex: touch.sequenceIndex,
        dayOffset: touch.dayOffset,
        channel: 'whatsapp_voice',
        tone: touch.tone as Parameters<typeof renderVoice>[0]['tone'],
        objective: touch.objective ?? '',
        reasoning: touch.reasoning,
        contentSubject: touch.contentSubject ?? null,
        contentBody: touch.contentBody,
        contentVariantB: touch.contentVariantB ?? null,
        abTestActive: touch.abTestActive ?? false,
      },
      {
        installerName: body.installerName,
        companyName: body.companyName,
        customerFirstName: cust?.firstName ?? 'Customer',
        languageCode: cust?.preferredLanguage ?? 'de',
      },
    );

    // Cache audio URL on the touch
    await db.update(strategyTouch)
      .set({ audioUrl: voiceData.audioUrl })
      .where(eq(strategyTouch.id, touchId));

    await audit.voiceGenerated(strat.customerId, touchId, voiceData.audioUrl);

    return NextResponse.json({
      touchId,
      audioUrl: voiceData.audioUrl,
      script: voiceData.script,
      durationEstimateSeconds: voiceData.durationEstimateSeconds,
      aiActDisclosure: voiceData.aiActDisclosure,
      cached: false,
    });
  } catch (err) {
    console.error('Audio generation error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
