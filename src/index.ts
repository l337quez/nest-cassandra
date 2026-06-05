// ─── Module ───────────────────────────────────────────────────────────────────
export { CassandraModule } from './cassandra.module';

// ─── Decorators ───────────────────────────────────────────────────────────────
export {
  Entity,
  EntityOptions,
} from './decorators/entity.decorator';

export {
  Column,
  ColumnOptions,
  toSnakeCase,
  inferCqlType,
} from './decorators/column.decorator';

export { GeneratedUuidColumn }                       from './decorators/generated.decorator';
export { CreateDateColumn, UpdateDateColumn, VersionColumn } from './decorators/timestamp.decorator';
export { IndexColumn }                               from './decorators/index-column.decorator';
export { EntityRepository }                          from './decorators/entity-repository.decorator';

export {
  BeforeSave,
  AfterSave,
  BeforeUpdate,
  AfterUpdate,
  BeforeDelete,
  AfterDelete,
} from './decorators/hooks.decorator';

export {
  InjectCassandra,
  InjectModel,
  InjectRepository,
} from './decorators/inject.decorator';

export {
  MaterializedView,
  MaterializedViewOptions,
} from './decorators/materialized-view.decorator';

// ─── Model & Repository ───────────────────────────────────────────────────────
export { CassandraModel }  from './model/cassandra-model';
export { QueryBuilder }    from './model/query-builder';
export { Repository }      from './repository/repository';

// ─── Schema ───────────────────────────────────────────────────────────────────
export { SchemaBuilder }   from './schema/schema-builder';

// ─── Interfaces ───────────────────────────────────────────────────────────────
export type {
  CassandraOptions,
  CassandraModuleOptions,
  CassandraModuleAsyncOptions,
  CassandraOptionsFactory,
  SyncSchema,
} from './interfaces/cassandra-module-options.interface';

export type {
  CassandraType,
  CassandraScalarType,
  EntityMetadata,
  ColumnMetadata,
  HookMetadata,
  HookEvent,
  MaterializedViewMetadata,
  PrimaryKeyDef,
  FindOptions,
  ExecuteOptions,
  BatchStatement,
  BatchOptions,
  BatchType,
} from './interfaces/entity-metadata.interface';

// ─── Constants ────────────────────────────────────────────────────────────────
export {
  getCassandraClientToken,
  getCassandraModelToken,
  getCassandraRepositoryToken,
  DEFAULT_CLIENT_NAME,
} from './cassandra.constants';
