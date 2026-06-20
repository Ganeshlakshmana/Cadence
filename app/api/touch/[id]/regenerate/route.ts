import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { strategyTouch, strategy, customer, customerProfile, quote } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { anthropic, SONNET } from '@/lib/llm/client';
import { StrategySchema } from '@/lib/llm/schemas';
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
    const body = RegenTouchBody.parse(await req.json()).instruction ? await req.json() : { instruction: undefined };

    const [touch] = await db.select().from(strategyTouch).where(eq(strategyTouch.id, touchId)).limit(1);
    if (!touch) return NextResponse.json({ error: 'Touch not found' }, { status: 404 });

    const [strat] = await db.select().from(strategy).where(eq(strategy.id, touch.strategyId)).limit(1);
    const consent = await checkConsent(strat.customerId, 'sequence_generation');
    assertConsent(consent);

    const [cust] = await db.select().from(customer).where(eq(customer.id, strat.customerId)).limit(1);
    const [profile] = await db.select().from(customerProfile).where(eq(customerProfile.customerId, strat.customerId)).limit(1);
    const [q] = await db.select().from(quote).where(eq(quote.id, strat.quoteId)).limit(1);

    const marketContextBlock = getMarketContext(cust?.countryCode ?? 'DE');

    const singleTouchPrompt = `You are regenerating ONE specific touchpoint in an existing solar sales sequence.

TOUCH TO REGENERATE:
Day ${touch.dayOffset}, Channel: ${touch.channel}, Tone: ${touch.tone}
Current objective: ${touch.objective}
Current reasoning: ${touch.reasoning}
${body.instruction ? `INSTALLER ADJUSTMENT: ${body.instruction}` : 'Regenerate with improved personalization.'}

CUSTOMER CONTEXT:
Name: ${cust?.firstName} ${cust?.lastName}
Language: ${cust?.preferredLanguage} (${cust?.formalityRegister})
Archetypes: Family ${profile?.archetypeFamily ?? 0}, Investor ${profile?.archetypeInvestor ?? 0}, Environmentalist ${profile?.archetypeEnvironmentalist ?? 0}, Skeptic ${profile?.archetypeSkeptic ?? 0}
Quote: ${q?.currency ?? 'EUR'}${q?.totalPrice ?? 0}, ${q?.currency ?? 'EUR'}${q?.monthlyEquivalentSavings ?? 0}/month
Verbatim phrases: ${JSON.stringify((profile?.customerVerbatimPhrases as string[] | null) ?? [])}

${marketContextBlock}

OUTPUT: JSON object with fields: sequenceIndex, dayOffset, channel, tone, objective, reasoning, contentSubject, contentBody, contentVariantB, abTestActive.
reasoning MUST reference specific archetype weights AND specific quote numbers.`;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 2048,
      system: SEQUENCE_GENERATION_SYSTEM,
      messages: [{ role: 'user', content: singleTouchPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    const rawTouch = JSON.parse(content.text);
    const touchSchema = StrategySchema.shape.touches.element;
    const validatedTouch = touchSchema.parse({ ...rawTouch, sequenceIndex: touch.sequenceIndex });

    await db.update(strategyTouch)
      .set({
        reasoning: validatedTouch.reasoning,
        contentBody: validatedTouch.contentBody,
        contentSubject: validatedTouch.contentSubject ?? null,
        contentVariantB: validatedTouch.contentVariantB ?? null,
        abTestActive: validatedTouch.abTestActive,
        objective: validatedTouch.objective,
        tone: validatedTouch.tone,
        installerEdited: true,
      })
      .where(eq(strategyTouch.id, touchId));

    return NextResponse.json({ touchId, touch: validatedTouch });
  } catch (err) {
    console.error('Touch regen error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
