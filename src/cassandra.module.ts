import {
  DynamicModule,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
  Provider,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Client } from 'cassandra-driver';
import {
  CASSANDRA_OPTIONS,
  CASSANDRA_TOKEN,
  getCassandraClientToken,
  ENTITY_METADATA,
  ENTITY_REPOSITORY_METADATA,
  MATERIALIZED_VIEW_METADATA,
} from './cassandra.constants';
import {
  CassandraModuleOptions,
  CassandraModuleAsyncOptions,
  CassandraOptions,
} from './interfaces/cassandra-module-options.interface';
import {
  createTokenProvider,
  createOptionsProvider,
  createClientProvider,
  createAsyncProviders,
  createFeatureProviders,
} from './cassandra.providers';
import { resolveClientName, shutdownClient } from './cassandra.utils';

const logger = new Logger('CassandraModule');

@Module({})
export class CassandraModule implements OnApplicationShutdown {
  constructor(
    @Inject(CASSANDRA_TOKEN)
    private readonly clientName: string,
    @Inject(CASSANDRA_OPTIONS)
    private readonly options: CassandraOptions,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ─── forRoot ──────────────────────────────────────────────────────────────

  /**
   * Configure the Cassandra connection synchronously.
   *
   * @example
   * ```ts
   * @Module({
   *   imports: [
   *     CassandraModule.forRoot({
   *       keyspace: 'my_app',
   *       contactPoints: ['127.0.0.1'],
   *       localDataCenter: 'datacenter1',
   *       syncSchema: 'create',
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(options: CassandraModuleOptions): DynamicModule {
    const clientName     = resolveClientName(options.clientName);
    const tokenProvider  = createTokenProvider(clientName);
    const optionProvider = createOptionsProvider(options);
    const clientProvider = createClientProvider(clientName);

    const providers: Provider[] = [tokenProvider, optionProvider, clientProvider];

    return {
      global:    options.isGlobal !== false, // default: true
      module:    CassandraModule,
      providers,
      exports:   [clientProvider, optionProvider, CASSANDRA_TOKEN],
    };
  }

  // ─── forRootAsync ─────────────────────────────────────────────────────────

  /**
   * Configure the Cassandra connection asynchronously.
   *
   * @example
   * ```ts
   * CassandraModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({
   *     keyspace: config.get('CASSANDRA_KEYSPACE'),
   *     contactPoints: [config.get('CASSANDRA_HOST')],
   *     localDataCenter: config.get('CASSANDRA_DC'),
   *     syncSchema: 'create',
   *   }),
   * })
   * ```
   */
  static forRootAsync(options: CassandraModuleAsyncOptions): DynamicModule {
    const clientName      = resolveClientName(options.clientName);
    const tokenProvider   = createTokenProvider(clientName);
    const asyncProviders  = createAsyncProviders(options);

    const clientToken = getCassandraClientToken(clientName);

    return {
      global:   options.isGlobal !== false,
      module:   CassandraModule,
      imports:  options.imports ?? [],
      providers: [tokenProvider, ...asyncProviders],
      exports:  [
        clientToken,
        CASSANDRA_OPTIONS,
        CASSANDRA_TOKEN,
      ],
    };
  }

  // ─── forFeature ───────────────────────────────────────────────────────────

  /**
   * Register entities, repositories, and materialized views for a feature module.
   * Entities get a `CassandraModel<T>`, repositories get the model injected.
   * Schema sync runs automatically based on the `syncSchema` option.
   *
   * Pass the classes in any order — the module detects each type via metadata.
   *
   * @example
   * ```ts
   * @Module({
   *   imports: [
   *     CassandraModule.forFeature([UserEntity, UserRepository, UsersByEmailView]),
   *   ],
   * })
   * export class UserModule {}
   * ```
   */
  static forFeature(
    classes: Function[],
    clientName?: string,
  ): DynamicModule {
    const featureProviders = createFeatureProviders(classes, clientName);

    // Collect export tokens for entities and repositories
    const exports: (string | symbol)[] = [];
    for (const cls of classes) {
      const isRepo = !!Reflect.getMetadata(ENTITY_REPOSITORY_METADATA, cls);
      const isEnt  = !!Reflect.getMetadata(ENTITY_METADATA, cls);
      const isMV   = !!Reflect.getMetadata(MATERIALIZED_VIEW_METADATA, cls);

      if (isEnt) {
        exports.push(`CASSANDRA_MODEL:${cls.name}`);
      } else if (isRepo) {
        exports.push(`CASSANDRA_REPO:${cls.name}`);
      } else if (isMV) {
        exports.push(`CASSANDRA_MV_SYNC:${cls.name}`);
      }
    }

    return {
      module:    CassandraModule,
      providers: featureProviders,
      exports,
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async onApplicationShutdown(): Promise<void> {
    const token = getCassandraClientToken(this.clientName);

    try {
      const client = this.moduleRef.get<Client>(token, { strict: false });
      if (client) {
        if (this.options.beforeShutdown) {
          await this.options.beforeShutdown(client);
        }
        logger.log(`Closing Cassandra connection [${this.clientName}]`);
        await shutdownClient(client);
      }
    } catch {
      // Provider might not be available in forFeature-only contexts
    }
  }
}
