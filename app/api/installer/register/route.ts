import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getInstallerDb, installers } from '@/db/installerSchema';
import { generateSessionToken, sessionExpiresAt, SESSION_COOKIE, SESSION_TTL_S } from '@/lib/auth/getInstaller';

const Body = z.object({
  fullName:    z.string().min(2),
  email:       z.string().email(),
  phone:       z.string().min(7),
  companyName: z.string().min(1),
  role:        z.enum(['installer', 'sales_rep', 'manager']).default('installer'),
});

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    const db   = getInstallerDb();
    const now  = Math.floor(Date.now() / 1000);

    // Duplicate check
    const existing = await db
      .select({ id: installers.id, email: installers.email, phone: installers.phone })
      .from(installers)
      .where(or(eq(installers.email, body.email), eq(installers.phone, body.phone)))
      .limit(1);

    if (existing.length > 0) {
      const field = existing[0].email === body.email ? 'email' : 'phone number';
      return NextResponse.json(
        { data: null, error: `An account with that ${field} already exists` },
        { status: 409 },
      );
    }

    const token     = generateSessionToken();
    const expiresAt = sessionExpiresAt();

    const [installer] = await db
      .insert(installers)
      .values({
        id:               crypto.randomUUID(),
        fullName:         body.fullName,
        email:            body.email,
        phone:            body.phone,
        companyName:      body.companyName,
        role:             body.role,
        sessionToken:     token,
        sessionExpiresAt: expiresAt,
        createdAt:        now,
        updatedAt:        now,
      })
      .returning();

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path:     '/',
      maxAge:   SESSION_TTL_S,
    });

    const { sessionToken: _, sessionExpiresAt: __, ...safe } = installer;
    return NextResponse.json({ data: safe, error: null }, { status: 201 });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: err.issues[0]?.message ?? 'Validation error' },
        { status: 400 },
      );
    }
    console.error('POST /api/installer/register', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
