import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, customers, touchpoints, callRecords, auditLog } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { initiateOutboundCall } from '@/lib/voice-agent/twilioClient';

const now = () => Math.floor(Date.now() / 1000);

const InitiateBody = z.object({
  customer_id:   z.string(),
  touchpoint_id: z.string().optional(),
});

function archPrimary(cust: {
  archetypeFamily:           number | null;
  archetypeInvestor:         number | null;
  archetypeEnvironmentalist: number | null;
  archetypeSkeptic:          number | null;
}): string {
  const map = {
    family:           cust.archetypeFamily           ?? 0,
    investor:         cust.archetypeInvestor          ?? 0,
    environmentalist: cust.archetypeEnvironmentalist  ?? 0,
    skeptic:          cust.archetypeSkeptic           ?? 0,
  };
  return Object.entries(map).reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
}

// POST /api/channels/call/initiate
export async function POST(req: NextRequest) {
  try {
    const body = InitiateBody.parse(await req.json());

    // ── Load customer ─────────────────────────────────────────────────────────
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, body.customer_id))
      .limit(1);

    if (!cust) {
      return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
    }
    if (!cust.phone) {
      return NextResponse.json({ data: null, error: 'Customer has no phone number on file' }, { status: 422 });
    }
    if (!cust.phoneVerified) {
      return NextResponse.json(
        { data: null, error: 'Customer phone not verified — set phone_verified=1 in customers table first' },
        { status: 422 },
      );
    }
    if (!cust.consentMarketing) {
      return NextResponse.json(
        { data: null, error: 'Customer has not consented to marketing communications' },
        { status: 403 },
      );
    }

    // ── Compute call variables ────────────────────────────────────────────────
    const quotePrice    = cust.priceQuote ?? 0;
    const annualSavings = Math.round(quotePrice * 0.085);
    const paybackYears  = annualSavings > 0 ? Math.round(quotePrice / annualSavings) : 12;
    const roiPercent    = 8.5;
    const co2Offset     = Math.round(quotePrice * 0.012); // tonnes over 25 years
    const monthlyCost   = Math.round(quotePrice / 240);   // 20-year financing
    const primary       = archPrimary(cust);

    // ── Place outbound call ───────────────────────────────────────────────────
    const { call_sid, conversation_id } = await initiateOutboundCall({
      customer_name:     `${cust.fname} ${cust.lname}`,
      customer_number:   cust.phone,
      quote_price:       quotePrice,
      annual_savings:    annualSavings,
      payback_period:    `~${paybackYears} years`,
      archetype_primary: primary,
      roi_percent:       roiPercent,
      co2_offset:        co2Offset,
      monthly_cost:      monthlyCost,
    });

    const ts = now();

    // ── Insert call_records (will be updated by webhook) ─────────────────────
    const [record] = await db.insert(callRecords).values({
      id:             nanoid(),
      customerId:     cust.id,
      callSid:        call_sid,
      conversationId: conversation_id,
      finalDecision:  'no_answer',
      attemptsMade:   0,
      customerNumber: cust.phone,
      timestamp:      ts,
      createdAt:      ts,
    }).returning();

    // ── Mark touchpoint sent ──────────────────────────────────────────────────
    if (body.touchpoint_id) {
      await db
        .update(touchpoints)
        .set({ status: 'sent', sentAt: ts })
        .where(eq(touchpoints.id, body.touchpoint_id));
    }

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'voice_call_initiated',
      entityType: 'call_record',
      entityId:   record.id,
      metadata:   JSON.stringify({
        customerId:        cust.id,
        touchpointId:      body.touchpoint_id ?? null,
        call_sid,
        conversation_id,
        phone:             cust.phone,
        archetype_primary: primary,
      }),
      createdAt: ts,
    });

    return NextResponse.json({
      data: {
        call_sid,
        conversation_id,
        status:        'initiated',
        call_record_id: record.id,
      },
      error: null,
    });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: err.issues[0]?.message ?? 'Validation error' },
        { status: 400 },
      );
    }
    console.error('POST /api/channels/call/initiate', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
