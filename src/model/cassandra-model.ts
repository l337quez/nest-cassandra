import { Client, types } from 'cassandra-driver';
import { Logger } from '@nestjs/common';
import {
  EntityMetadata,
  ColumnMetadata,
  HookMetadata,
  FindOptions,
  ExecuteOptions,
  BatchStatement,
  BatchOptions,
} from '../interfaces/entity-metadata.interface';
import {
  COLUMNS_METADATA,
  HOOKS_METADATA,
  ENTITY_METADATA,
} from '../cassandra.constants';
import { QueryBuilder } from './query-builder';

const logger = new Logger('CassandraModel');

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function now(): Date {
  return new Date();
}

function generateId(type: 'uuid' | 'timeuuid'): types.Uuid | types.TimeUuid {
  return type === 'timeuuid' ? types.TimeUuid.now() : types.Uuid.random();
}

function resolveDefault(def: unknown): unknown {
  return typeof def === 'function' ? (def as () => unknown)() : def;
}

/**
 * Maps a plain cassandra-driver Row to a typed entity instance.
 */
function mapRowToEntity<T extends object>(
  row: types.Row,
  EntityClass: new () => T,
  columns: ColumnMetadata[],
): T {
  const instance = new EntityClass() as Record<string, unknown>;
  for (const col of columns) {
    instance[col.propertyKey] = row[col.columnName];
  }
  return instance as unknown as T;
}

/**
 * Builds WHERE clause parts and params from a partial entity.
 */
function buildWhereClause<T extends object>(
  where: Partial<T>,
  columns: ColumnMetadata[],
): { parts: string[]; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(where)) {
    const col = columns.find((c) => c.propertyKey === key || c.columnName === key);
    if (!col) continue;
    parts.push(`${col.columnName} = ?`);
    params.push(value);
  }

  return { parts, params };
}

// ─── CassandraModel ───────────────────────────────────────────────────────────

/**
 * The primary CRUD interface for a Cassandra entity.
 * Returned by `@InjectModel(EntityClass)`.
 *
 * @example
 * ```ts
 * @Injectable()
 * export class UserService {
 *   constructor(
 *     @InjectModel(UserEntity) private readonly userModel: CassandraModel<UserEntity>,
 *   ) {}
 *
 *   findAll()              { return this.userModel.find(); }
 *   findByEmail(e: string) { return this.userModel.select().where('email', e).one(); }
 *   create(dto: CreateUserDto) { return this.userModel.save(dto); }
 * }
 * ```
 */
export class CassandraModel<T extends object> {
  private readonly meta: EntityMetadata;
  private readonly columns: ColumnMetadata[];
  private readonly hooks: HookMetadata[];
  private readonly tableFqn: string;

