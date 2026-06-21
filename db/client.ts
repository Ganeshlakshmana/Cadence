// Re-export from schema so existing imports of @/db/client continue to work
export { db, closeDb } from './schema';
export type { DB } from './schema';
