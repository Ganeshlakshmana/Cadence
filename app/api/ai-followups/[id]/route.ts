import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, aiFollowups, auditLog } from '@/db/schema';
import { eq } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

const now = () => Math.floor(Date.now() / 1000);

const PatchBody = z.object({
  status: z.enum(['approved', 'rejected']),
});

// PATCH /api/ai-followups/[id]
// Approves or rejects a pending ai_followup; writes to audit_log
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = PatchBody.parse(await req.json());

    const ts = now();

    const updateValues =
      body.status === 'approved'
        ? { status: body.status, approvedAt: ts }
        : { status: body.status };

    const [updated] = await db
      .update(aiFollowups)
      .set(updateValues)
      .where(eq(aiFollowups.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ data: null, error: 'Followup not found' }, { status: 404 });
    }

    await db.insert(auditLog).values({
      actor:      'manager',
      action:     body.status === 'approved' ? 'followup_approved' : 'followup_rejected',
      entityType: 'ai_followup',
      entityId:   id,
      metadata:   JSON.stringify({ customerId: updated.customerId, channel: updated.channel }),
      createdAt:  ts,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: err.issues[0]?.message ?? 'Validation error' },
        { status: 400 },
      );
    }
    console.error('PATCH /api/ai-followups/[id]', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