  constructor(
    private readonly client: Client,
    private readonly EntityClass: new () => T,
    private readonly defaultKeyspace?: string,
  ) {
    this.meta    = Reflect.getMetadata(ENTITY_METADATA, EntityClass);
    this.columns = Reflect.getMetadata(COLUMNS_METADATA, EntityClass) ?? [];
    this.hooks   = Reflect.getMetadata(HOOKS_METADATA, EntityClass) ?? [];

    if (!this.meta) {
      throw new Error(
        `[nest-cassandra] Class "${EntityClass.name}" is missing @Entity() decorator.`,
      );
    }

    const ks = this.meta.keyspace ?? defaultKeyspace;
    this.tableFqn = ks
      ? `"${ks}"."${this.meta.tableName}"`
      : `"${this.meta.tableName}"`;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  /**
   * Find all rows matching optional WHERE conditions.
   *
   * @example
   * ```ts
   * const allUsers  = await userModel.find();
   * const actives   = await userModel.find({ status: 'active' });
   * const paginated = await userModel.find({}, { limit: 20, fetchSize: 20 });
   * ```
   */
  async find(where?: Partial<T>, options?: FindOptions): Promise<T[]> {
    const { parts, params } = buildWhereClause(where ?? {}, this.columns);

    let query = `SELECT * FROM ${this.tableFqn}`;
    if (parts.length) query += ` WHERE ${parts.join(' AND ')}`;
    if (options?.limit) query += ` LIMIT ${options.limit}`;
    if (options?.allowFiltering) query += ' ALLOW FILTERING';
    query += ';';

    logger.verbose(query);

    const execOptions: Record<string, unknown> = { prepare: true };
    if (options?.fetchSize)   execOptions['fetchSize']   = options.fetchSize;
    if (options?.pageState)   execOptions['pageState']   = options.pageState;
    if (options?.consistency) execOptions['consistency'] = options.consistency;

    const result = await this.client.execute(query, params, execOptions as unknown as import('cassandra-driver').QueryOptions);
    return result.rows.map((row) => mapRowToEntity(row, this.EntityClass, this.columns));
  }

  /**
   * Find a single row. Returns `null` if not found.
   *
   * @example
   * ```ts
   * const user = await userModel.findOne({ email: 'alice@example.com' });
   * ```
   */
  async findOne(where: Partial<T>, options?: FindOptions): Promise<T | null> {
    const results = await this.find(where, { ...options, limit: 1 });
    return results[0] ?? null;
  }

  /**
   * Insert a new row. Runs `@BeforeSave` / `@AfterSave` hooks.
   * Auto-populates generated UUIDs, `@CreateDateColumn`, and `@UpdateDateColumn`.
   *
   * @example
   * ```ts
   * const user = await userModel.save({ name: 'Alice', email: 'alice@example.com' });
   * ```
   */
  async save(entity: Partial<T>): Promise<T> {
    const instance = Object.assign(new this.EntityClass(), entity) as Record<string, unknown>;

    // Auto-fill generated values
    for (const col of this.columns) {
      if (col.generated && instance[col.propertyKey] === undefined) {
        instance[col.propertyKey] = generateId(col.generated);
      }
      if ((col.isCreateDate || col.isUpdateDate) && instance[col.propertyKey] === undefined) {
        instance[col.propertyKey] = now();
      }
      if (col.default !== undefined && instance[col.propertyKey] === undefined) {
        instance[col.propertyKey] = resolveDefault(col.default);
      }
    }

    // Run @BeforeSave hooks
    await this._runHooks('beforeSave', instance);

    // Build INSERT
    const colNames: string[] = [];
    const placeholders: string[] = [];
    const params: unknown[] = [];

    for (const col of this.columns) {
      const val = instance[col.propertyKey];
      if (val !== undefined) {
        colNames.push(col.columnName);
        placeholders.push('?');
        params.push(val);
      }
    }

    const query = `INSERT INTO ${this.tableFqn} (${colNames.join(', ')}) VALUES (${placeholders.join(', ')});`;
    logger.verbose(query);
    await this.client.execute(query, params, { prepare: true });

    // Run @AfterSave hooks
    await this._runHooks('afterSave', instance);

    return instance as unknown as T;
  }

  /**
   * Update rows matching a WHERE condition. Runs `@BeforeUpdate` / `@AfterUpdate` hooks.
   * Auto-updates `@UpdateDateColumn` fields.
   *
   * @example
   * ```ts
   * await userModel.update({ id }, { name: 'Bob' });
   * ```
   */
  async update(where: Partial<T>, values: Partial<T>): Promise<void> {
    const mergedValues = { ...values } as Record<string, unknown>;

    // Auto-update UpdateDateColumn
    for (const col of this.columns) {
      if (col.isUpdateDate) {
        mergedValues[col.propertyKey] = now();
      }
    }

    // Run @BeforeUpdate
    await this._runHooks('beforeUpdate', where, mergedValues);

    const setParts: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(mergedValues)) {
      const col = this.columns.find((c) => c.propertyKey === key);
      if (!col) continue;
      setParts.push(`${col.columnName} = ?`);
      params.push(value);
    }

    if (!setParts.length) return;

    const { parts: whereParts, params: whereParams } = buildWhereClause(where, this.columns);
    if (!whereParts.length) {
      throw new Error('[nest-cassandra] update() requires at least one WHERE condition.');
    }

    params.push(...whereParams);
    const query = `UPDATE ${this.tableFqn} SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')};`;
    logger.verbose(query);
    await this.client.execute(query, params, { prepare: true });

    // Run @AfterUpdate
    await this._runHooks('afterUpdate', where, values);
  }

  /**
   * Delete rows matching a WHERE condition. Runs `@BeforeDelete` / `@AfterDelete` hooks.
   *
   * @example
   * ```ts
   * await userModel.delete({ id });
   * ```
   */
  async delete(where: Partial<T>): Promise<void> {
    const { parts, params } = buildWhereClause(where, this.columns);
    if (!parts.length) {
      throw new Error('[nest-cassandra] delete() requires at least one WHERE condition.');
    }

    await this._runHooks('beforeDelete', where);

    const query = `DELETE FROM ${this.tableFqn} WHERE ${parts.join(' AND ')};`;
    logger.verbose(query);
    await this.client.execute(query, params, { prepare: true });

    await this._runHooks('afterDelete', where);
  }

  // ─── Query Builder ────────────────────────────────────────────────────────

