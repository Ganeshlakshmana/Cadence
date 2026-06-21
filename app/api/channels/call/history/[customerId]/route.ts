import { NextRequest, NextResponse } from 'next/server';
import { db, callRecords } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const { customerId } = await params;

    const records = await db
      .select()
      .from(callRecords)
      .where(eq(callRecords.customerId, customerId))
      .orderBy(desc(callRecords.createdAt));

    return NextResponse.json({ data: records, error: null });

  } catch (err) {
    console.error('GET /api/channels/call/history/[customerId]', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
