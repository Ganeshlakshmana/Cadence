import { NextResponse } from 'next/server';
import { getInstallerFromRequest } from '@/lib/auth/getInstaller';

export async function GET() {
  try {
    const installer = await getInstallerFromRequest();
    if (!installer) {
      return NextResponse.json({ data: null, error: 'Not authenticated' }, { status: 401 });
    }

    const { sessionToken: _, sessionExpiresAt: __, ...safe } = installer;
    return NextResponse.json({ data: safe, error: null });
  } catch (err) {
    console.error('GET /api/installer/me', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
