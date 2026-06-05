import { Provider, Type } from '@nestjs/common';
import { Client } from 'cassandra-driver';
import {
  CASSANDRA_OPTIONS,
  CASSANDRA_TOKEN,
  getCassandraClientToken,
  getCassandraModelToken,
  getCassandraRepositoryToken,
  ENTITY_REPOSITORY_METADATA,
  MATERIALIZED_VIEW_METADATA,
  ENTITY_METADATA,
} from './cassandra.constants';
import {
  CassandraModuleOptions,
  CassandraModuleAsyncOptions,
  CassandraOptionsFactory,
  CassandraOptions,
  SyncSchema,
} from './interfaces/cassandra-module-options.interface';
import { createClient, resolveClientName } from './cassandra.utils';
import { CassandraModel } from './model/cassandra-model';
import { Repository } from './repository/repository';
import { SchemaBuilder } from './schema/schema-builder';

// ─── Root Providers ───────────────────────────────────────────────────────────

export function createTokenProvider(clientName?: string): Provider {
  return {
    provide: CASSANDRA_TOKEN,
    useValue: resolveClientName(clientName),
  };
}

export function createOptionsProvider(options: CassandraModuleOptions): Provider {
  return {
    provide: CASSANDRA_OPTIONS,
    useValue: options,
  };
}

export function createClientProvider(clientName?: string): Provider {
  const token = getCassandraClientToken(resolveClientName(clientName));
  return {
    provide: token,
    inject:  [CASSANDRA_OPTIONS],
    useFactory: (options: CassandraOptions) => createClient(options),
  };
}

export function createAsyncProviders(options: CassandraModuleAsyncOptions): Provider[] {
  const clientName = resolveClientName(options.clientName);
  const clientToken = getCassandraClientToken(clientName);

  if (options.useFactory) {
    return [
      {
        provide: CASSANDRA_OPTIONS,
        inject: (options.inject ?? []) as Type<unknown>[],
        useFactory: options.useFactory,
      },
      {
        provide: clientToken,
        inject: [CASSANDRA_OPTIONS],
        useFactory: (opts: CassandraOptions) => createClient(opts),
      },
    ];
  }

  const useClass = (options.useClass ?? options.useExisting) as Type<CassandraOptionsFactory>;

  const optionsProvider: Provider = {
    provide: CASSANDRA_OPTIONS,
    inject: [useClass],
    useFactory: async (factory: CassandraOptionsFactory) =>
      factory.createCassandraOptions(clientName),
  };

  const clientProvider: Provider = {
    provide: clientToken,
    inject: [CASSANDRA_OPTIONS],
    useFactory: (opts: CassandraOptions) => createClient(opts),
  };

  if (options.useClass) {
    return [optionsProvider, clientProvider, { provide: useClass, useClass }];
  }

  return [optionsProvider, clientProvider];
}

// ─── Feature Providers ────────────────────────────────────────────────────────

/**
 * Creates providers for each entity and repository class passed to forFeature().
 * - Entities → CassandraModel<T>   (token: getCassandraModelToken(EntityClass))
 * - Repositories → Repository<T>  (token: getCassandraRepositoryToken(RepoClass))
 * - MaterializedViews → schema sync only (no model registered)
 */
export function createFeatureProviders(
  classes: Function[],
  clientName?: string,
): Provider[] {
  const resolvedClient = resolveClientName(clientName);
  const clientToken    = getCassandraClientToken(resolvedClient);
  const providers: Provider[] = [];

  for (const cls of classes) {
    const isRepo = !!Reflect.getMetadata(ENTITY_REPOSITORY_METADATA, cls);
    const isMV   = !!Reflect.getMetadata(MATERIALIZED_VIEW_METADATA, cls);
    const isEnt  = !!Reflect.getMetadata(ENTITY_METADATA, cls);

    if (isRepo) {
      // Repository provider: inject model for its entity
      const EntityClass: Function = Reflect.getMetadata(ENTITY_REPOSITORY_METADATA, cls);
      const modelToken = getCassandraModelToken(EntityClass);
      const repoToken  = getCassandraRepositoryToken(cls);

      providers.push({
        provide: repoToken,
        inject: [modelToken],
        useFactory: (model: CassandraModel<object>) => {
          const repo = new (cls as new () => Repository<object>)();
          // inject the model into the repository instance
          (repo as unknown as { model: CassandraModel<object> }).model = model;
          return repo;
        },
      });
    } else if (isEnt) {
      // Entity provider: create CassandraModel
      const modelToken = getCassandraModelToken(cls);

      providers.push({
        provide: modelToken,
        inject: [clientToken, CASSANDRA_OPTIONS],
        useFactory: async (
          client: Client,
          options: CassandraModuleOptions,
        ): Promise<CassandraModel<object>> => {
          const syncMode: SyncSchema = options.syncSchema ?? 'create';

          if (syncMode !== 'none') {
            await SchemaBuilder.syncEntity(
              client,
              cls,
              syncMode,
              options.keyspace,
            );
          }

          return new CassandraModel(client, cls as new () => object, options.keyspace);
        },
      });
    } else if (isMV) {
      // Materialized view: create-only schema sync, no model
      // We add a factory provider that just runs the schema sync at startup
      providers.push({
        provide: `CASSANDRA_MV_SYNC:${cls.name}`,
        inject: [clientToken, CASSANDRA_OPTIONS],
        useFactory: async (
          client: Client,
          options: CassandraModuleOptions,
        ): Promise<true> => {
          const syncMode: SyncSchema = options.syncSchema ?? 'create';
          if (syncMode !== 'none') {
            await SchemaBuilder.syncMaterializedView(client, cls, options.keyspace);
          }
          return true;
        },
      });
    }
  }

  return providers;
}
