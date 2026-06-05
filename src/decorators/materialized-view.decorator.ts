import { MATERIALIZED_VIEW_METADATA } from '../cassandra.constants';
import {
  MaterializedViewMetadata,
  PrimaryKeyDef,
} from '../interfaces/entity-metadata.interface';

export interface MaterializedViewOptions {
  /** CQL view name */
  viewName: string;
  /** The entity class whose table this view is built from */
  baseEntity: Function;
  /**
   * Primary key for the view. Must include all PK columns of the base table.
   * @example key: [['email'], 'id']
   */
  key: PrimaryKeyDef;
  /**
   * CQL WHERE clause — required by Cassandra.
   * All primary key columns must have IS NOT NULL.
   * @example 'email IS NOT NULL AND id IS NOT NULL'
   */
  where: string;
  /** Clustering column ORDER BY */
  orderBy?: Record<string, 'ASC' | 'DESC'>;
}

/**
 * Marks a class as a Cassandra Materialized View.
 * The class properties define which columns from the base table are included.
 *
 * @example
 * ```ts
 * @MaterializedView({
 *   viewName: 'users_by_email',
 *   baseEntity: UserEntity,
 *   key: [['email'], 'id'],
 *   where: 'email IS NOT NULL AND id IS NOT NULL',
 * })
 * export class UsersByEmailView {
 *   @Column({ type: 'text' }) email: string;
 *   @Column({ type: 'uuid' }) id: types.Uuid;
 *   @Column({ type: 'text' }) name: string;
 * }
 * ```
 */
export const MaterializedView = (
  options: MaterializedViewOptions,
): ClassDecorator => {
  return (target) => {
    const metadata: MaterializedViewMetadata = {
      viewName: options.viewName,
      baseEntity: options.baseEntity,
      key: options.key,
      where: options.where,
      orderBy: options.orderBy,
    };
    Reflect.defineMetadata(MATERIALIZED_VIEW_METADATA, metadata, target);
  };
};
