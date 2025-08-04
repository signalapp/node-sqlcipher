// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert';
import { runInThisContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import bindings from 'node-gyp-build';

/** @internal */
type NativeDatabase = Readonly<{ __native_db: never }>;

/** @internal */
type NativeStatement = Readonly<{ __native_stmt: never }>;

// esbuild is configured to replace:
// - `import.meta.url` => `undefined` for CJS
// - `__dirname` => `undefined` for ESM
const ROOT_DIR = import.meta.url
  ? fileURLToPath(new URL('..', import.meta.url))
  : join(__dirname, '..');

const addon = bindings<{
  statementNew(
    db: NativeDatabase,
    query: string,
    persistent: boolean,
    pluck: boolean,
    bigint: boolean,
  ): NativeStatement;
  statementRun<Options extends StatementOptions>(
    stmt: NativeStatement,
    params: StatementParameters<Options> | undefined,
    result: [number, number],
  ): void;
  statementStep<Options extends StatementOptions>(
    stmt: NativeStatement,
    params: StatementParameters<Options> | null | undefined,
    cache: Array<SqliteValue<Options>> | undefined,
    isGet: boolean,
  ): Array<SqliteValue<Options>>;
  statementScanStats(stmt: NativeStatement): Array<ScanStats>;
  statementClose(stmt: NativeStatement): void;

  databaseOpen(path: string): NativeDatabase;
  databaseInitTokenizer(db: NativeDatabase): void;
  databaseExec(db: NativeDatabase, query: string): void;
  databaseClose(db: NativeDatabase): void;

  signalTokenize(value: string): Array<string>;
}>(ROOT_DIR);

export type RunResult = {
  /** Total number of affected rows */
  changes: number;
  /** Rowid of the last inserted row */
  lastInsertRowid: number;
};

export type StatementOptions = Readonly<{
  /**
   * If `true` - the statement is assumed to be long-lived and some otherwise
   * costly optimizations are enabled.
   *
   * The default value is controlled by DatabaseOptions.
   *
   * @see {@link DatabaseOptions}
   */
  persistent?: boolean;

  /**
   * If `true` - `.get()` returns a single column and `.all()` returns a list
   * of column values.
   *
   * Note: the statement must not result in multi-column rows.
   */
  pluck?: true;

  /**
   * If `true` - all integers returned by query will be returned as big
   * integers instead of regular (floating-point) numbers.
   */
  bigint?: true;
}>;

/**
 * Parameters accepted by `.run()`/`.get()`/`.all()` methods of the statement.
 */
export type StatementParameters<Options extends StatementOptions> =
  | ReadonlyArray<SqliteValue<Options>>
  | Readonly<Record<string, SqliteValue<Options>>>;

/**
 * Possible SQL values given statement options.
 */
export type SqliteValue<Options extends StatementOptions> =
  | string
  | Uint8Array
  | number
  | null
  | (Options extends { bigint: true } ? bigint : never);

/**
 * Return value type of `.get()` and an element type of `.all()`
 */
export type RowType<Options extends StatementOptions> = Options extends {
  pluck: true;
}
  ? SqliteValue<Options>
  : Record<string, SqliteValue<Options>>;

/**
 * A compiled SQL statement class.
 */
class Statement<Options extends StatementOptions = object> {
  readonly #needsTranslation: boolean;

  #cache: Array<SqliteValue<Options>> | undefined;
  #createRow: undefined | ((result: unknown) => RowType<Options>);
  #native: NativeStatement | undefined;
  #onClose: (() => void) | undefined;

  /** @internal */
  constructor(
    db: NativeDatabase,
    query: string,
    { persistent, pluck, bigint }: Options,
    onClose?: () => void,
  ) {
    this.#needsTranslation = persistent === true && !pluck;

    this.#native = addon.statementNew(
      db,
      query,
      persistent === true,
      pluck === true,
      bigint === true,
    );

    this.#onClose = onClose;
  }

  /**
   * Run the statement's query without returning any rows.
   *
   * @param params - Parameters to be bound to query placeholders before
   *                 executing the statement.
   * @returns An object with `changes` and `lastInsertedRowid` integers.
   */
  public run(params?: StatementParameters<Options>): RunResult {
    if (this.#native === undefined) {
      throw new Error('Statement closed');
    }
    const result: [number, number] = [0, 0];
    this.#checkParams(params);
    addon.statementRun(this.#native, params, result);
    return { changes: result[0], lastInsertRowid: result[1] };
  }

  /**
   * Run the statement's query and return the first row of the result or
   * `undefined` if no rows matched.
   *
   * @param params - Parameters to be bound to query placeholders before
   *                 executing the statement.
   * @returns A row object or a single column if `pluck: true` is set in the
   *          statement options.
   */
  public get<Row extends RowType<Options> = RowType<Options>>(
    params?: StatementParameters<Options>,
  ): Row | undefined {
    if (this.#native === undefined) {
      throw new Error('Statement closed');
    }
    this.#checkParams(params);
    const result = addon.statementStep(this.#native, params, this.#cache, true);
    if (result === undefined) {
      return undefined;
    }
    if (!this.#needsTranslation) {
      return result as unknown as Row | undefined;
    }
    const createRow = this.#updateCache(result);
    return createRow(result) as Row;
  }

  /**
   * Run the statement's query and return the all rows of the result or
   * `undefined` if no rows matched.
   *
   * @param params - Parameters to be bound to query placeholders before
   *                 executing the statement.
   * @returns A list of row objects or single columns if `pluck: true` is set in
   *          the statement options.
   */
  public all<Row extends RowType<Options> = RowType<Options>>(
    params?: StatementParameters<Options>,
  ): Array<Row> {
    if (this.#native === undefined) {
      throw new Error('Statement closed');
    }
    const result = [];
    this.#checkParams(params);
    let singleUseParams: StatementParameters<Options> | undefined | null =
      params;
    while (true) {
      const single = addon.statementStep(
        this.#native,
        singleUseParams,
        this.#cache,
        false,
      );
      singleUseParams = null;
      if (single === undefined) {
        break;
      }

      if (!this.#needsTranslation) {
        result.push(single);
        continue;
      }

      const createRow = this.#updateCache(single);
      result.push(createRow(single));
    }
    return result as unknown as Array<Row>;
  }

  /**
   * Report collected performance statics for the statement.
   *
   * @returns A list of objects describing the performance of the query.
   *
   * @see {@link https://www.sqlite.org/profile.html}
   */
  public scanStats(): Array<ScanStats> {
    if (this.#native === undefined) {
      throw new Error('Statement closed');
    }
    return addon.statementScanStats(this.#native);
  }

  /**
   * Close the statement and release the used memory.
   */
  public close(): void {
    if (this.#native === undefined) {
      throw new Error('Statement already closed');
    }
    addon.statementClose(this.#native);
    this.#native = undefined;
    this.#onClose?.();
  }

  /** @internal */
  #updateCache(
    result: Array<SqliteValue<Options>>,
  ): (result: unknown) => RowType<Options> {
    if (this.#cache === result) {
      assert(this.#createRow !== undefined);
      return this.#createRow;
    }

    // eslint-disable-next-line no-bitwise
    const half = result.length >>> 1;
    const lines = [];
    for (let i = 0; i < half; i += 1) {
      lines.push(`${JSON.stringify(result[i])}: value[${half} + ${i}],`);
    }

    this.#cache = result;
    const createRow = runInThisContext(`(function createRow(value) {
      return {
        ${lines.join('\n')}
      };
    })`);
    this.#createRow = createRow;

    return createRow;
  }

  /** @internal */
  #checkParams(params: StatementParameters<Options> | undefined): void {
    if (params === undefined) {
      return;
    }
    if (typeof params !== 'object') {
      throw new TypeError('Params must be either object or array');
    }
    if (params === null) {
      throw new TypeError('Params cannot be null');
    }
  }
}

export { type Statement };

/**
 * Options for `db.pragma()` method.
 *
 * If `simple` is `true` - pragma returns the first column of the first row of
 * the result.
 */
export type PragmaOptions = Readonly<{
  simple?: true;
}>;

/**
 * Result of `db.pragma()` method.
 *
 * Either a list of rows a single column from the first row depending on the
 * options.
 */
export type PragmaResult<Options extends PragmaOptions> = Options extends {
  simple: true;
}
  ? RowType<{ pluck: true }> | undefined
  : Array<RowType<object>>;

/**
 * An entry of result array of `stmt.scanStats()` method.
 *
 * Value of `-1` indicates that the field is not available for a given entry.
 */
export type ScanStats = Readonly<{
  id: number;
  parent: number;
  cycles: number;
  loops: number;
  rows: number;
  explain: string | null;
}>;

/** @internal */
type TransactionStatement = Statement<{ persistent: true; pluck: true }>;

export type DatabaseOptions = Readonly<{
  /**
   * If `true` - all statements are persistent by default (unless
   * `persistent` is set to `false` in `StatementOptions`, and persistent
   * statements are automatically cached and reused until closed.
   *
   * @see {@link StatementOptions}
   */
  cacheStatements?: boolean;
}>;

/**
 * A sqlite database class.
 */
export default class Database {
  #native: NativeDatabase | undefined;
  #transactionDepth = 0;
  #isCacheEnabled: boolean;
  #statementCache = new Map<string, Statement>();

  #transactionStmts:
    | Readonly<{
        begin: TransactionStatement;
        rollback: TransactionStatement;
        commit: TransactionStatement;

        savepoint: TransactionStatement;
        rollbackTo: TransactionStatement;
        release: TransactionStatement;
      }>
    | undefined;

  /**
   * Constructor
   *
   * @param path - The path to the database file or ':memory:'/'' for opening
   *               the in-memory database.
   */
  constructor(path = ':memory:', { cacheStatements }: DatabaseOptions = {}) {
    if (typeof path !== 'string') {
      throw new TypeError('Invalid database path');
    }
    this.#native = addon.databaseOpen(path);
    this.#isCacheEnabled = cacheStatements === true;
  }

  public initTokenizer(): void {
    if (this.#native === undefined) {
      throw new Error('Database closed');
    }
    addon.databaseInitTokenizer(this.#native);
  }

  /**
   * Execute one or multiple SQL statements in a given `sql` string.
   *
   * @param sql - one or multiple SQL statements
   */
  public exec(sql: string): void {
    if (this.#native === undefined) {
      throw new Error('Database closed');
    }
    if (typeof sql !== 'string') {
      throw new TypeError('Invalid sql argument');
    }
    addon.databaseExec(this.#native, sql);
  }

  /**
   * Compile a single SQL statement.
   *
   * @param query - a single SQL statement.
   * @param options - statement options.
   * @returns Statement instance.
   *
   * @see {@link StatementOptions}
   */
  public prepare<Options extends StatementOptions = StatementOptions>(
    query: string,
    options: Options,
  ): Statement<Options>;

  /**
   * Compile a single SQL statement.
   *
   * @param query - a single SQL statement.
   * @returns Statement instance.
   */
  public prepare(query: string): Statement<object>;

  public prepare<Options extends StatementOptions = StatementOptions>(
    query: string,
    options: Options = {} as Options,
  ): Statement<Options> {
    if (this.#native === undefined) {
      throw new Error('Database closed');
    }
    if (typeof query !== 'string') {
      throw new TypeError('Invalid query argument');
    }

    if (!this.#isCacheEnabled || options.persistent === false) {
      return new Statement(this.#native, query, options);
    }

    // Persistent statements are cached until closed.
    const cacheKey = `${options.pluck}:${options.bigint}:${query}`;
    const cached = this.#statementCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const stmt = new Statement(
      this.#native,
      query,
      {
        persistent: true,
        pluck: options.pluck,
        bigint: options.bigint,
      } as Options,
      () => this.#statementCache.delete(cacheKey),
    );
    this.#statementCache.set(cacheKey, stmt);
    return stmt;
  }

  /**
   * Close the database and all associated statements.
   */
  public close(): void {
    if (this.#native === undefined) {
      throw new Error('Database already closed');
    }

    addon.databaseClose(this.#native);
    this.#native = undefined;
  }

  /**
   * Run a pragma statement and return the result.
   *
   * @param source - pragma query source
   * @param options - options to control the return value of `.pragma()`
   * @returns Either multiple rows returned by the statement, or the first
   *          column of the first row (or `undefined`) if `options` has
   *          `simple: true`.
   *
   * @see {@link PragmaOptions}
   */
  public pragma<Options extends PragmaOptions>(
    source: string,
    { simple }: Options,
  ): PragmaResult<Options>;

  /**
   * Run a pragma statement and return the result.
   *
   * @param source - pragma query source
   * @returns Either multiple rows returned by the statement.
   */
  public pragma(source: string): PragmaResult<object>;

  public pragma<Options extends PragmaOptions = object>(
    source: string,
    { simple }: Options = {} as Options,
  ): PragmaResult<Options> {
    if (typeof source !== 'string') {
      throw new TypeError('Invalid pragma argument');
    }
    if (simple === true) {
      const stmt = this.prepare(`PRAGMA ${source}`, { pluck: true });
      return stmt.get() as unknown as PragmaResult<Options>;
    }
    const stmt = this.prepare(`PRAGMA ${source}`);
    return stmt.all() as unknown as PragmaResult<Options>;
  }

  /**
   * Wrap `fn()` in a transaction.
   *
   * @param fn - a function to be executed within a transaction.
   * @returns The value returned by `fn()`.
   */
  public transaction<Params extends [], Result>(
    fn: (...params: Params) => Result,
  ): typeof fn {
    return (...params: Params) => {
      if (this.#transactionStmts === undefined) {
        const options = { persistent: true as const, pluck: true as const };
        this.#transactionStmts = {
          begin: this.prepare('BEGIN', options),
          rollback: this.prepare('ROLLBACK', options),
          commit: this.prepare('COMMIT', options),

          savepoint: this.prepare('SAVEPOINT signalappsqlcipher', options),
          rollbackTo: this.prepare('ROLLBACK TO signalappsqlcipher', options),
          release: this.prepare('RELEASE signalappsqlcipher', options),
        };
      }

      this.#transactionDepth += 1;

      let begin: TransactionStatement;
      let rollback: TransactionStatement;
      let commit: TransactionStatement;
      if (this.#transactionDepth === 1) {
        ({ begin, rollback, commit } = this.#transactionStmts);
      } else {
        ({
          savepoint: begin,
          rollbackTo: rollback,
          release: commit,
        } = this.#transactionStmts);
      }

      begin.run();
      try {
        const result = fn(...params);
        commit.run();
        return result;
      } catch (error) {
        rollback.run();
        throw error;
      } finally {
        this.#transactionDepth -= 1;
      }
    };
  }

  /**
   * Tokenize a given sentence with a Signal-FTS5-Extension.
   *
   * @param value - a sentence
   * @returns a list of word-like tokens.
   *
   * @see {@link https://github.com/signalapp/Signal-FTS5-Extension}
   */
  public signalTokenize(value: string): Array<string> {
    if (typeof value !== 'string') {
      throw new TypeError('Invalid value');
    }

    return addon.signalTokenize(value);
  }
}

export { Database };
