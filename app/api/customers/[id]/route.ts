import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, auditLog } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

const now = () => Math.floor(Date.now() / 1000);

type Ctx = { params: Promise<{ id: string }> };

// GET /api/customers/[id] — full customer + all sequences + touchpoints under latest sequence
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    const [cust] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!cust) return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });

    const allSequences = await db
      .select()
      .from(sequences)
      .where(eq(sequences.customerId, id))
      .orderBy(desc(sequences.createdAt));

    const latestSeq = allSequences[0] ?? null;

    let latestTouchpoints: typeof touchpoints.$inferSelect[] = [];
    if (latestSeq) {
      latestTouchpoints = await db
        .select()
        .from(touchpoints)
        .where(eq(touchpoints.sequenceId, latestSeq.id));
    }

    return NextResponse.json({
      data: {
        ...cust,
        sequences: allSequences,
        latestSequence: latestSeq
          ? { ...latestSeq, touchpoints: latestTouchpoints }
          : null,
      },
      error: null,
    });
  } catch (err) {
    console.error('GET /api/customers/[id]', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}

// PATCH /api/customers/[id] — partial update of any field except id / created_at
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!existing) return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });

    const body = await req.json();

    // Map accepted snake_case body keys → Drizzle camelCase column names
    const FIELD_MAP: Record<string, string> = {
      fname:                     'fname',
      lname:                     'lname',
      email:                     'email',
      phone:                     'phone',
      whatsapp_enabled:          'whatsappEnabled',
      address:                   'address',
      postal_code:               'postalCode',
      price_quote:               'priceQuote',
      archetype_family:          'archetypeFamily',
      archetype_investor:        'archetypeInvestor',
      archetype_environmentalist:'archetypeEnvironmentalist',
      archetype_skeptic:         'archetypeSkeptic',
      about:                     'about',
      status:                    'status',
      language:                  'language',
      consent_data_processing:   'consentDataProcessing',
      consent_marketing:         'consentMarketing',
      consent_voice_cloning:     'consentVoiceCloning',
      product_id:                'productId',
      product_type:              'productType',
    };

    const updates: Record<string, unknown> = { updatedAt: now() };
    for (const [key, val] of Object.entries(body)) {
      const col = FIELD_MAP[key];
      if (col) updates[col] = val;
    }

    const [updated] = await db
      .update(customers)
      .set(updates)
      .where(eq(customers.id, id))
      .returning();

    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE constraint')) {
      return NextResponse.json({ data: null, error: 'Email already taken by another customer' }, { status: 409 });
    }
    console.error('PATCH /api/customers/[id]', err);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}

// DELETE /api/customers/[id] — delete customer; cascade handles sequences/touchpoints/etc.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!existing) return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'customer.deleted',
      entityType: 'customer',
      entityId:   id,
      metadata:   JSON.stringify({ fname: existing.fname, lname: existing.lname, email: existing.email }),
      createdAt:  now(),
    });

    await db.delete(customers).where(eq(customers.id, id));

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/customers/[id]', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
