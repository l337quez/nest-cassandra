import { ModuleMetadata, Type } from '@nestjs/common';
import { ClientOptions } from 'cassandra-driver';

/**
 * Schema synchronization modes:
 * - `none`   — Do nothing. You manage schema migrations manually.
 * - `create` — Create tables/views if they don't exist. Safe for production.
 * - `alter`  — Create tables and ADD new columns. Cannot remove columns.
 */
export type SyncSchema = 'none' | 'create' | 'alter';

/**
 * Core Cassandra connection options.
 * Extends cassandra-driver's ClientOptions with NestJS lifecycle hooks
 * and schema sync configuration.
 */
export interface CassandraOptions extends ClientOptions {
  /** Default keyspace to use. Passed to ClientOptions.keyspace */
  keyspace?: string;
  /**
   * Schema synchronization strategy.
   * @default 'create'
   */
  syncSchema?: SyncSchema;
  /** Called once the Cassandra client is connected and ready */
  onReady?: (client: import('cassandra-driver').Client) => void | Promise<void>;
  /** Called before the Cassandra client is shut down */
  beforeShutdown?: (client: import('cassandra-driver').Client) => void | Promise<void>;
}

/**
 * Options passed to CassandraModule.forRoot()
 */
export interface CassandraModuleOptions extends CassandraOptions {
  /**
   * Register this module as a global module.
   * @default true
   */
  isGlobal?: boolean;
  /**
   * Named client identifier — allows multiple Cassandra connections.
   * @example clientName: 'analytics'
   * @example clientName: 'main'
   */
  clientName?: string;
}

/**
 * Factory interface for creating CassandraOptions.
 * Use with CassandraModule.forRootAsync({ useClass: MyConfigService })
 */
export interface CassandraOptionsFactory {
  createCassandraOptions(
    clientName?: string,
  ): CassandraOptions | Promise<CassandraOptions>;
}

/**
 * Options passed to CassandraModule.forRootAsync()
 */
export interface CassandraModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  isGlobal?: boolean;
  clientName?: string;
  useFactory?: (...args: unknown[]) => CassandraOptions | Promise<CassandraOptions>;
  useClass?: Type<CassandraOptionsFactory>;
  useExisting?: Type<CassandraOptionsFactory>;
  inject?: unknown[];
}
