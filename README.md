# @signalapp/sqlcipher

[![npm](https://img.shields.io/npm/v/@signalapp/sqlcipher)](https://www.npmjs.com/package/@signalapp/sqlcipher)

A fast [N-API](https://github.com/nodejs/node-addon-api)-based Node.js addon
wrapping [sqlcipher](https://github.com/sqlcipher/sqlcipher) and Signal-specific
[FTS5 segmenting APIs](https://github.com/signalapp/Signal-FTS5-Extension).

## Usage

```js
import Database from '@signalapp/sqlcipher';

const db = new Database('/path/to/db');

db.exec(`
  CREATE TABLE t (
    a INTEGER,
    b TEXT,
    c BLOB
  );
`);

const insert = db.prepare('INSERT INTO t (a, b, c) VALUES ($a, $b, $c)');
insert.run({ a: 1, b: 'hello', c: Buffer.from('world') });
insert.run({ a: 2, b: 'world', c: Buffer.from('hello') });

console.log(db.prepare('SELECT * FROM t').all());
```

## Updating sqlcipher

On macOS:

```sh
cd deps/sqlcipher
export OPENSSL_PREFIX=`brew --prefix openssl`
export CFLAGS="-I $OPENSSL_PREFIX/include"
export LIBRARY_PATH="$LIBRARY_PATH:$OPENSSL_PREFIX/lib"
./update.sh v4.7.0
cd -
```

## License

Copyright 2025 Signal Messenger, LLC.

Licensed under the AGPLv3: http://www.gnu.org/licenses/agpl-3.0.html
