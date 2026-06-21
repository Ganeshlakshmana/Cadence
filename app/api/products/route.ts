import { NextResponse } from 'next/server';
import { db, products } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const all = await db.select().from(products).where(eq(products.active, 1));
    return NextResponse.json({ data: all, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
