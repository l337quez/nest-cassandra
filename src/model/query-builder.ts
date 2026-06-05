import { Client, types } from 'cassandra-driver';
import { ColumnMetadata, EntityMetadata, FindOptions, BatchStatement } from '../interfaces/entity-metadata.interface';

type WhereOperator = '=' | '>' | '<' | '>=' | '<=' | 'IN' | 'CONTAINS' | 'CONTAINS KEY';

interface WhereClause {
  column: string;
  operator: WhereOperator;
  value: unknown;
}

/**
 * Fluent, type-safe query builder for Cassandra SELECT statements.
 *
 * @example
 * ```ts
 * const users = await userModel
 *   .select('name', 'email')
 *   .where('status', 'active')
 *   .where('created_at', someDate, '>=')
 *   .limit(100)
 *   .allowFiltering()
 *   .execute();
 * ```
 */
export class QueryBuilder<T extends object> {
  private _columns: string[] = ['*'];
  private _whereClauses: WhereClause[] = [];
  private _limit?: number;
  private _allowFiltering = false;
  private _orderBy?: { column: string; direction: 'ASC' | 'DESC' };
  private _pageState?: string;
  private _fetchSize?: number;

  constructor(
    private readonly client: Client,
    private readonly EntityClass: new () => T,
    private readonly meta: EntityMetadata,
    private readonly columnsMeta: ColumnMetadata[],
    private readonly defaultKeyspace?: string,
  ) {}

  // ─── Builder Methods ───────────────────────────────────────────────────────

  /** Select specific columns (defaults to all) */
  select(...columns: (keyof T | string)[]): this {
    this._columns = columns as string[];
    return this;
  }

  /**
   * Add a WHERE condition.
   * @param column Property name (camelCase) or CQL column name (snake_case)
   * @param value  Value to match
   * @param operator Comparison operator (default: '=')
   */
  where(
    column: keyof T | string,
    value: unknown,
    operator: WhereOperator = '=',
  ): this {
    const colMeta = this.columnsMeta.find(
      (c) => c.propertyKey === column || c.columnName === column,
    );
    this._whereClauses.push({
      column: colMeta?.columnName ?? (column as string),
      operator,
      value,
    });
    return this;
  }

  /** Limit number of returned rows */
  limit(n: number): this {
    this._limit = n;
    return this;
  }

  /** Add ALLOW FILTERING (use with caution on large datasets) */
  allowFiltering(): this {
    this._allowFiltering = true;
    return this;
  }

  /**
   * ORDER BY (only valid for clustering columns defined on the table).
   * Note: Cassandra only supports ORDER BY on clustering keys.
   */
  orderBy(column: keyof T | string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    const colMeta = this.columnsMeta.find(
      (c) => c.propertyKey === column || c.columnName === column,
    );
    this._orderBy = {
      column: colMeta?.columnName ?? (column as string),
      direction,
    };
    return this;
  }

  /** Enable pagination: set the page state from a previous result */
  pageState(state: string): this {
    this._pageState = state;
    return this;
  }

  /** Number of rows per page */
  fetchSize(size: number): this {
    this._fetchSize = size;
    return this;
  }

  // ─── CQL Generation ────────────────────────────────────────────────────────

  build(): { query: string; params: unknown[] } {
    const ks    = this.meta.keyspace ?? this.defaultKeyspace;
    const table = ks
      ? `"${ks}"."${this.meta.tableName}"`
      : `"${this.meta.tableName}"`;

    const colList = this._columns.join(', ');
    const params: unknown[] = [];
    const parts: string[] = [];

    for (const clause of this._whereClauses) {
      if (clause.operator === 'IN' && Array.isArray(clause.value)) {
        const placeholders = clause.value.map(() => '?').join(', ');
        parts.push(`${clause.column} IN (${placeholders})`);
        params.push(...(clause.value as unknown[]));
      } else {
        parts.push(`${clause.column} ${clause.operator} ?`);
        params.push(clause.value);
      }
    }

    let query = `SELECT ${colList} FROM ${table}`;
    if (parts.length)          query += ` WHERE ${parts.join(' AND ')}`;
    if (this._orderBy)         query += ` ORDER BY ${this._orderBy.column} ${this._orderBy.direction}`;
    if (this._limit !== undefined) query += ` LIMIT ${this._limit}`;
    if (this._allowFiltering)  query += ' ALLOW FILTERING';
    query += ';';

    return { query, params };
  }

  // ─── Execution ─────────────────────────────────────────────────────────────

  /** Execute and return typed entity instances */
  async execute(options?: FindOptions): Promise<T[]> {
    const { query, params } = this.build();
    const execOptions: Record<string, unknown> = { prepare: true };
    if (this._fetchSize)  execOptions['fetchSize']  = this._fetchSize;
    if (this._pageState)  execOptions['pageState']  = this._pageState;
    if (options?.consistency) execOptions['consistency'] = options.consistency;

    const result = await this.client.execute(query, params, execOptions as unknown as import('cassandra-driver').QueryOptions);
    return result.rows.map((row) => this._mapRow(row));
  }

  /** Execute and return the first result, or null */
  async one(options?: FindOptions): Promise<T | null> {
    this.limit(1);
    const results = await this.execute(options);
    return results[0] ?? null;
  }

  /** Execute and return the raw cassandra-driver ResultSet */
  async raw(): Promise<types.ResultSet> {
    const { query, params } = this.build();
    return this.client.execute(query, params, { prepare: true });
  }

  /** Build this query as a batch-ready statement */
  asBatchStatement(): BatchStatement {
    const { query, params } = this.build();
    return { query, params };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private _mapRow(row: types.Row): T {
    const instance = new this.EntityClass();
    for (const col of this.columnsMeta) {
      (instance as Record<string, unknown>)[col.propertyKey] = row[col.columnName];
    }
    return instance;
  }
}
