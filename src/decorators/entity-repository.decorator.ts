import { ENTITY_REPOSITORY_METADATA } from '../cassandra.constants';

/**
 * Marks a class as a custom repository for a specific entity.
 * Register it alongside the entity in `CassandraModule.forFeature()`.
 *
 * @example
 * ```ts
 * @EntityRepository(UserEntity)
 * export class UserRepository extends Repository<UserEntity> {
 *   findByEmail(email: string) {
 *     return this.findOne({ email });
 *   }
 * }
 *
 * // In your module:
 * CassandraModule.forFeature([UserEntity, UserRepository])
 *
 * // In your service:
 * @InjectRepository(UserRepository)
 * private readonly userRepo: UserRepository;
 * ```
 */
export const EntityRepository = (EntityClass: Function): ClassDecorator => {
  return (target) => {
    Reflect.defineMetadata(ENTITY_REPOSITORY_METADATA, EntityClass, target);
  };
};
