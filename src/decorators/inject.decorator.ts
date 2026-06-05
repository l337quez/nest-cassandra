import { Inject } from '@nestjs/common';
import {
  getCassandraClientToken,
  getCassandraModelToken,
  getCassandraRepositoryToken,
  DEFAULT_CLIENT_NAME,
} from '../cassandra.constants';

/**
 * Injects the raw Cassandra `Client` for a given connection name.
 *
 * @param clientName Optional — defaults to the unnamed (default) connection.
 *
 * @example
 * ```ts
 * @InjectCassandra()
 * private readonly client: Client;
 *
 * @InjectCassandra('analytics')
 * private readonly analyticsClient: Client;
 * ```
 */
export const InjectCassandra = (clientName = DEFAULT_CLIENT_NAME) =>
  Inject(getCassandraClientToken(clientName));

/**
 * Injects the `CassandraModel<T>` for a given entity class.
 *
 * @example
 * ```ts
 * @InjectModel(UserEntity)
 * private readonly userModel: CassandraModel<UserEntity>;
 * ```
 */
export const InjectModel = (EntityClass: Function) =>
  Inject(getCassandraModelToken(EntityClass));

/**
 * Injects a custom `Repository<T>` class registered via `@EntityRepository`.
 *
 * @example
 * ```ts
 * @InjectRepository(UserRepository)
 * private readonly userRepo: UserRepository;
 * ```
 */
export const InjectRepository = (RepositoryClass: Function) =>
  Inject(getCassandraRepositoryToken(RepositoryClass));
