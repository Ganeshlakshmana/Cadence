import { NextRequest, NextResponse } from 'next/server';
import { db, customers, touchpoints } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateImageCard, type CardOverrides } from '@/lib/channels/renderWhatsAppCard';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const SYSTEM = `You are Max, an AI assistant helping solar energy sales installers customize their WhatsApp proposal cards.
When the installer describes what they want changed, extract the requested changes as JSON.
Only output valid JSON with these optional fields:
{
  "subtitle": "new subtitle text (max 70 chars)",
  "statLine": "new price/savings line (max 60 chars)",
  "badge": "new badge text (max 20 chars)",
  "customCaption": "extra caption line (max 80 chars)"
}
If a field isn't changed, omit it. Keep unchanged fields at their current values.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: touchId } = await params;
    const { request, currentOverrides } = await req.json() as {
      request: string;
      currentOverrides?: CardOverrides;
    };

    const [touch] = await db.select().from(touchpoints).where(eq(touchpoints.id, touchId)).limit(1);
    if (!touch) return NextResponse.json({ error: 'Touch not found' }, { status: 404 });

    const [cust] = await db.select().from(customers).where(eq(customers.id, touch.customerId)).limit(1);
    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // Ask Max (Claude) to interpret the installer's request
    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Current card data:
- Customer: ${cust.fname} ${cust.lname}
- Price: €${cust.priceQuote ?? 'pending'}
- Current subtitle: "${touch.contentSubject ?? 'Personalized Solar Proposal'}"
- Current overrides: ${JSON.stringify(currentOverrides ?? {})}

Installer request: "${request}"

Output only JSON with the fields to change.`,
        },
      ],
    });

    let overrides: CardOverrides = currentOverrides ?? {};
    try {
      const text = completion.content[0].type === 'text' ? completion.content[0].text : '{}';
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      overrides = { ...overrides, ...parsed };
    } catch {
      // Keep current overrides if parse fails
    }

    // Regenerate image with new overrides
    const imageUrl = await generateImageCard(cust, touch, overrides);

    // Persist updated image URL
    await db.update(touchpoints).set({ contentImageUrl: imageUrl }).where(eq(touchpoints.id, touchId));

    return NextResponse.json({ data: { image_url: imageUrl, overrides }, error: null });
  } catch (err) {
    console.error('POST /api/touch/[id]/regenerate-image', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
