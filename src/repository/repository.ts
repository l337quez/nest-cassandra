import { CassandraModel } from '../model/cassandra-model';
import { FindOptions, BatchStatement, BatchOptions } from '../interfaces/entity-metadata.interface';
import { QueryBuilder } from '../model/query-builder';

/**
 * Base repository class that wraps `CassandraModel<T>`.
 * Extend this class with `@EntityRepository(EntityClass)` to create a custom repository.
 *
 * @example
 * ```ts
 * @EntityRepository(UserEntity)
 * export class UserRepository extends Repository<UserEntity> {
 *   async findByEmail(email: string) {
 *     return this.findOne({ email });
 *   }
 *
 *   async findRecentUsers(limit = 10) {
 *     return this.select()
 *       .orderBy('created_at', 'DESC')
 *       .limit(limit)
 *       .execute();
 *   }
 * }
 * ```
 */
export abstract class Repository<T extends object> {
  /**
   * The underlying CassandraModel.
   * Set by the DI system when `forFeature` registers this repository.
   */
  readonly model!: CassandraModel<T>;

  // ─── Delegated Methods ────────────────────────────────────────────────────

  /** Find all rows matching optional WHERE conditions */
  find(where?: Partial<T>, options?: FindOptions): Promise<T[]> {
    return this.model.find(where, options);
  }

  /** Find a single row. Returns `null` if not found */
  findOne(where: Partial<T>, options?: FindOptions): Promise<T | null> {
    return this.model.findOne(where, options);
  }

  /** Insert a new row */
  save(entity: Partial<T>): Promise<T> {
    return this.model.save(entity);
  }

  /** Update rows matching WHERE */
  update(where: Partial<T>, values: Partial<T>): Promise<void> {
    return this.model.update(where, values);
  }

  /** Delete rows matching WHERE */
  delete(where: Partial<T>): Promise<void> {
    return this.model.delete(where);
  }

  /** Start a fluent SELECT query */
  select(...columns: (keyof T | string)[]): QueryBuilder<T> {
    return this.model.select(...columns);
  }

  /** Prepare an INSERT for batch execution */
  prepareSave(entity: Partial<T>): BatchStatement {
    return this.model.prepareSave(entity);
  }

  /** Prepare an UPDATE for batch execution */
  prepareUpdate(where: Partial<T>, values: Partial<T>): BatchStatement {
    return this.model.prepareUpdate(where, values);
  }

  /** Prepare a DELETE for batch execution */
  prepareDelete(where: Partial<T>): BatchStatement {
    return this.model.prepareDelete(where);
  }

  /** Execute a BATCH of statements atomically */
  batch(statements: BatchStatement[], options?: BatchOptions): Promise<void> {
    return this.model.batch(statements, options);
  }
}
