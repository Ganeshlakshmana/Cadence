import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getInstallerDb, installers } from '@/db/installerSchema';
import { generateSessionToken, sessionExpiresAt, SESSION_COOKIE, SESSION_TTL_S } from '@/lib/auth/getInstaller';

const Body = z.object({
  email: z.string().email(),
  phone: z.string().min(7),
});

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    const db   = getInstallerDb();
    const now  = Math.floor(Date.now() / 1000);

    const [installer] = await db
      .select()
      .from(installers)
      .where(and(eq(installers.email, body.email), eq(installers.phone, body.phone)))
      .limit(1);

    if (!installer) {
      return NextResponse.json(
        { data: null, error: 'No account found with that email and phone number' },
        { status: 401 },
      );
    }

    const token     = generateSessionToken();
    const expiresAt = sessionExpiresAt();

    await db
      .update(installers)
      .set({ sessionToken: token, sessionExpiresAt: expiresAt, updatedAt: now })
      .where(eq(installers.id, installer.id));

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path:     '/',
      maxAge:   SESSION_TTL_S,
    });

    const { sessionToken: _, sessionExpiresAt: __, ...safe } = installer;
    return NextResponse.json({ data: safe, error: null });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { data: null, error: err.issues[0]?.message ?? 'Validation error' },
        { status: 400 },
      );
    }
    console.error('POST /api/installer/login', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
