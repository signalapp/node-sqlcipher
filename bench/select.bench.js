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

const VALUES = [];
for (let i = 0; i < 100; i += 1) {
  VALUES.push({
    a1: i,
    a2: i ** 2,
    a3: i ** 3,
    b1: `b1-${i}`,
    b2: `b2-${i}`,
    b3: `b3-${i}`,
  });
}

const SELECT = 'SELECT * FROM t LIMIT 1000';

describe('SELECT * FROM t', () => {
  const sdb = new Database(':memory:', { cacheStatements: true });
  const bdb = new BDatabase(':memory:');
  const ndb = new NDatabase(':memory:');

  sdb.exec(PREPARE);
  bdb.exec(PREPARE);
  ndb.exec(PREPARE);

  const sinsert = sdb.prepare(INSERT);
  const binsert = bdb.prepare(INSERT);
  const ninsert = ndb.prepare(INSERT);

  sdb.transaction(() => {
    for (const value of VALUES) {
      sinsert.run(value);
    }
  })();

  bdb.transaction(() => {
    for (const value of VALUES) {
      binsert.run(value);
    }
  })();

  ndb.exec('BEGIN');
  for (const value of VALUES) {
    ninsert.run(value);
  }
  ndb.exec('COMMIT');

  const sselect = sdb.prepare(SELECT);
  const bselect = bdb.prepare(SELECT);

  bench('@signalapp/sqlcipher', () => {
    sselect.all();
  });

  bench('@signalapp/better-sqlite', () => {
    bselect.all();
  });

  bench('node:sqlite', () => {
    // Node.js seems to finalize the statement after `.all()`
    const nselect = ndb.prepare(SELECT);
    nselect.all();
  });
});
