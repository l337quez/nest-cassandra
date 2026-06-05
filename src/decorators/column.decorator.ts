import { COLUMNS_METADATA } from '../cassandra.constants';
import { ColumnMetadata, CassandraType } from '../interfaces/entity-metadata.interface';

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** Convert camelCase or PascalCase to snake_case */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/** Infer a CQL type from a TypeScript reflected type constructor */
export function inferCqlType(reflectedType: unknown): CassandraType {
  if (reflectedType === String)  return 'text';
  if (reflectedType === Number)  return 'int';
  if (reflectedType === Boolean) return 'boolean';
  if (reflectedType === Date)    return 'timestamp';
  if (reflectedType === Buffer)  return 'blob';
  // BigInt, Map, Set, Array fall through — user should specify type explicitly
  return 'text'; // safe default
}

/**
 * Read existing column list from metadata, merge/add entry, then re-define.
 * Multiple decorators on the same property merge correctly.
 */
export function updateColumnMetadata(
  target: object,
  propertyKey: string,
  partial: Partial<ColumnMetadata>,
): void {
  const ctor = (target as { constructor: Function }).constructor;
  const existing: ColumnMetadata[] =
    Reflect.getMetadata(COLUMNS_METADATA, ctor) ?? [];

  const idx = existing.findIndex((c) => c.propertyKey === propertyKey);

  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...partial };
  } else {
    const reflectedType = Reflect.getMetadata('design:type', target, propertyKey);
    const defaultMeta: ColumnMetadata = {
      propertyKey,
      columnName: toSnakeCase(propertyKey),
      type: inferCqlType(reflectedType),
    };
    existing.push({ ...defaultMeta, ...partial });
  }

  Reflect.defineMetadata(COLUMNS_METADATA, existing, ctor);
}

// ─── Column Options ───────────────────────────────────────────────────────────

export interface ColumnOptions {
  /** Explicit CQL type. Auto-inferred from TypeScript type when omitted. */
  type?: CassandraType;
  /** Override the CQL column name (defaults to snake_case of property name) */
  columnName?: string;
  /** Wrap collection in FROZEN<> */
  frozen?: boolean;
  /** Mark as a STATIC column (shared across all rows in a partition) */
  static?: boolean;
  /** Default value or factory function */
  default?: unknown | (() => unknown);
}

/**
 * Marks a class property as a Cassandra column.
 * The CQL type is auto-inferred from the TypeScript type when not specified.
 *
 * @example
 * ```ts
 * @Column({ type: 'text' })
 * name: string;
 *
 * @Column()          // auto-inferred: string → text
 * email: string;
 *
 * @Column({ type: 'list<text>', frozen: true })
 * tags: string[];
 * ```
 */
export const Column = (options: ColumnOptions = {}): PropertyDecorator => {
  return (target, propertyKey) => {
    const reflectedType = Reflect.getMetadata('design:type', target, propertyKey);
    updateColumnMetadata(target, propertyKey as string, {
      columnName: options.columnName ?? toSnakeCase(propertyKey as string),
      type: options.type ?? inferCqlType(reflectedType),
      frozen: options.frozen,
      isStatic: options.static,
      default: options.default,
    });
  };
};
