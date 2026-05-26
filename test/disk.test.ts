import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';

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

describe('setWalHook', () => {
  beforeEach(() => {
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t (a INTEGER)');
  });

  test('calls hook after WAL commit', () => {
    const hook = vi.fn();
    db.setWalHook(hook);

    db.prepare('INSERT INTO t (a) VALUES (1)').run();

    expect(hook).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledWith('main', expect.any(Number));
  });

  test('hook receives page count > 0', () => {
    let pageCount: number | null = null;
    db.setWalHook((_dbName, n) => {
      pageCount = n;
    });

    db.prepare('INSERT INTO t (a) VALUES (1)').run();

    expect(pageCount).toBeGreaterThan(0);
  });

  test('hook fires once per commit', () => {
    const hook = vi.fn();
    db.setWalHook(hook);

    db.transaction(() => {
      db.prepare('INSERT INTO t (a) VALUES (1)').run();
      db.prepare('INSERT INTO t (a) VALUES (2)').run();
    })();

    expect(hook).toHaveBeenCalledOnce();
  });

  test('replaces previous hook', () => {
    const first = vi.fn();
    const second = vi.fn();

    db.setWalHook(first);
    db.setWalHook(second);

    db.prepare('INSERT INTO t (a) VALUES (1)').run();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  test('silently ignores exceptions thrown by hook', () => {
    let called = false;
    db.setWalHook(() => {
      called = true;
      throw new Error('hook error');
    });

    expect(() =>
      db.prepare('INSERT INTO t (a) VALUES (1)').run(),
    ).not.toThrow();
    expect(called).toBe(true);
  });

  test('throws when database is closed', () => {
    db.close();
    expect(() => db.setWalHook(vi.fn())).toThrowError('Database closed');
    db = new Database(join(dir, 'db2.sqlite'));
  });

  test('throws for invalid argument', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => db.setWalHook(123 as any)).toThrowError('Invalid fn argument');
  });
});
