import { NextRequest, NextResponse } from 'next/server';
import { db, aiFollowups, customerResponses } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/customers/[id]/followups
// Returns pending ai_followups for this customer, with trigger response text (first 120 chars)
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    const rows = await db
      .select({
        id:               aiFollowups.id,
        responseId:       aiFollowups.responseId,
        customerId:       aiFollowups.customerId,
        triggerReason:    aiFollowups.triggerReason,
        generatedContent: aiFollowups.generatedContent,
        channel:          aiFollowups.channel,
        status:           aiFollowups.status,
        generatedBy:      aiFollowups.generatedBy,
        generatedAt:      aiFollowups.generatedAt,
        approvedAt:       aiFollowups.approvedAt,
        triggerResponseText: customerResponses.responseText,
      })
      .from(aiFollowups)
      .leftJoin(customerResponses, eq(aiFollowups.responseId, customerResponses.id))
      .where(and(
        eq(aiFollowups.customerId, id),
        eq(aiFollowups.status, 'pending_review'),
      ))
      .orderBy(desc(aiFollowups.generatedAt));

    const data = rows.map(r => ({
      ...r,
      triggerResponseText: r.triggerResponseText?.slice(0, 120) ?? null,
    }));

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('GET /api/customers/[id]/followups', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
