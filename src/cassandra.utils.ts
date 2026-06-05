import { Client } from 'cassandra-driver';
import { Logger } from '@nestjs/common';
import {
  CassandraOptions,
  CassandraModuleOptions,
} from './interfaces/cassandra-module-options.interface';
import { getCassandraClientToken, DEFAULT_CLIENT_NAME } from './cassandra.constants';

const logger = new Logger('CassandraUtils');

/** Normalize clientName, falling back to the default */
export function resolveClientName(name?: string): string {
  return name ?? DEFAULT_CLIENT_NAME;
}

/** Build and connect a Cassandra Client from options */
export async function createClient(options: CassandraOptions): Promise<Client> {
  const { onReady, beforeShutdown, syncSchema, isGlobal, clientName, ...clientOptions } =
    options as CassandraModuleOptions;

  const client = new Client(clientOptions);

  if (!(options as { noConnect?: boolean }).noConnect) {
    await client.connect();
    logger.log(`Cassandra client connected [${resolveClientName(clientName)}]`);

    if (onReady) {
      await onReady(client);
    }
  }

  return client;
}

/** Gracefully shut down a Cassandra client */
export async function shutdownClient(client: Client): Promise<void> {
  try {
    await client.shutdown();
  } catch {
    // Ignore shutdown errors
  }
}

/** Check if a class has the @Entity decorator */
export function isEntity(target: Function): boolean {
  const { ENTITY_METADATA } = require('./cassandra.constants');
  return !!Reflect.getMetadata(ENTITY_METADATA, target);
}

/** Check if a class has the @EntityRepository decorator */
export function isRepository(target: Function): boolean {
  const { ENTITY_REPOSITORY_METADATA } = require('./cassandra.constants');
  return !!Reflect.getMetadata(ENTITY_REPOSITORY_METADATA, target);
}

/** Check if a class has the @MaterializedView decorator */
export function isMaterializedView(target: Function): boolean {
  const { MATERIALIZED_VIEW_METADATA } = require('./cassandra.constants');
  return !!Reflect.getMetadata(MATERIALIZED_VIEW_METADATA, target);
}

/** Generate the DI token for a named Cassandra client */
export const clientToken = (name?: string): string =>
  getCassandraClientToken(resolveClientName(name));
