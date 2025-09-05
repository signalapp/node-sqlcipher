import { Buffer } from 'node:buffer';
import { bench, describe } from 'vitest';

import BDatabase from '@signalapp/better-sqlite3';
import { DatabaseSync as NDatabase } from 'node:sqlite';
import Database from '../dist/index.mjs';

const PREPARE = `
  CREATE TABLE t (
    b BLOB
  );
`;

const INSERT = `
  INSERT INTO t (b) VALUES ($b);
`;

const BLOB = Buffer.alloc(16 * 1024);

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
      sinsert.run({ b: BLOB });
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
      binsert.run({ b: BLOB });
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
      ninsert.run({ b: BLOB });
    },
    {
      teardown: () => {
        ndb.exec(DELETE);
      },
    },
  );
});
