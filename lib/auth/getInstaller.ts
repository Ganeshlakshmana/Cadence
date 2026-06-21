import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getInstallerDb, installers } from '@/db/installerSchema';
export { SESSION_COOKIE, SESSION_TTL_S } from './constants';
import { SESSION_COOKIE, SESSION_TTL_S } from './constants';

export type InstallerSession = typeof installers.$inferSelect;

/** Returns the installer if the session cookie is valid, otherwise null. */
export async function getInstallerFromRequest(): Promise<InstallerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getInstallerDb();
  const now = Math.floor(Date.now() / 1000);

  const [installer] = await db
    .select()
    .from(installers)
    .where(eq(installers.sessionToken, token))
    .limit(1);

  if (!installer || !installer.sessionExpiresAt || installer.sessionExpiresAt < now) {
    return null;
  }

  return installer;
}

/** Generates a fresh session token (no DB write — caller must write it). */
export function generateSessionToken(): string {
  return crypto.randomUUID();
}

export function sessionExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_S;
}
