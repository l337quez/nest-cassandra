import { ENTITY_METADATA } from '../cassandra.constants';
import { EntityMetadata, PrimaryKeyDef } from '../interfaces/entity-metadata.interface';

export interface EntityOptions {
  /** CQL table name */
  tableName: string;
  /**
   * Primary key definition.
   * @example key: ['id']                           → PRIMARY KEY (id)
   * @example key: [['tenant_id', 'bucket'], 'ts']  → PRIMARY KEY ((tenant_id, bucket), ts)
   * @example key: ['user_id', 'post_id']           → PRIMARY KEY (user_id, post_id)
   */
  key: PrimaryKeyDef;
  /** Override the module-level keyspace for this entity */
  keyspace?: string;
  /** Clustering column order override */
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  /** Table-level WITH options, e.g. { gc_grace_seconds: 864000 } */
  withOptions?: Record<string, unknown>;
}

/**
 * Marks a class as a Cassandra table entity.
 *
 * @example
 * ```ts
 * @Entity({ tableName: 'users', key: ['id'] })
 * export class UserEntity {
 *   @GeneratedUuidColumn() id: types.Uuid;
 *   @Column({ type: 'text' }) name: string;
 * }
 * ```
 */
export const Entity = (options: EntityOptions): ClassDecorator => {
  return (target) => {
    const metadata: EntityMetadata = {
      tableName: options.tableName,
      key: options.key,
      keyspace: options.keyspace,
      orderBy: options.orderBy,
      withOptions: options.withOptions,
    };
    Reflect.defineMetadata(ENTITY_METADATA, metadata, target);
  };
};
