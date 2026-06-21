import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { regenDelta } from '@/lib/llm/deltaRegen';
import { checkConsent, assertConsent } from '@/lib/compliance/consentGate';
import { audit } from '@/lib/compliance/auditLog';
import { z } from 'zod';

const now = () => Math.floor(Date.now() / 1000);

const RegenerateBody = z.object({
  sequenceId:  z.string(),
  instruction: z.string().min(5),
});

export async function POST(req: NextRequest) {
  try {
    const body = RegenerateBody.parse(await req.json());

    const [seq] = await db.select().from(sequences).where(eq(sequences.id, body.sequenceId)).limit(1);
    if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    const consent = await checkConsent(seq.customerId, 'sequence_generation');
    assertConsent(consent);

    const existingTouches = await db
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.sequenceId, body.sequenceId));

    const [cust] = await db.select().from(customers).where(eq(customers.id, seq.customerId)).limit(1);

    let product: typeof products.$inferSelect | null = null;
    if (cust?.productId) {
      const [p] = await db.select().from(products).where(eq(products.id, cust.productId)).limit(1);
      product = p ?? null;
    }

    const customerContextBlock = `Customer: ${cust?.fname ?? ''} ${cust?.lname ?? ''}
Language: ${cust?.language ?? 'en'}
Archetypes: Family ${cust?.archetypeFamily ?? 0}, Investor ${cust?.archetypeInvestor ?? 0}, Environmentalist ${cust?.archetypeEnvironmentalist ?? 0}, Skeptic ${cust?.archetypeSkeptic ?? 0}
Quote: €${cust?.priceQuote ?? 0} total
Product: ${product ? `${product.name} (${product.type}, ${product.warrantyYears}yr warranty)` : 'not assigned'}`;

    const currentStrategy = {
      rationaleSummary:     seq.rationale ?? '',
      marketContextApplied: '',
      touches: existingTouches.map((t, i) => ({
        sequenceIndex:   i + 1,
        dayOffset:       t.dayOffset,
        channel:         t.channel,
        tone:            'professional' as const,
        objective:       '',
        reasoning:       t.reasoning ?? '',
        contentSubject:  t.contentSubject ?? null,
        contentBody:     t.contentBody ?? '',
        contentVariantB: null,
        abTestActive:    false,
      })),
    };

    const delta = await regenDelta({
      currentStrategy,
      installerFreeTextInstruction: body.instruction,
      customerContextBlock,
    });

    const ts = now();
    await db.delete(touchpoints).where(eq(touchpoints.sequenceId, body.sequenceId));
    await db.insert(touchpoints).values(
      delta.touches.map(t => ({
        sequenceId:      body.sequenceId,
        customerId:      seq.customerId,
        dayOffset:       t.dayOffset,
        channel:         t.channel,
        contentSubject:  t.contentSubject ?? null,
        contentBody:     t.contentBody,
        reasoning:       t.reasoning ?? null,
        abVariant:       null,
        status:          'pending' as const,
        createdAt:       ts,
      }))
    );

    await audit.sequenceRegenerated(seq.customerId, body.sequenceId, body.instruction);

    return NextResponse.json({
      sequenceId:       body.sequenceId,
      rationaleSummary: delta.rationaleSummary,
      touches:          delta.touches,
      changes:          delta.changes,
    });
  } catch (err) {
    console.error('Strategy regeneration error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
