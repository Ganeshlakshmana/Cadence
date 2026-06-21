import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, customerResponses } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

function isReal(r: { rawWebhookData: string | null }) {
  if (!r.rawWebhookData) return true;
  try { return !(JSON.parse(r.rawWebhookData) as Record<string, unknown>).simulated; }
  catch { return true; }
}

// GET /api/customers/[id]/responses
//   Default          → { data: CustomerResponse[] } with joined touchpoint fields
//   ?format=timeline → complex shape used by the replay page
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const format = req.nextUrl.searchParams.get('format');

    const [cust] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!cust) {
      return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
    }

    // ── Timeline format (replay page) ─────────────────────────────────────────
    if (format === 'timeline') {
      const allSequences = await db
        .select()
        .from(sequences)
        .where(eq(sequences.customerId, id))
        .orderBy(desc(sequences.createdAt));

      const latestSeq = allSequences[0] ?? null;

      let touches: typeof touchpoints.$inferSelect[] = [];
      let allResponses: typeof customerResponses.$inferSelect[] = [];

      if (latestSeq) {
        touches = await db.select().from(touchpoints).where(eq(touchpoints.sequenceId, latestSeq.id));
        allResponses = await db.select().from(customerResponses).where(eq(customerResponses.customerId, id));
      }

      const realResponses = allResponses.filter(isReal);
      const sortedTouches = [...touches].sort((a, b) => a.dayOffset - b.dayOffset);

      return NextResponse.json({
        data: {
          customer: {
            id:                        cust.id,
            fname:                     cust.fname,
            lname:                     cust.lname,
            email:                     cust.email,
            language:                  cust.language,
            about:                     cust.about,
            archetypeFamily:           cust.archetypeFamily,
            archetypeInvestor:         cust.archetypeInvestor,
            archetypeEnvironmentalist: cust.archetypeEnvironmentalist,
            archetypeSkeptic:          cust.archetypeSkeptic,
          },
          latestSequence: latestSeq ? {
            id:                    latestSeq.id,
            status:                latestSeq.status,
            ghost_risk_score:      latestSeq.ghostRiskScore,
            close_readiness_score: latestSeq.closeReadinessScore,
            current_day:           latestSeq.currentDay,
            total_days:            latestSeq.totalDays,
          } : null,
          touchpoints: sortedTouches,
          responses:   realResponses,
        },
        error: null,
      });
    }

    // ── Default: flat list with joined touchpoint fields ──────────────────────
    const rows = await db
      .select({
        id:             customerResponses.id,
        touchpointId:   customerResponses.touchpointId,
        customerId:     customerResponses.customerId,
        dayNumber:      customerResponses.dayNumber,
        channel:        customerResponses.channel,
        responseText:   customerResponses.responseText,
        sentiment:      customerResponses.sentiment,
        actionTaken:    customerResponses.actionTaken,
        respondedAt:    customerResponses.respondedAt,
        rawWebhookData: customerResponses.rawWebhookData,
        createdAt:      customerResponses.createdAt,
        touchChannel:        touchpoints.channel,
        touchDayOffset:      touchpoints.dayOffset,
        touchContentSubject: touchpoints.contentSubject,
      })
      .from(customerResponses)
      .leftJoin(touchpoints, eq(customerResponses.touchpointId, touchpoints.id))
      .where(eq(customerResponses.customerId, id))
      .orderBy(desc(customerResponses.createdAt));

    const real = rows.filter(isReal).map(r => ({
      ...r,
      touchContentSubject: r.touchContentSubject?.slice(0, 80) ?? null,
    }));

    return NextResponse.json({ data: real, error: null });
  } catch (err) {
    console.error('GET /api/customers/[id]/responses', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
