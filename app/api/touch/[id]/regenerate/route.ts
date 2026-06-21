import { NextRequest, NextResponse } from 'next/server';
import { db, touchpoints, sequences, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { anthropic, SONNET } from '@/lib/llm/client';
import { SEQUENCE_GENERATION_SYSTEM } from '@/lib/llm/prompts';
import { getMarketContext } from '@/lib/persuasion/marketContext';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { z } from 'zod';

const RegenTouchBody = z.object({
  instruction: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: touchId } = await params;
    const body = RegenTouchBody.parse(await req.json());

    const [touch] = await db.select().from(touchpoints).where(eq(touchpoints.id, touchId)).limit(1);
    if (!touch) return NextResponse.json({ error: 'Touch not found' }, { status: 404 });

    const [seq] = await db.select().from(sequences).where(eq(sequences.id, touch.sequenceId)).limit(1);
    const consent = await checkConsent(seq.customerId, 'sequence_generation');
    assertConsent(consent);

    const [cust] = await db.select().from(customers).where(eq(customers.id, seq.customerId)).limit(1);

    const marketContextBlock = getMarketContext('DE');

    const singleTouchPrompt = `You are regenerating ONE specific touchpoint in an existing solar sales sequence.

TOUCH TO REGENERATE:
Day ${touch.dayOffset}, Channel: ${touch.channel}
Current reasoning: ${touch.reasoning ?? ''}
${body.instruction ? `INSTALLER ADJUSTMENT: ${body.instruction}` : 'Regenerate with improved personalization.'}

CUSTOMER CONTEXT:
Name: ${cust?.fname ?? ''} ${cust?.lname ?? ''}
Language: ${cust?.language ?? 'en'}
Archetypes: Family ${cust?.archetypeFamily ?? 0}, Investor ${cust?.archetypeInvestor ?? 0}, Environmentalist ${cust?.archetypeEnvironmentalist ?? 0}, Skeptic ${cust?.archetypeSkeptic ?? 0}
Quote: €${cust?.priceQuote ?? 0}
Installer notes: ${cust?.about ?? ''}

${marketContextBlock}

OUTPUT: JSON object with fields: dayOffset, channel, reasoning, contentSubject (null if non-email), contentBody.
reasoning MUST reference specific archetype weights AND the quote amount.`;

    const response = await anthropic.messages.create({
      model:      SONNET,
      max_tokens: 2048,
      system:     SEQUENCE_GENERATION_SYSTEM,
      messages:   [{ role: 'user', content: singleTouchPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    const rawTouch = JSON.parse(content.text);

    await db.update(touchpoints)
      .set({
        reasoning:      rawTouch.reasoning ?? touch.reasoning,
        contentBody:    rawTouch.contentBody ?? touch.contentBody,
        contentSubject: rawTouch.contentSubject ?? touch.contentSubject,
      })
      .where(eq(touchpoints.id, touchId));

    return NextResponse.json({ touchId, touch: rawTouch });
  } catch (err) {
    console.error('Touch regen error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
