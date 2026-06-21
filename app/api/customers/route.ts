import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, auditLog } from '@/db/schema';
import { desc } from 'drizzle-orm';

const now = () => Math.floor(Date.now() / 1000);

// GET /api/customers — list all customers with archetype blend + latest sequence status
export async function GET() {
  try {
    const rows = await db.select().from(customers).orderBy(desc(customers.createdAt));

    // Fetch all sequences once, pick latest per customer in JS
    const allSeqs = await db.select().from(sequences);
    const latestSeq = new Map<string, typeof allSeqs[0]>();
    for (const s of allSeqs) {
      const cur = latestSeq.get(s.customerId);
      if (!cur || (s.createdAt ?? 0) > (cur.createdAt ?? 0)) {
        latestSeq.set(s.customerId, s);
      }
    }

    const data = rows.map(c => {
      const seq = latestSeq.get(c.id) ?? null;
      return {
        id:              c.id,
        fname:           c.fname,
        lname:           c.lname,
        email:           c.email,
        phone:           c.phone,
        whatsapp_enabled: c.whatsappEnabled,
        price_quote:     c.priceQuote,
        status:          c.status,
        archetypes: {
          family:           c.archetypeFamily,
          investor:         c.archetypeInvestor,
          environmentalist: c.archetypeEnvironmentalist,
          skeptic:          c.archetypeSkeptic,
        },
        product_id:   c.productId,
        product_type: c.productType,
        latestSequence: seq ? {
          id:                  seq.id,
          status:              seq.status,
          ghost_risk_score:    seq.ghostRiskScore,
          close_readiness_score: seq.closeReadinessScore,
          current_day:         seq.currentDay,
          total_days:          seq.totalDays,
        } : null,
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('GET /api/customers', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}

// POST /api/customers — create a new customer
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const missing = ['fname', 'lname', 'email'].filter(k => body[k] == null || body[k] === '');
    if (missing.length) {
      return NextResponse.json(
        { data: null, error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    const ts = now();
    const [created] = await db.insert(customers).values({
      fname:                     body.fname,
      lname:                     body.lname,
      email:                     body.email,
      phone:                     body.phone ?? null,
      whatsappEnabled:           body.whatsapp_enabled ?? 0,
      address:                   body.address ?? null,
      postalCode:                body.postal_code ?? null,
      priceQuote:                body.price_quote,
      archetypeFamily:           body.archetype_family ?? 0,
      archetypeInvestor:         body.archetype_investor ?? 0,
      archetypeEnvironmentalist: body.archetype_environmentalist ?? 0,
      archetypeSkeptic:          body.archetype_skeptic ?? 0,
      about:                     body.about ?? null,
      status:                    body.status ?? 'lead',
      language:                  body.language ?? 'en',
      consentDataProcessing:     body.consent_data_processing ?? 0,
      consentMarketing:          body.consent_marketing ?? 0,
      consentVoiceCloning:       body.consent_voice_cloning ?? 0,
      createdAt:                 ts,
      updatedAt:                 ts,
    }).returning();

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'customer.created',
      entityType: 'customer',
      entityId:   created.id,
      metadata:   JSON.stringify({ fname: body.fname, lname: body.lname, email: body.email }),
      createdAt:  ts,
    });

    return NextResponse.json({ data: created, error: null }, { status: 201 });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE constraint')) {
      return NextResponse.json({ data: null, error: 'A customer with that email already exists' }, { status: 409 });
    }
    console.error('POST /api/customers', err);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
