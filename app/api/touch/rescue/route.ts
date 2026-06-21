import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, auditLog } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateRescueInsert } from '@/lib/llm/rescueInsert';
import { z } from 'zod';

const now = () => Math.floor(Date.now() / 1000);

const RescueBody = z.object({
  customer_id: z.string(),
  sequence_id: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = RescueBody.parse(await req.json());

    const [cust] = await db.select().from(customers).where(eq(customers.id, body.customer_id)).limit(1);
    if (!cust) {
      return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
    }

    const [seq] = await db.select().from(sequences).where(eq(sequences.id, body.sequence_id)).limit(1);
    if (!seq) {
      return NextResponse.json({ data: null, error: 'Sequence not found' }, { status: 404 });
    }

    const existingTouches = await db
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.sequenceId, body.sequence_id));

    const ghostRiskSignals: string[] = [];
    if ((cust.archetypeSkeptic ?? 0) > 0.35)
      ghostRiskSignals.push('high skeptic archetype — needs proof, not enthusiasm');
    if ((cust.priceQuote ?? 0) > 20000)
      ghostRiskSignals.push(`large quote (${cust.priceQuote?.toLocaleString()}) — potential sticker shock`);
    if (!cust.about)
      ghostRiskSignals.push('no installer notes — low pre-sale engagement depth');
    if ((seq.ghostRiskScore ?? 0) > 0.6)
      ghostRiskSignals.push('sequence AI flagged high ghost probability at generation time');
    if ((seq.currentDay ?? 0) > 10 && existingTouches.every(t => t.status !== 'sent'))
      ghostRiskSignals.push('10+ days elapsed with no touches sent yet');

    const rescue = await generateRescueInsert({
      customerFirstName:  cust.fname,
      postalCode:         cust.postalCode ?? '',
      ghostRiskScore:     seq.ghostRiskScore ?? 0,
      ghostRiskSignals,
      existingTouchCount: existingTouches.length,
      preferredLanguage:  cust.language ?? 'en',
      formalityRegister:  'formal',
    });

    const ts = now();

    const [newTouch] = await db.insert(touchpoints).values({
      sequenceId:     body.sequence_id,
      customerId:     body.customer_id,
      dayOffset:      rescue.touch.dayOffset,
      channel:        rescue.touch.channel,
      contentSubject: rescue.touch.contentSubject ?? null,
      contentBody:    rescue.touch.contentBody,
      reasoning:      rescue.touch.reasoning,
      abVariant:      null,
      status:         'pending',
      createdAt:      ts,
    }).returning();

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'touch.rescue_inserted',
      entityType: 'touchpoint',
      entityId:   newTouch.id,
      metadata:   JSON.stringify({
        customerId: body.customer_id,
        sequenceId: body.sequence_id,
        rationale:  rescue.rationale,
        ghostRisk:  seq.ghostRiskScore,
      }),
      createdAt: ts,
    });

    return NextResponse.json({
      data: {
        touch:     newTouch,
        rationale: rescue.rationale,
      },
      error: null,
    }, { status: 201 });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ data: null, error: err.issues[0]?.message ?? 'Validation error' }, { status: 400 });
    }
    console.error('POST /api/touch/rescue', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
