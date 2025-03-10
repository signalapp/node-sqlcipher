import { bench, describe } from 'vitest';

import BDatabase from '@signalapp/better-sqlite3';
import Database from '../lib/index.js';

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

  sdb.exec(PREPARE);
  bdb.exec(PREPARE);

  const sinsert = sdb.prepare(INSERT);
  const binsert = bdb.prepare(INSERT);

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

  const sselect = sdb.prepare(SELECT);
  const bselect = bdb.prepare(SELECT);

  bench('@signalapp/sqlcipher', () => {
    sselect.all();
  });

  bench('@signalapp/better-sqlite', () => {
    bselect.all();
  });
});