  /**
   * Start a fluent SELECT query.
   *
   * @example
   * ```ts
   * const results = await userModel
   *   .select('name', 'email')
   *   .where('status', 'active')
   *   .limit(50)
   *   .execute();
   * ```
   */
  select(...columns: (keyof T | string)[]): QueryBuilder<T> {
    const qb = new QueryBuilder<T>(
      this.client,
      this.EntityClass,
      this.meta,
      this.columns,
      this.defaultKeyspace,
    );
    if (columns.length) qb.select(...columns);
    return qb;
  }

  // ─── Batch Support ────────────────────────────────────────────────────────

  /**
   * Prepare an INSERT as a batch-ready statement (does NOT execute).
   */
  prepareSave(entity: Partial<T>): BatchStatement {
    const instance = Object.assign(new this.EntityClass(), entity) as Record<string, unknown>;

    for (const col of this.columns) {
      if (col.generated && instance[col.propertyKey] === undefined) {
        instance[col.propertyKey] = generateId(col.generated);
      }
      if ((col.isCreateDate || col.isUpdateDate) && instance[col.propertyKey] === undefined) {
        instance[col.propertyKey] = now();
      }
    }

    const colNames: string[] = [];
    const placeholders: string[] = [];
    const params: unknown[] = [];

    for (const col of this.columns) {
      const val = instance[col.propertyKey];
      if (val !== undefined) {
        colNames.push(col.columnName);
        placeholders.push('?');
        params.push(val);
      }
    }

    return {
      query: `INSERT INTO ${this.tableFqn} (${colNames.join(', ')}) VALUES (${placeholders.join(', ')});`,
      params,
    };
  }

  /**
   * Prepare an UPDATE as a batch-ready statement (does NOT execute).
   */
  prepareUpdate(where: Partial<T>, values: Partial<T>): BatchStatement {
    const setParts: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(values)) {
      const col = this.columns.find((c) => c.propertyKey === key);
      if (!col) continue;
      setParts.push(`${col.columnName} = ?`);
      params.push(value);
    }

    const { parts: whereParts, params: whereParams } = buildWhereClause(where, this.columns);
    params.push(...whereParams);

    return {
      query: `UPDATE ${this.tableFqn} SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')};`,
      params,
    };
  }

  /**
   * Prepare a DELETE as a batch-ready statement (does NOT execute).
   */
  prepareDelete(where: Partial<T>): BatchStatement {
    const { parts, params } = buildWhereClause(where, this.columns);
    return {
      query: `DELETE FROM ${this.tableFqn} WHERE ${parts.join(' AND ')};`,
      params,
    };
  }

  /**
   * Execute a BATCH of statements atomically.
   * Mix statements from multiple models using `prepareSave` / `prepareUpdate` / `prepareDelete`.
   *
   * @example
   * ```ts
   * await userModel.batch([
   *   userModel.prepareSave({ id, name }),
   *   profileModel.prepareSave({ userId: id, bio }),
   * ], { type: 'logged' });
   * ```
   */
  async batch(statements: BatchStatement[], options?: BatchOptions): Promise<void> {
    const batchType = (options?.type ?? 'logged').toUpperCase();
    const queries = statements.map((s) => ({ query: s.query, params: s.params }));

    logger.verbose(`BATCH (${batchType}) — ${statements.length} statements`);

    await this.client.batch(queries as Parameters<Client['batch']>[0], {
      prepare: true,
      ...(options?.consistency ? { consistency: options.consistency } : {}),
    });
  }

  // ─── Raw Access ───────────────────────────────────────────────────────────

  /**
   * Execute raw CQL directly against the Cassandra client.
   *
   * @example
   * ```ts
   * const result = await userModel.execute(
   *   'SELECT * FROM users WHERE token(id) > token(?)',
   *   [lastId],
   * );
   * ```
   */
  async execute(
    query: string,
    params?: unknown[],
    options?: ExecuteOptions,
  ): Promise<types.ResultSet> {
    const rawOptions: Record<string, unknown> = {
      prepare: options?.prepare !== false,
    };
    if (options?.consistency) rawOptions['consistency'] = options.consistency;
    if (options?.fetchSize)   rawOptions['fetchSize']   = options.fetchSize;
    if (options?.pageState)   rawOptions['pageState']   = options.pageState;

    return this.client.execute(query, params ?? [], rawOptions as unknown as import('cassandra-driver').QueryOptions);
  }

  // ─── Hook Runner ──────────────────────────────────────────────────────────

  private async _runHooks(event: HookMetadata['event'], ...args: unknown[]): Promise<void> {
    const relevant = this.hooks.filter((h) => h.event === event);
    for (const hook of relevant) {
      const proto = this.EntityClass.prototype as Record<string, (...a: unknown[]) => unknown>;
      const method = proto[hook.methodName];
      if (typeof method === 'function') {
        await method.apply(args[0], args.slice(1));
      }
    }
  }
}
