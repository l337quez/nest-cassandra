import { Client } from 'cassandra-driver';
import { Logger } from '@nestjs/common';
import {
  EntityMetadata,
  ColumnMetadata,
  MaterializedViewMetadata,
} from '../interfaces/entity-metadata.interface';
import {
  ENTITY_METADATA,
  COLUMNS_METADATA,
  MATERIALIZED_VIEW_METADATA,
} from '../cassandra.constants';

const logger = new Logger('SchemaBuilder');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEntityMeta(EntityClass: Function): EntityMetadata {
  const meta: EntityMetadata | undefined = Reflect.getMetadata(
    ENTITY_METADATA,
    EntityClass,
  );
  if (!meta) {
    throw new Error(
      `[nest-cassandra] Class "${EntityClass.name}" is missing @Entity() decorator.`,
    );
  }
  return meta;
}

function getColumnMeta(EntityClass: Function): ColumnMetadata[] {
  return Reflect.getMetadata(COLUMNS_METADATA, EntityClass) ?? [];
}

function buildPrimaryKeyClause(
  key: EntityMetadata['key'],
): string {
  const [partitionKey, ...clusteringKeys] = key;

  const partStr = Array.isArray(partitionKey)
    ? `(${partitionKey.join(', ')})`
    : partitionKey;

  return clusteringKeys.length
    ? `PRIMARY KEY (${partStr}, ${clusteringKeys.join(', ')})`
    : `PRIMARY KEY (${partStr})`;
}

function buildWithClause(
  orderBy: EntityMetadata['orderBy'],
  withOptions: EntityMetadata['withOptions'],
): string {
  const parts: string[] = [];

  if (orderBy && Object.keys(orderBy).length) {
    const orderStr = Object.entries(orderBy)
      .map(([col, dir]) => `${col} ${dir}`)
      .join(', ');
    parts.push(`CLUSTERING ORDER BY (${orderStr})`);
  }

  if (withOptions) {
    for (const [k, v] of Object.entries(withOptions)) {
      parts.push(`${k} = ${JSON.stringify(v)}`);
    }
  }

  return parts.length ? ` WITH ${parts.join(' AND ')}` : '';
}

// ─── SchemaBuilder ────────────────────────────────────────────────────────────

export class SchemaBuilder {
  /**
   * Generates CREATE TABLE and CREATE INDEX CQL statements for an entity.
   */
  static buildCreateTable(
    EntityClass: Function,
    defaultKeyspace?: string,
  ): string[] {
    const meta    = getEntityMeta(EntityClass);
    const columns = getColumnMeta(EntityClass);
    const ks      = meta.keyspace ?? defaultKeyspace;
    const table   = ks ? `"${ks}"."${meta.tableName}"` : `"${meta.tableName}"`;

    // Column definitions
    const colDefs = columns.map((col) => {
      const staticSuffix = col.isStatic ? ' STATIC' : '';
      const typePart     = col.frozen ? `frozen<${col.type}>` : col.type;
      return `  ${col.columnName} ${typePart}${staticSuffix}`;
    });

    const primaryKey = buildPrimaryKeyClause(meta.key);
    const withClause = buildWithClause(meta.orderBy, meta.withOptions);

    const createTable =
      `CREATE TABLE IF NOT EXISTS ${table} (\n` +
      `${colDefs.join(',\n')},\n` +
      `  ${primaryKey}\n` +
      `)${withClause};`;

    const statements: string[] = [createTable];

    // Secondary indexes
    const indexedCols = columns.filter((c) => c.isIndex);
    for (const col of indexedCols) {
      statements.push(
        `CREATE INDEX IF NOT EXISTS ON ${table}(${col.columnName});`,
      );
    }

    return statements;
  }

