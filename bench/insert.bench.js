import { bench, describe } from 'vitest';

import BDatabase from '@signalapp/better-sqlite3';
import { DatabaseSync as NDatabase } from 'node:sqlite';
import Database from '../dist/index.mjs';

const PREPARE = `
  CREATE TABLE t (
    a1 INTEGER,
    a2 INTEGER,
    a3 INTEGER,
    b1 TEXT,
    b2 TEXT,
    b3 TEXT
  );
`;

const INSERT = `
  INSERT INTO t (a1, a2, a3, b1, b2, b3) VALUES
    ($a1, $a2, $a3, $b1, $b2, $b3);
`;

const DELETE = 'DELETE FROM t';

describe('INSERT INTO t', () => {
  const sdb = new Database(':memory:', { cacheStatements: true });
  const bdb = new BDatabase(':memory:');
  const ndb = new NDatabase(':memory:');

  sdb.exec(PREPARE);
  bdb.exec(PREPARE);
  ndb.exec(PREPARE);

  const sinsert = sdb.prepare(INSERT);
  const binsert = bdb.prepare(INSERT);
  const ninsert = ndb.prepare(INSERT);

  bench(
    '@signalapp/sqlcipher',
    () => {
      sinsert.run({ a1: 1, a2: 2, a3: 3, b1: 'b1', b2: 'b2', b3: 'b3' });
    },
    {
      teardown: () => {
        sdb.exec(DELETE);
      },
    },
  );

  bench(
    '@signalapp/better-sqlite',
    () => {
      binsert.run({ a1: 1, a2: 2, a3: 3, b1: 'b1', b2: 'b2', b3: 'b3' });
    },
    {
      teardown: () => {
        bdb.exec(DELETE);
      },
    },
  );

  bench(
    'node:sqlite',
    () => {
      ninsert.run({ a1: 1, a2: 2, a3: 3, b1: 'b1', b2: 'b2', b3: 'b3' });
    },
    {
      teardown: () => {
        ndb.exec(DELETE);
      },
    },
  );
});
