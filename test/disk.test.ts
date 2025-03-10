import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, beforeEach, afterEach } from 'vitest';

import Database from '../lib/index.js';

let dir: string;
let db: Database;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sqlcipher-'));
  db = new Database(join(dir, 'db.sqlite'));
});

afterEach(async () => {
  try {
    db.close();
  } finally {
    try {
      await rm(dir, { recursive: true });
    } catch {
      // Best-effort
    }
  }
});

test.each([[false], [true]])('ciphertext=%j', (ciphertext) => {
  if (ciphertext) {
    db.pragma(`key = 'hello world'`);
  }
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');

  db.exec(`
    CREATE TABLE t (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const stmt = db.prepare(
    `INSERT INTO t (name, value) VALUES ($name, $value) RETURNING id`,
    { pluck: true },
  );

  const id = db.transaction(() => {
    const result = stmt.get<number>({ name: 'Adam', value: 'Sandler' });
    expect(result).not.toBeUndefined();
    if (result === undefined) {
      throw new Error('Pacify typescript');
    }

    return result;
  })();

  const row = db
    .prepare(
      `
    SELECT name, value FROM t WHERE id IS $id
  `,
    )
    .get({ id });

  expect(row).toEqual({ name: 'Adam', value: 'Sandler' });
});
