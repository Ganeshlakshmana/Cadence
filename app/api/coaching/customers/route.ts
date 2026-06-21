import { NextResponse } from 'next/server';
import { db, customers, sequences, customerResponses } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const allCustomers = await db.select().from(customers).orderBy(desc(customers.createdAt));
    const allSeqs = await db.select().from(sequences);
    const allResponses = await db
      .select()
      .from(customerResponses)
      .orderBy(desc(customerResponses.respondedAt));

    const latestSeq = new Map<string, typeof allSeqs[0]>();
    for (const s of allSeqs) {
      const cur = latestSeq.get(s.customerId);
      if (!cur || (s.createdAt ?? 0) > (cur.createdAt ?? 0)) {
        latestSeq.set(s.customerId, s);
      }
    }

    const latestResponse = new Map<string, typeof allResponses[0]>();
    for (const r of allResponses) {
      if (!latestResponse.has(r.customerId)) {
        latestResponse.set(r.customerId, r);
      }
    }

    const data = allCustomers.map(c => {
      const seq = latestSeq.get(c.id) ?? null;
      const resp = latestResponse.get(c.id) ?? null;
      return {
        id:               c.id,
        fname:            c.fname,
        lname:            c.lname,
        status:           c.status,
        price_quote:      c.priceQuote,
        about:            c.about,
        language:         c.language,
        whatsapp_enabled: c.whatsappEnabled,
        phone:            c.phone,
        archetypes: {
          family:           c.archetypeFamily,
          investor:         c.archetypeInvestor,
          environmentalist: c.archetypeEnvironmentalist,
          skeptic:          c.archetypeSkeptic,
        },
        sequence: seq ? {
          ghost_risk_score:    seq.ghostRiskScore,
          close_readiness_score: seq.closeReadinessScore,
          current_day:         seq.currentDay,
          total_days:          seq.totalDays,
        } : null,
        recentResponse: resp ? {
          text:         resp.responseText,
          sentiment:    resp.sentiment,
          action_taken: resp.actionTaken,
        } : null,
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/coaching/customers', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
