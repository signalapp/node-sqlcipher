import { Buffer } from 'node:buffer';
import { bench, describe } from 'vitest';

import BDatabase from '@signalapp/better-sqlite3';
import Database from '../lib/index.js';

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

  sdb.exec(PREPARE);
  bdb.exec(PREPARE);

  const sinsert = sdb.prepare(INSERT);
  const binsert = bdb.prepare(INSERT);

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
});
