import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, customerResponses } from '@/db/schema';
import { desc } from 'drizzle-orm';

async function buildCustomersList() {
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

  const pct = (v: number | null | undefined) => v != null ? Math.round(v * 100) : 0;
  const trunc = (s: string | null | undefined, n = 80) => s ? s.slice(0, n) : null;

  // Keep payload small — ElevenLabs dynamic variable has a size limit
  return allCustomers.slice(0, 30).map(c => {
    const seq  = latestSeq.get(c.id)  ?? null;
    const resp = latestResponse.get(c.id) ?? null;
    return {
      id:     c.id,
      name:   `${c.fname} ${c.lname}`,
      status: c.status ?? 'lead',
      quote:  c.priceQuote ? `€${Math.round(c.priceQuote).toLocaleString()}` : null,
      arch:   [
        c.archetypeFamily           ? `family:${pct(c.archetypeFamily)}%`           : null,
        c.archetypeInvestor         ? `investor:${pct(c.archetypeInvestor)}%`        : null,
        c.archetypeEnvironmentalist ? `eco:${pct(c.archetypeEnvironmentalist)}%`     : null,
        c.archetypeSkeptic          ? `skeptic:${pct(c.archetypeSkeptic)}%`          : null,
      ].filter(Boolean).join(', '),
      seq: seq ? `ghost:${pct(seq.ghostRiskScore)}% ready:${pct(seq.closeReadinessScore)}% day:${seq.currentDay ?? 0}/${seq.totalDays ?? 30}` : null,
      note:   trunc(c.about),
      resp:   resp ? `${resp.sentiment}:${trunc(resp.responseText, 60)}` : null,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { customer_id?: string };
    const { customer_id } = body;

    let customersList = await buildCustomersList();

    if (customer_id) {
      const idx = customersList.findIndex(c => c.id === customer_id);
      if (idx > 0) {
        const [target] = customersList.splice(idx, 1);
        customersList = [target, ...customersList];
      }
    }

    // Append a UI context note so Max knows the panel shows customer cards
    const UI_NOTE = '\n\n[PANEL_UI] The installer sees a live customer data card in the panel while talking to you. When any customer name is mentioned — by you or the installer — their card auto-appears on screen. If asked to "show", "display", or "pull up" data, respond: "Their card is on your panel right now — you can see all the details there." NEVER say you cannot display or show data.';

    return NextResponse.json({
      agentId:       process.env.ELEVENLABS_COACHING_AGENT_ID,
      customersList,
      uiNote:        UI_NOTE,
    });
  } catch (err) {
    console.error('POST /api/coaching/session', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
