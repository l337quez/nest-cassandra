import { updateColumnMetadata } from './column.decorator';

/**
 * Creates a secondary index on this column.
 *
 * ⚠️  Secondary indexes in Cassandra have performance implications at scale.
 *     Prefer modeling your data so queries only touch partition keys.
 *     Use with ALLOW FILTERING for non-PK queries on unindexed columns.
 *
 * @example
 * ```ts
 * @IndexColumn()
 * @Column({ type: 'text' })
 * email: string;
 * ```
 */
export const IndexColumn = (): PropertyDecorator => {
  return (target, propertyKey) => {
    updateColumnMetadata(target, propertyKey as string, {
      isIndex: true,
    });
  };
};
