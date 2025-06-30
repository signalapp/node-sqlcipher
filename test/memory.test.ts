import { describe, expect, test, beforeEach, afterEach } from 'vitest';

import Database from '../lib/index.js';

const rows = [
  {
    a: 1,
    b: '123',
    c: Buffer.from('abba', 'hex'),
  },
  {
    a: 2,
    b: '456',
    c: Buffer.from('dada', 'hex'),
  },
  {
    a: 3,
    b: '789',
    c: null,
  },
];

let db: Database;
beforeEach(() => {
  db = new Database();

  db.exec(`
    CREATE TABLE t (a INTEGER, b TEXT, c BLOB);

    INSERT INTO t (a, b, c) VALUES
      (1, '123', x'abba'),
      (2, '456', x'dada'),
      (3, '789', NULL);
  `);
});

afterEach(() => {
  db.close();
});

test('db.close', () => {
  db.close();
  expect(() => db.close()).toThrowError('Database already closed');

  expect(() => db.exec('')).toThrowError('Database closed');
  expect(() => db.prepare('')).toThrowError('Database closed');

  // Just to fix afterEach
  db = new Database();
});

test('db.close with existing statement', () => {
  const stmt = db.prepare('SELECT 1');
  db.close();

  expect(() => stmt.run()).toThrowError('Statement closed');

  // Just to fix afterEach
  db = new Database();
});

test('statement.close', () => {
  const stmt = db.prepare('SELECT 1');
  stmt.close();

  expect(() => stmt.close()).toThrowError('Statement already closed');
});

test('statement.run', () => {
  expect(db.prepare('SELECT * FROM t').run()).toEqual({
    changes: 0,
    lastInsertRowid: 3,
  });

  expect(
    db.prepare(`INSERT INTO t (a, b, c) VALUES (4, '4', NULL)`).run(),
  ).toEqual({
    changes: 1,
    lastInsertRowid: 4,
  });
});

test('statement.run after close', () => {
  const stmt = db.prepare('SELECT 1');
  stmt.close();
  expect(() => stmt.run()).toThrowError('Statement closed');
});

test('statement.get', () => {
  expect(
    db
      .prepare('SELECT * FROM t')
      .get<{ a: number; b: string; c: Uint8Array }>(),
  ).toEqual(rows[0]);
});

test('statement.get after close', () => {
  const stmt = db.prepare('SELECT 1');
  stmt.close();
  expect(() => stmt.get()).toThrowError('Statement closed');
});

test('statement.all', () => {
  expect(db.prepare('SELECT * FROM t').all()).toEqual(rows);
});

test('statement.all after close', () => {
  const stmt = db.prepare('SELECT 1');
  stmt.close();
  expect(() => stmt.all()).toThrowError('Statement closed');
});

test('statement.get persistent=true', () => {
  expect(db.prepare('SELECT * FROM t', { persistent: true }).get()).toEqual(
    rows[0],
  );
});

test('statement.get persistent=true with undefined', () => {
  db.exec('DELETE FROM t');
  expect(
    db.prepare('SELECT * FROM t', { persistent: true }).get(),
  ).toBeUndefined();
});

test('statement.all persistent=true', () => {
  expect(db.prepare('SELECT * FROM t', { persistent: true }).all()).toEqual(
    rows,
  );
});

test('statement.get pluck=true', () => {
  expect(db.prepare('SELECT a FROM t', { pluck: true }).get()).toEqual(1);
});

test('statement.all pluck=true', () => {
  expect(db.prepare('SELECT a FROM t', { pluck: true }).all()).toEqual([
    1, 2, 3,
  ]);
});

test('statement.get persistent=true, pluck=true', () => {
  expect(
    db.prepare('SELECT a FROM t', { persistent: true, pluck: true }).get(),
  ).toEqual(1);
});

test('statement.all persistent=true, pluck=true', () => {
  expect(
    db.prepare('SELECT a FROM t', { persistent: true, pluck: true }).all(),
  ).toEqual([1, 2, 3]);
});

test('pragma', () => {
  db.pragma('user_version = 123');
  expect(db.pragma('user_version')).toEqual([{ user_version: 123 }]);
});

test('smple pragma', () => {
  db.pragma('user_version = 123');
  expect(db.pragma('user_version', { simple: true })).toEqual(123);
});

test('too many columns for pluck', () => {
  const stmt = db.prepare('SELECT * FROM t', { pluck: true });
  expect(() => stmt.get()).toThrowError('Invalid column count for pluck');
});

