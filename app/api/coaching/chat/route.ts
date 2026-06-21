import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db, customers, sequences, customerResponses, products } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function buildContext(focusCustomerId?: string) {
  const [allCustomers, allSeqs, allResponses, allProducts] = await Promise.all([
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    db.select().from(sequences),
    db.select().from(customerResponses).orderBy(desc(customerResponses.respondedAt)),
    db.select().from(products),
  ]);

  const latestSeq = new Map<string, typeof allSeqs[0]>();
  for (const s of allSeqs) {
    const cur = latestSeq.get(s.customerId);
    if (!cur || (s.createdAt ?? 0) > (cur.createdAt ?? 0)) latestSeq.set(s.customerId, s);
  }
  const latestResp = new Map<string, typeof allResponses[0]>();
  for (const r of allResponses) {
    if (!latestResp.has(r.customerId)) latestResp.set(r.customerId, r);
  }

  const list = allCustomers.map(c => {
    const seq  = latestSeq.get(c.id)  ?? null;
    const resp = latestResp.get(c.id) ?? null;
    const archs = [
      c.archetypeFamily           ? `family(${Math.round((c.archetypeFamily)           * 100)}%)` : null,
      c.archetypeInvestor         ? `investor(${Math.round((c.archetypeInvestor)        * 100)}%)` : null,
      c.archetypeEnvironmentalist ? `eco(${Math.round((c.archetypeEnvironmentalist)     * 100)}%)` : null,
      c.archetypeSkeptic          ? `skeptic(${Math.round((c.archetypeSkeptic)          * 100)}%)` : null,
    ].filter(Boolean).join(', ');

    const product = c.productId ? allProducts.find(p => p.id === c.productId) : null;
    return {
      id:      c.id,
      name:    `${c.fname} ${c.lname}`,
      status:  c.status ?? 'lead',
      quote:   c.priceQuote ? `€${c.priceQuote.toLocaleString()}` : null,
      phone:   c.phone ?? null,
      lang:    c.language ?? 'en',
      wa:      c.whatsappEnabled ? 'yes' : 'no',
      about:   c.about ?? null,
      archs,
      product: product ? `${product.name} (${product.type}, €${Math.round(product.priceBase ?? 0).toLocaleString()}, ${product.warrantyYears}yr warranty)` : null,
      seq: seq ? {
        ghost:   Math.round((seq.ghostRiskScore    ?? 0) * 100),
        ready:   Math.round((seq.closeReadinessScore ?? 0) * 100),
        day:     `${seq.currentDay ?? 0}/${seq.totalDays ?? 30}`,
      } : null,
      last_response: resp ? { text: resp.responseText, sentiment: resp.sentiment } : null,
    };
  });

  const productCatalog = allProducts.map(p => ({
    name: p.name, sku: p.sku, type: p.type,
    price: p.priceBase ? `€${Math.round(p.priceBase).toLocaleString()}` : null,
    warranty: p.warrantyYears ? `${p.warrantyYears}yr` : null,
    best_for: p.targetArchetype,
    description: p.description,
  }));

  let focusNote = '';
  if (focusCustomerId) {
    const fc = list.find(c => c.id === focusCustomerId);
    if (fc) focusNote = `\n\nACTIVE CUSTOMER (installer opened panel from their row): ${JSON.stringify(fc, null, 2)}`;
  }

  return { list, focusNote, productCatalog };
}

const SYSTEM = `You are Max, the AI sales coach built into Cadence Solar's CRM. You speak directly to the installer.

REONIC PRODUCT CATALOGUE:
{{PRODUCTS}}

FULL CUSTOMER DATABASE:
{{CUSTOMERS}}
{{FOCUS}}

YOUR CAPABILITIES:
- List customers filtered by status / ghost risk / close readiness
- Give a pre-call coaching brief on any customer (what to say, which angle, what to avoid)
- Suggest personalised opening lines and objection responses based on archetypes:
  · family → energy independence, savings for kids, home value
  · investor → ROI, payback period, feed-in tariff income
  · eco → CO2 impact, green credentials, renewable future
  · skeptic → data, warranties, case studies, risk mitigation
- Answer "what services / products do we offer" by referencing the REONIC PRODUCT CATALOGUE above
- Recommend specific products to a customer based on their archetype and budget
- Explain HOW to sell a specific product to a specific customer (angle, opener, objection handling)
- Advise on follow-up channel + timing after a call
- Identify which deals are at risk or ready to close

PRODUCT SELLING TIPS:
- Family archetype → lead with ReoStore battery (power independence, outage protection) + ReoPack Family Plus
- Investor archetype → lead with ROI numbers, payback period, ReoPack Investor Pro or Commercial 50kW
- Eco archetype → lead with CO₂ certificate, supply-chain transparency, ReoPack Eco Complete
- Skeptic archetype → use ReoPanel 400W (proven, certified, 25yr warranty), be transparent about specs

STYLE: Be concise and direct. Use bullet points for lists. Max 150 words unless asked for more. Never make up data — only use what's in the database.`;

export async function POST(req: NextRequest) {
  try {
    const { message, history = [], customerId } = await req.json() as {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
      customerId?: string;
    };

    const { list, focusNote, productCatalog } = await buildContext(customerId);
    const system = SYSTEM
      .replace('{{PRODUCTS}}',   JSON.stringify(productCatalog, null, 2))
      .replace('{{CUSTOMERS}}',  JSON.stringify(list, null, 2))
      .replace('{{FOCUS}}',      focusNote);

    const msgs: Anthropic.MessageParam[] = [
      ...history.slice(-12).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ];

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 600,
      system,
      messages:   msgs,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('POST /api/coaching/chat', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
