import { updateColumnMetadata } from './column.decorator';

/**
 * Automatically sets this column to the current timestamp on INSERT.
 *
 * @example
 * ```ts
 * @CreateDateColumn()
 * created_at: Date;
 * ```
 */
export const CreateDateColumn = (): PropertyDecorator => {
  return (target, propertyKey) => {
    updateColumnMetadata(target, propertyKey as string, {
      type: 'timestamp',
      isCreateDate: true,
    });
  };
};

/**
 * Automatically sets this column to the current timestamp on INSERT and UPDATE.
 *
 * @example
 * ```ts
 * @UpdateDateColumn()
 * updated_at: Date;
 * ```
 */
export const UpdateDateColumn = (): PropertyDecorator => {
  return (target, propertyKey) => {
    updateColumnMetadata(target, propertyKey as string, {
      type: 'timestamp',
      isUpdateDate: true,
    });
  };
};

/**
 * Marks a column as a Cassandra lightweight-transaction version column.
 * Maps to `timeuuid` in CQL.
 *
 * @example
 * ```ts
 * @VersionColumn()
 * __version: types.TimeUuid;
 * ```
 */
export const VersionColumn = (): PropertyDecorator => {
  return (target, propertyKey) => {
    updateColumnMetadata(target, propertyKey as string, {
      type: 'timeuuid',
      isVersion: true,
      generated: 'timeuuid',
    });
  };
};
