import { updateColumnMetadata } from './column.decorator';

/**
 * Marks a column as auto-generated UUID or TimeUUID.
 * The value is generated automatically on INSERT if not provided.
 *
 * @param type 'uuid' (default) or 'timeuuid'
 *
 * @example
 * ```ts
 * @GeneratedUuidColumn()
 * id: types.Uuid;
 *
 * @GeneratedUuidColumn('timeuuid')
 * event_time: types.TimeUuid;
 * ```
 */
export const GeneratedUuidColumn = (
  type: 'uuid' | 'timeuuid' = 'uuid',
): PropertyDecorator => {
  return (target, propertyKey) => {
    updateColumnMetadata(target, propertyKey as string, {
      type,
      generated: type,
    });
  };
};
