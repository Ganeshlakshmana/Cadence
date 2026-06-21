import { NextRequest, NextResponse } from 'next/server';
import { db, customers, sequences, touchpoints, customerResponses } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { writeAuditLog } from '@/lib/compliance/auditLog';

const now = () => Math.floor(Date.now() / 1000);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      customer_id: string;
      outcome: 'accepted' | 'declined' | 'callback' | 'needs_follow_up';
      what_worked?: string;
      what_to_try_next?: string;
      suggested_next_touch?: { channel: string; timing: string };
    };

    const { customer_id, outcome, what_worked, what_to_try_next, suggested_next_touch } = body;

    if (!customer_id || !outcome) {
      return NextResponse.json({ error: 'Missing customer_id or outcome' }, { status: 400 });
    }

    // 1. Update customer status if accepted
    if (outcome === 'accepted') {
      await db
        .update(customers)
        .set({ status: 'negotiating', updatedAt: now() })
        .where(eq(customers.id, customer_id));
    }

    // 2. Insert touchpoint for callback / needs_follow_up
    let touchpointCreated = false;
    if (outcome === 'needs_follow_up' || outcome === 'callback') {
      const seqs = await db
        .select()
        .from(sequences)
        .where(eq(sequences.customerId, customer_id))
        .orderBy(desc(sequences.createdAt));

      const latestSeq = seqs[0];
      if (latestSeq) {
        await db.insert(touchpoints).values({
          customerId:  customer_id,
          sequenceId:  latestSeq.id,
          dayOffset:   (latestSeq.currentDay ?? 0) + 2,
          channel:     suggested_next_touch?.channel ?? 'email',
          contentBody: what_to_try_next ?? null,
          status:      'pending',
          reasoning:   'Suggested by Max coaching agent after installer call',
          createdAt:   now(),
        });
        touchpointCreated = true;
      }
    }

    // 3. Insert customer response
    const sentiment =
      outcome === 'accepted' ? 'positive' :
      outcome === 'declined' ? 'negative' : 'neutral';

    const actionTaken = outcome === 'accepted' ? 'called_back' : 'replied';

    await db.insert(customerResponses).values({
      customerId:   customer_id,
      channel:      'phone_call',
      responseText: `${what_worked ?? ''} — ${what_to_try_next ?? ''}`,
      sentiment,
      actionTaken,
      respondedAt:  Date.now(),
      createdAt:    now(),
    });

    // 4. Audit log
    await writeAuditLog({
      actor:      'installer_user',
      action:     'coaching_session_completed',
      entityType: 'customer',
      entityId:   customer_id,
      metadata:   { outcome, touchpointCreated },
    });

    return NextResponse.json({ success: true, touchpoint_created: touchpointCreated });
  } catch (err) {
    console.error('POST /api/coaching/outcome', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