test('persistent statement recompilation', () => {
  const stmt = db.prepare('SELECT * FROM t', { persistent: true });
  expect(stmt.get()).toEqual(rows[0]);

  db.exec(`ALTER TABLE t ADD COLUMN d TEXT DEFAULT 'hello'`);

  expect(stmt.get()).toEqual({
    a: 1,
    b: '123',
    c: Buffer.from('abba', 'hex'),
    d: 'hello',
  });
});

describe('list parameters', () => {
  test('correct count', () => {
    expect(db.prepare('SELECT * FROM t WHERE a > ?').get([2])).toEqual(rows[2]);
  });

  test('incorrect count', () => {
    const stmt = db.prepare('SELECT * FROM t WHERE a > ?');
    expect(() => stmt.get([2, 3])).toThrowError('Expected 1 parameters, got 2');
  });

  test('absent parameters', () => {
    const stmt = db.prepare('SELECT * FROM t WHERE a > ?');
    expect(() => stmt.get()).toThrowError('Expected 1 parameters, got 0');
  });

  test('object parameters', () => {
    const stmt = db.prepare('SELECT * FROM t WHERE a > ?');
    expect(() => stmt.get({})).toThrowError('Unexpected anonymous param at 1');
  });

  test('against named parameters', () => {
    const stmt = db.prepare('SELECT * FROM t WHERE a > $a');
    expect(() => stmt.get([2])).toThrowError('Unexpected named param $a at 1');
  });
});

describe('object parameters', () => {
  test('correct count', () => {
    expect(db.prepare('SELECT * FROM t WHERE a > $a').get({ a: 2 })).toEqual(
      rows[2],
    );
  });

  test('undefined param', () => {
    const stmt = db.prepare('SELECT * FROM t WHERE a > $a');
    expect(() => stmt.get({})).toThrowError(
      'Failed to bind param a, error unexpected type `undefined`',
    );
  });

  test('absent parameters', () => {
    const stmt = db.prepare('SELECT * FROM t WHERE a > $a');
    expect(() => stmt.get()).toThrowError('Expected 1 parameters, got 0');
  });

  test('against anonymous parameters', () => {
    const stmt = db.prepare('SELECT * FROM t WHERE a > ?');
    expect(() => stmt.get({ a: 1 })).toThrowError(
      'Unexpected anonymous param at 1',
    );
  });
});

describe('tail', () => {
  test('allow trailing --', () => {
    db.prepare('SELECT 1; --');
  });

  test('allow trailing /*', () => {
    db.prepare('SELECT 1; /*');
  });

  test('disallow statement after comments', () => {
    expect(() =>
      db.prepare('SELECT 1; -- asdfasdf\n/*\n*/SELECT 2'),
    ).toThrowError("Can't prepare more than one statement");
  });

  test('disallow trailing /', () => {
    expect(() => db.prepare('SELECT 1; /')).toThrowError(
      "Can't prepare more than one statement",
    );
  });

  test('disallow trailing -', () => {
    expect(() => db.prepare('SELECT 1; -')).toThrowError(
      "Can't prepare more than one statement",
    );
  });
});

test('invalid null params', () => {
  const stmt = db.prepare('SELECT 1');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(() => stmt.get(null as any)).toThrowError('Params cannot be null');
});

test('invalid params', () => {
  const stmt = db.prepare('SELECT 1');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(() => stmt.get(123 as any)).toThrowError(
    'Params must be either object or array',
  );
});

test('invalid database path', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(() => new Database(123 as any)).toThrowError('Invalid database path');
});

test('invalid exec query', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(() => db.exec(123 as any)).toThrowError('Invalid sql argument');
});

test('invalid prepare query', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(() => db.prepare(123 as any)).toThrowError('Invalid query argument');
});

test('invalid pragma query', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(() => db.pragma(123 as any)).toThrowError('Invalid pragma argument');
});

describe('transaction', () => {
  test('commit', () => {
    db.transaction(() => {
      db.prepare(`INSERT INTO t (a, b) VALUES (42, 'success')`).run();
    })();

    expect(
      db.prepare('SELECT b FROM t WHERE a IS 42', { pluck: true }).get(),
    ).toEqual('success');
  });

  test('rollback', () => {
    db.prepare(`INSERT INTO t (a, b) VALUES (42, 'success')`).run();

    expect(() =>
      db.transaction(() => {
        db.prepare(`UPDATE t SET b = 'fail' WHERE A is 42`).run();
        throw new Error('rollback');
      })(),
    ).toThrowError('rollback');

    expect(
      db.prepare('SELECT b FROM t WHERE a IS 42', { pluck: true }).get(),
    ).toEqual('success');
  });

  test('nested rollback', () => {
    db.transaction(() => {
      db.prepare(`INSERT INTO t (a, b) VALUES (42, 'success')`).run();

      expect(() =>
        db.transaction(() => {
          db.prepare(`UPDATE t SET b = 'fail' WHERE A is 42`).run();
          throw new Error('rollback');
        })(),
      ).toThrowError('rollback');
    })();

    expect(
      db.prepare('SELECT b FROM t WHERE a IS 42', { pluck: true }).get(),
    ).toEqual('success');
  });
});