  /**
   * Generates ALTER TABLE ADD statements for new columns not yet in Cassandra.
   * Only used when syncSchema = 'alter'.
   */
  static buildAlterTable(
    EntityClass: Function,
    existingColumnNames: string[],
    defaultKeyspace?: string,
  ): string[] {
    const meta    = getEntityMeta(EntityClass);
    const columns = getColumnMeta(EntityClass);
    const ks      = meta.keyspace ?? defaultKeyspace;
    const table   = ks ? `"${ks}"."${meta.tableName}"` : `"${meta.tableName}"`;

    const statements: string[] = [];
    for (const col of columns) {
      if (!existingColumnNames.includes(col.columnName)) {
        const typePart = col.frozen ? `frozen<${col.type}>` : col.type;
        statements.push(
          `ALTER TABLE ${table} ADD ${col.columnName} ${typePart};`,
        );
      }
    }

    return statements;
  }

  /**
   * Generates a CREATE MATERIALIZED VIEW statement.
   */
  static buildMaterializedView(
    ViewClass: Function,
    defaultKeyspace?: string,
  ): string {
    const viewMeta: MaterializedViewMetadata | undefined = Reflect.getMetadata(
      MATERIALIZED_VIEW_METADATA,
      ViewClass,
    );

    if (!viewMeta) {
      throw new Error(
        `[nest-cassandra] Class "${ViewClass.name}" is missing @MaterializedView() decorator.`,
      );
    }

    const baseMeta = getEntityMeta(viewMeta.baseEntity);
    const ks       = defaultKeyspace;
    const baseTable = ks
      ? `"${ks}"."${baseMeta.tableName}"`
      : `"${baseMeta.tableName}"`;
    const viewTable = ks
      ? `"${ks}"."${viewMeta.viewName}"`
      : `"${viewMeta.viewName}"`;

    const primaryKey = buildPrimaryKeyClause(viewMeta.key);
    const withClause = buildWithClause(viewMeta.orderBy, undefined);

    return (
      `CREATE MATERIALIZED VIEW IF NOT EXISTS ${viewTable}\n` +
      `AS SELECT * FROM ${baseTable}\n` +
      `WHERE ${viewMeta.where}\n` +
      `${primaryKey}${withClause};`
    );
  }

  /**
   * Executes all CQL statements for an entity against a live Cassandra client.
   * Respects the syncSchema mode.
   */
  static async syncEntity(
    client: Client,
    EntityClass: Function,
    mode: 'create' | 'alter',
    defaultKeyspace?: string,
  ): Promise<void> {
    const statements = SchemaBuilder.buildCreateTable(EntityClass, defaultKeyspace);

    if (mode === 'alter') {
      const meta    = getEntityMeta(EntityClass);
      const ks      = meta.keyspace ?? defaultKeyspace;
      const tableName = meta.tableName;
      const existingCols = await SchemaBuilder.fetchExistingColumns(
        client,
        tableName,
        ks,
      );
      const alterStatements = SchemaBuilder.buildAlterTable(
        EntityClass,
        existingCols,
        defaultKeyspace,
      );
      statements.push(...alterStatements);
    }

    for (const cql of statements) {
      logger.debug(`Executing: ${cql}`);
      await client.execute(cql);
    }
  }

  /**
   * Executes CQL to create a materialized view.
   */
  static async syncMaterializedView(
    client: Client,
    ViewClass: Function,
    defaultKeyspace?: string,
  ): Promise<void> {
    const cql = SchemaBuilder.buildMaterializedView(ViewClass, defaultKeyspace);
    logger.debug(`Executing: ${cql}`);
    await client.execute(cql);
  }

  /**
   * Fetches existing column names for a table from Cassandra system tables.
   */
  static async fetchExistingColumns(
    client: Client,
    tableName: string,
    keyspace?: string,
  ): Promise<string[]> {
    const ks = keyspace ?? (client as unknown as { options: { keyspace: string } }).options?.keyspace;
    if (!ks) return [];

    const result = await client.execute(
      `SELECT column_name FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?`,
      [ks, tableName],
      { prepare: true },
    );

    return result.rows.map((row) => row.column_name as string);
  }
}
