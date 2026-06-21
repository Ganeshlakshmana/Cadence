import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getInstallerDb, installers } from '@/db/installerSchema';
import { SESSION_COOKIE, getInstallerFromRequest } from '@/lib/auth/getInstaller';

export async function POST() {
  try {
    const installer = await getInstallerFromRequest();
    if (installer) {
      await getInstallerDb()
        .update(installers)
        .set({ sessionToken: null, sessionExpiresAt: null })
        .where(eq(installers.id, installer.id));
    }

    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('POST /api/installer/logout', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
