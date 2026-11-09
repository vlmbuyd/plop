import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as schema from './schema';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url));

export type Db = ReturnType<typeof createDb>;

/** 매일 쓰는 데이터 위치. 개발 중에는 PLOP_DATA_DIR로 저장소 안 .data를 쓴다. */
export function resolveDataDir() {
  return process.env.PLOP_DATA_DIR ?? join(homedir(), 'Library', 'Application Support', 'Plop');
}

/** path에 ':memory:'를 넘기면 테스트용 메모리 DB를 만든다. */
export function createDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return db;
}

export function openDataDb() {
  const dir = resolveDataDir();
  mkdirSync(dir, { recursive: true });

  return createDb(join(dir, 'plop.db'));
}
