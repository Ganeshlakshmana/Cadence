import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, auditLog, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateSequence } from '@/lib/llm/sequenceGenerator';
import { getMarketContext } from '@/lib/persuasion/marketContext';
import { z } from 'zod';

const now = () => Math.floor(Date.now() / 1000);

const LANG_TO_COUNTRY: Record<string, string> = {
  de: 'DE', en: 'US', es: 'ES', fr: 'FR', nl: 'NL', it: 'IT',
};

const GenerateBody = z.object({
  customerId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = GenerateBody.parse(await req.json());

    // ── Step 1: Load customer ────────────────────────────────────────────────
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, body.customerId))
      .limit(1);

    if (!cust) {
      return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
    }

    // ── Step 2: Consent gate ─────────────────────────────────────────────────
    if (!cust.consentDataProcessing) {
      return NextResponse.json(
        { data: null, error: 'Customer has not given consent for data processing (consent_data_processing must be 1)' },
        { status: 403 },
      );
    }

    // ── Step 3: Market context + product lookup ──────────────────────────────
    const countryCode = LANG_TO_COUNTRY[cust.language ?? 'en'] ?? 'US';
    const marketContextBlock = getMarketContext(countryCode);

    let product: typeof products.$inferSelect | null = null;
    if (cust.productId) {
      const [p] = await db.select().from(products).where(eq(products.id, cust.productId)).limit(1);
      product = p ?? null;
    }

    // ── Step 4: Generate sequence via Claude Sonnet ──────────────────────────
    const generated = await generateSequence({
      fname:                     cust.fname,
      lname:                     cust.lname,
      language:                  cust.language ?? 'en',
      postalCode:                cust.postalCode,
      priceQuote:                cust.priceQuote ?? 0,
      archetypeFamily:           cust.archetypeFamily ?? 0,
      archetypeInvestor:         cust.archetypeInvestor ?? 0,
      archetypeEnvironmentalist: cust.archetypeEnvironmentalist ?? 0,
      archetypeSkeptic:          cust.archetypeSkeptic ?? 0,
      about:                     cust.about,
      marketContextBlock,
      productName:               product?.name ?? null,
      productType:               product?.type ?? null,
      productDescription:        product?.description ?? null,
      productWarranty:           product?.warrantyYears ? `${product.warrantyYears}-year` : null,
    });

    // ── Step 5: Persist ──────────────────────────────────────────────────────
    const ts = now();

    const [newSeq] = await db.insert(sequences).values({
      customerId:          body.customerId,
      totalDays:           30,
      currentDay:          0,
      status:              'active',
      ghostRiskScore:      generated.ghost_risk_score,
      closeReadinessScore: generated.close_readiness_score,
      rationale:           generated.rationale,
      generatedBy:         'claude-sonnet-4-6',
      createdAt:           ts,
      updatedAt:           ts,
    }).returning();

    const insertedTouches = await db.insert(touchpoints).values(
      generated.touches.map(t => ({
        sequenceId:      newSeq.id,
        customerId:      body.customerId,
        dayOffset:       t.day_offset,
        channel:         t.channel,
        contentSubject:  t.content_subject ?? null,
        contentBody:     t.content_body,
        contentImageUrl: t.content_image_url ?? null,
        reasoning:       t.reasoning,
        abVariant:       t.ab_variant ?? null,
        status:          'pending' as const,
        createdAt:       ts,
      }))
    ).returning();

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'sequence.generated',
      entityType: 'sequence',
      entityId:   newSeq.id,
      metadata:   JSON.stringify({
        customerId:   body.customerId,
        touchCount:   insertedTouches.length,
        generatedBy:  'claude-sonnet-4-6',
        ghostRisk:    generated.ghost_risk_score,
        closeReady:   generated.close_readiness_score,
      }),
      createdAt: ts,
    });

    return NextResponse.json({
      data: {
        id:                  newSeq.id,
        customerId:          body.customerId,
        status:              newSeq.status,
        ghostRiskScore:      newSeq.ghostRiskScore,
        closeReadinessScore: newSeq.closeReadinessScore,
        rationale:           newSeq.rationale,
        generatedBy:         newSeq.generatedBy,
        touches:             insertedTouches,
      },
      error: null,
    }, { status: 201 });

  } catch (err) {
    console.error('POST /api/strategy/generate', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
