// ─── DI Tokens ────────────────────────────────────────────────────────────────
export const CASSANDRA_OPTIONS = 'CASSANDRA_OPTIONS';
export const CASSANDRA_TOKEN   = 'CASSANDRA_TOKEN';
export const CASSANDRA_CLIENT  = 'CASSANDRA_CLIENT';

/** Default client name when none is specified */
export const DEFAULT_CLIENT_NAME = 'default';

// ─── Metadata Keys ────────────────────────────────────────────────────────────
export const ENTITY_METADATA            = '__nc_entity__';
export const COLUMNS_METADATA           = '__nc_columns__';
export const HOOKS_METADATA             = '__nc_hooks__';
export const ENTITY_REPOSITORY_METADATA = '__nc_entity_repository__';
export const MATERIALIZED_VIEW_METADATA = '__nc_materialized_view__';

// ─── Token Factories ──────────────────────────────────────────────────────────

/**
 * Returns the DI injection token for a Cassandra client.
 * @example getCassandraClientToken()           → 'CASSANDRA_CLIENT:default'
 * @example getCassandraClientToken('analytics') → 'CASSANDRA_CLIENT:analytics'
 */
export const getCassandraClientToken = (name = DEFAULT_CLIENT_NAME): string =>
  `${CASSANDRA_CLIENT}:${name}`;

/**
 * Returns the DI injection token for a CassandraModel of a given entity class.
 * @example getCassandraModelToken(UserEntity) → 'CASSANDRA_MODEL:UserEntity'
 */
export const getCassandraModelToken = (EntityClass: Function): string =>
  `CASSANDRA_MODEL:${EntityClass.name}`;

/**
 * Returns the DI injection token for a repository class.
 * @example getCassandraRepositoryToken(UserRepository) → 'CASSANDRA_REPO:UserRepository'
 */
export const getCassandraRepositoryToken = (RepositoryClass: Function): string =>
  `CASSANDRA_REPO:${RepositoryClass.name}`;
