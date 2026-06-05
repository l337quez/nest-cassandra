// ─── CQL Type System ──────────────────────────────────────────────────────────

export type CassandraScalarType =
  | 'ascii' | 'bigint' | 'blob' | 'boolean' | 'counter'
  | 'date' | 'decimal' | 'double' | 'duration' | 'float'
  | 'inet' | 'int' | 'smallint' | 'text' | 'time'
  | 'timestamp' | 'timeuuid' | 'tinyint' | 'uuid' | 'varchar' | 'varint';

export type CassandraType =
  | CassandraScalarType
  | `list<${string}>`
  | `set<${string}>`
  | `map<${string},${string}>`
  | `frozen<${string}>`;

// ─── Primary Key ─────────────────────────────────────────────────────────────

/**
 * Cassandra primary key definition.
 *
 * Simple partition key:            key: ['id']
 * Compound partition key:          key: [['tenant_id', 'bucket'], 'created_at']
 * Partition + clustering keys:     key: ['user_id', 'post_id']
 */
export type PartitionKey   = string | string[];
export type PrimaryKeyDef  = [PartitionKey, ...string[]];

// ─── Column Metadata ──────────────────────────────────────────────────────────

export interface ColumnMetadata {
  /** TypeScript property name on the class */
  propertyKey: string;
  /** CQL column name (defaults to snake_case of propertyKey) */
  columnName: string;
  /** CQL type. Auto-inferred from TypeScript type when omitted */
  type: CassandraType;
  /** Auto-generate uuid or timeuuid value on INSERT */
  generated?: 'uuid' | 'timeuuid';
  /** Automatically set to current timestamp on INSERT */
  isCreateDate?: boolean;
  /** Automatically set to current timestamp on INSERT and UPDATE */
  isUpdateDate?: boolean;
  /** Cassandra lightweight transaction version column */
  isVersion?: boolean;
  /** Create a secondary index on this column */
  isIndex?: boolean;
  /** Column is a STATIC column (shared across all rows in a partition) */
  isStatic?: boolean;
  /** Wrap collection in FROZEN<> */
  frozen?: boolean;
  /** Default value or factory function */
  default?: unknown | (() => unknown);
  /** Clustering column order */
  clusteringOrder?: 'ASC' | 'DESC';
}

// ─── Entity Metadata ──────────────────────────────────────────────────────────

export interface EntityMetadata {
  /** CQL table name */
  tableName: string;
  /** Override keyspace for this entity */
  keyspace?: string;
  /**
   * Primary key definition.
   * @example key: ['id']
   * @example key: [['tenant_id', 'bucket'], 'created_at']
   */
  key: PrimaryKeyDef;
  /** Clustering column ORDER BY */
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  /** Table-level WITH options, e.g. { gc_grace_seconds: 864000 } */
  withOptions?: Record<string, unknown>;
}

// ─── Hook System ──────────────────────────────────────────────────────────────

export type HookEvent =
  | 'beforeSave'   | 'afterSave'
  | 'beforeUpdate' | 'afterUpdate'
  | 'beforeDelete' | 'afterDelete';

export interface HookMetadata {
  event: HookEvent;
  methodName: string;
}

// ─── Materialized View ────────────────────────────────────────────────────────

export interface MaterializedViewMetadata {
  /** CQL view name */
  viewName: string;
  /** The entity class this view is based on */
  baseEntity: Function;
  /** Primary key for the view */
  key: PrimaryKeyDef;
  /**
   * WHERE clause (required by Cassandra for MVs).
   * Must include IS NOT NULL checks for all PK columns.
   * @example 'email IS NOT NULL AND id IS NOT NULL'
   */
  where: string;
  /** Clustering column ORDER BY */
  orderBy?: Record<string, 'ASC' | 'DESC'>;
}

// ─── Batch Support ────────────────────────────────────────────────────────────

export interface BatchStatement {
  query: string;
  params: unknown[];
}

export type BatchType = 'logged' | 'unlogged' | 'counter';

export interface BatchOptions {
  type?: BatchType;
  /** Consistency level */
  consistency?: number;
}

// ─── Query Options ────────────────────────────────────────────────────────────

export interface FindOptions {
  limit?: number;
  allowFiltering?: boolean;
  consistency?: number;
  pageState?: string;
  fetchSize?: number;
}

export interface ExecuteOptions {
  prepare?: boolean;
  consistency?: number;
  pageState?: string;
  fetchSize?: number;
}