test('single-copy strings', () => {
  db.exec(`
    DROP TABLE t;

    CREATE TABLE t (rowid INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL);

    INSERT INTO t (value) VALUES ('0a'), ('0a'), ('0a'), ('0a'), ('0a');
  `);

  expect(
    db
      .prepare('SELECT rowid FROM t WHERE value IS ?', {
        pluck: true,
      })
      .all(['0a']),
  ).toEqual([1, 2, 3, 4, 5]);
});

test('number mode', () => {
  db.exec(
    `
    DELETE FROM t;
    -- MAX_INT64
    INSERT INTO t (a) VALUES (1152921504606846975);
    `,
  );

  expect(db.prepare('SELECT a FROM t', { pluck: true }).get()).toEqual(
    1152921504606847000,
  );
});

test('bigint mode', () => {
  db.exec(`
    DELETE FROM t;
  `);

  const n = 0x7fff_ffff_ffff_ffffn;

  db.prepare(
    `
    INSERT INTO t (a) VALUES (?);
    `,
    { bigint: true },
  ).run([n]);

  expect(
    db.prepare('SELECT a FROM t', { pluck: true, bigint: true }).get(),
  ).toEqual(n);
});

test('extended error codes', () => {
  db.exec(`
    CREATE TABLE parent (id INTEGER PRIMARY KEY);

    CREATE TABLE refs (id INTEGER, FOREIGN KEY (id) REFERENCES parent(id));
  `);

  const stmt = db.prepare('INSERT INTO refs (id) VALUES (?)');

  expect(() => stmt.run([4])).toThrowError(
    expect.objectContaining({
      message:
        'sqlite error(SQLITE_CONSTRAINT_FOREIGNKEY): ' +
        'FOREIGN KEY constraint failed',
      code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
    }),
  );
});

test('tokenizer setup', () => {
  db.initTokenizer();
});

test('tokenizer setup after close', () => {
  db.close();
  expect(() => db.initTokenizer()).toThrowError('Database closed');

  // Just to fix afterEach
  db = new Database();
});

test('signalTokenize', () => {
  expect(db.signalTokenize('a b c')).toEqual(['a', 'b', 'c']);
});

test('invalid argument for signalTokenize', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(() => db.signalTokenize(123 as any)).toThrowError('Invalid value');
});

test('does not cache statements', () => {
  expect(db.prepare('SELECT 1')).not.toBe(db.prepare('SELECT 1'));
});

describe('statement cache', () => {
  let cachedDb: Database;
  beforeEach(() => {
    cachedDb = new Database(':memory:', { cacheStatements: true });

    cachedDb.exec(`
      CREATE TABLE t (a INTEGER, b TEXT, c BLOB);

      INSERT INTO t (a, b, c) VALUES
        (1, '123', x'abba'),
        (2, '456', x'dada'),
        (3, '789', NULL);
    `);
  });

  afterEach(() => {
    cachedDb.close();
  });

  test('caches statements', () => {
    expect(cachedDb.prepare('SELECT 1')).toBe(cachedDb.prepare('SELECT 1'));
  });

  test('uses query in cache key', () => {
    expect(cachedDb.prepare('SELECT 1')).not.toBe(cachedDb.prepare('SELECT 2'));
  });

  test('uses pluck in cache key', () => {
    expect(cachedDb.prepare('SELECT 1')).not.toBe(
      cachedDb.prepare('SELECT 1', { pluck: true }),
    );
  });

  test('uses bigint in cache key', () => {
    expect(cachedDb.prepare('SELECT 1')).not.toBe(
      cachedDb.prepare('SELECT 1', { bigint: true }),
    );
  });

  test('invalidates cache on close', () => {
    const stmt = cachedDb.prepare('SELECT 1');
    stmt.close();
    expect(stmt).not.toBe(cachedDb.prepare('SELECT 1'));
  });

  test('does not cache persistent=false statements', () => {
    expect(cachedDb.prepare('SELECT 1', { persistent: false })).not.toBe(
      cachedDb.prepare('SELECT 1', { persistent: false }),
    );
  });
});
