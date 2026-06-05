# @l337quez/nest-cassandra

![Nest Cassandra Portada](https://github.com/l337quez/nest-cassandra/raw/main/assets/nest-cassandra.png)

> A **Typegoose-style** NestJS library for Apache Cassandra & ScyllaDB.  
> Decorator-driven, type-safe, built directly on the official `cassandra-driver` — zero `express-cassandra` dependency.

[![npm version](https://img.shields.io/npm/v/@l337quez/nest-cassandra.svg)](https://www.npmjs.com/package/@l337quez/nest-cassandra)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

- 🎯 **Decorator-first** — Define your schema once with TypeScript classes. No separate schema files.
- 🔒 **Type-safe** — Fully typed `CassandraModel<T>` and `QueryBuilder<T>`. No `any` in the public API.
- 🚀 **Driver-native** — Built on top of the official [`cassandra-driver`](https://github.com/datastax/nodejs-driver). No intermediary ORM layer.
- ⚙️ **Schema sync** — Auto-creates or alters tables on startup (`create` | `alter` | `none`).
- 🔗 **Multi-connection** — Multiple named Cassandra clients in the same app.
- 🔄 **Lifecycle hooks** — `@BeforeSave`, `@AfterSave`, `@BeforeUpdate`, `@AfterUpdate`, `@BeforeDelete`, `@AfterDelete`.
- 📦 **Repository pattern** — `Repository<T>` base class with custom repository support.
- ⚡ **Batch operations** — Atomic batch INSERT/UPDATE/DELETE across multiple models.
- 👁️ **Materialized Views** — First-class decorator support for Cassandra MVs.
- 🌿 **ScyllaDB compatible** — Works with ScyllaDB out of the box (CQL-compatible).
- 🛑 **Graceful shutdown** — Properly closes connections via `OnApplicationShutdown`.

---

## Installation

```bash
npm install @l337quez/nest-cassandra cassandra-driver reflect-metadata
```

Make sure your `tsconfig.json` has decorators enabled:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

---

## Quick Start

### 1. Register the module

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { CassandraModule } from '@l337quez/nest-cassandra';

@Module({
  imports: [
    CassandraModule.forRoot({
      keyspace: 'my_app',
      contactPoints: ['127.0.0.1'],
      localDataCenter: 'datacenter1',
      syncSchema: 'create', // auto-creates tables on startup
    }),
  ],
})
export class AppModule {}
```

### 2. Define an entity

```typescript
// user.entity.ts
import { types } from 'cassandra-driver';
import {
  Entity,
  Column,
  GeneratedUuidColumn,
  CreateDateColumn,
  UpdateDateColumn,
  IndexColumn,
} from '@l337quez/nest-cassandra';

@Entity({ tableName: 'users', key: ['id'] })
export class UserEntity {
  @GeneratedUuidColumn()
  id: types.Uuid;

  @Column({ type: 'text' })
  name: string;

  @IndexColumn()
  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'int', default: 0 })
  login_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

### 3. Register in a feature module

```typescript
// user.module.ts
import { Module } from '@nestjs/common';
import { CassandraModule } from '@l337quez/nest-cassandra';
import { UserEntity } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [CassandraModule.forFeature([UserEntity])],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}
```

### 4. Use in a service

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel, CassandraModel } from '@l337quez/nest-cassandra';
import { UserEntity } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(UserEntity)
    private readonly userModel: CassandraModel<UserEntity>,
  ) {}

  findAll() {
    return this.userModel.find();
  }

  findByEmail(email: string) {
    return this.userModel.select().where('email', email).one();
  }

  create(name: string, email: string) {
    return this.userModel.save({ name, email });
  }

  update(id: types.Uuid, name: string) {
    return this.userModel.update({ id }, { name });
  }

  remove(id: types.Uuid) {
    return this.userModel.delete({ id });
  }
}
```

---

## Decorators

### `@Entity(options)`

Marks a class as a Cassandra table. Required on every entity.

| Option | Type | Description |
|---|---|---|
| `tableName` | `string` | CQL table name |
| `key` | `PrimaryKeyDef` | Primary key definition (see below) |
| `keyspace` | `string` | Override module-level keyspace for this table |
| `orderBy` | `Record<string, 'ASC' \| 'DESC'>` | Clustering column order |
| `withOptions` | `Record<string, unknown>` | Table-level `WITH` options |

**Primary key examples:**

```typescript
// Simple partition key
@Entity({ tableName: 'users', key: ['id'] })

// Partition key + clustering key
@Entity({ tableName: 'posts', key: ['user_id', 'created_at'] })

// Compound partition key + clustering key
@Entity({
  tableName: 'events',
  key: [['tenant_id', 'bucket'], 'event_time'],
  orderBy: { event_time: 'DESC' },
})
```

---

### `@Column(options?)`

Marks a property as a Cassandra column. The CQL type is **auto-inferred** from the TypeScript type when not specified.

| TypeScript | CQL default |
|---|---|
| `string` | `text` |
| `number` | `int` |
| `boolean` | `boolean` |
| `Date` | `timestamp` |
| `Buffer` | `blob` |

```typescript
@Column()                           // auto-inferred
name: string;

@Column({ type: 'bigint' })         // explicit type
followers: number;

@Column({ type: 'list<text>', frozen: true })
tags: string[];

@Column({ type: 'map<text,int>' })
scores: Map<string, number>;

@Column({ type: 'text', default: 'pending' })
status: string;
```

| Option | Type | Description |
|---|---|---|
| `type` | `CassandraType` | Explicit CQL type |
| `columnName` | `string` | Override column name (defaults to snake_case) |
| `frozen` | `boolean` | Wrap collection in `FROZEN<>` |
| `static` | `boolean` | Mark as a STATIC column |
| `default` | `unknown \| () => unknown` | Default value or factory |

---

### `@GeneratedUuidColumn(type?)`

Auto-generates a UUID or TimeUUID on INSERT if no value is provided.

```typescript
@GeneratedUuidColumn()             // uuid (default)
id: types.Uuid;

@GeneratedUuidColumn('timeuuid')   // timeuuid
event_time: types.TimeUuid;
```

---

### `@CreateDateColumn()` / `@UpdateDateColumn()` / `@VersionColumn()`

```typescript
@CreateDateColumn()    // set on INSERT only
created_at: Date;

@UpdateDateColumn()    // set on INSERT and UPDATE
updated_at: Date;

@VersionColumn()       // timeuuid, auto-generated on INSERT
__version: types.TimeUuid;
```

---

### `@IndexColumn()`

Creates a secondary index (`CREATE INDEX`) on this column.

```typescript
@IndexColumn()
@Column({ type: 'text' })
email: string;
```

> ⚠️ Secondary indexes in Cassandra have performance implications at scale. Use them carefully.

---

## Lifecycle Hooks

Define methods on your entity class and mark them with hook decorators.

```typescript
@Entity({ tableName: 'users', key: ['id'] })
export class UserEntity {
  @Column({ type: 'text' })
  email: string;

  @BeforeSave()
  validate() {
    if (!this.email.includes('@')) {
      throw new Error('Invalid email address');
    }
  }

  @AfterSave()
  async logCreation() {
    console.log(`User created: ${this.email}`);
  }

  @BeforeDelete()
  checkPermissions() {
    // authorization logic
  }
}
```

Available hooks:

| Decorator | Fires |
|---|---|
| `@BeforeSave()` | Before `model.save()` |
| `@AfterSave()` | After `model.save()` |
| `@BeforeUpdate()` | Before `model.update()` |
| `@AfterUpdate()` | After `model.update()` |
| `@BeforeDelete()` | Before `model.delete()` |
| `@AfterDelete()` | After `model.delete()` |

---

## `CassandraModel<T>` API

Injected via `@InjectModel(EntityClass)`.

### `find(where?, options?)`

```typescript
// All rows
const users = await userModel.find();

// With WHERE conditions
const actives = await userModel.find({ status: 'active' });

// With pagination
const page = await userModel.find({}, { limit: 20, fetchSize: 20 });
```

### `findOne(where, options?)`

```typescript
const user = await userModel.findOne({ email: 'alice@example.com' });
// Returns null if not found
```

### `save(entity)`

```typescript
const user = await userModel.save({
  name: 'Alice',
  email: 'alice@example.com',
});
// id, created_at, updated_at are auto-populated
```

### `update(where, values)`

```typescript
await userModel.update({ id }, { name: 'Alice Smith' });
// updated_at is auto-set
```

### `delete(where)`

```typescript
await userModel.delete({ id });
```

### `execute(query, params?, options?)` — Raw CQL

```typescript
const result = await userModel.execute(
  'SELECT * FROM users WHERE token(id) > token(?)',
  [lastId],
);
```

---

## Query Builder

Start a fluent SELECT query with `.select()`:

```typescript
// Select specific columns
const users = await userModel
  .select('name', 'email')
  .where('status', 'active')
  .limit(100)
  .execute();

// Range queries with operators
const recent = await userModel
  .select()
  .where('user_id', userId)
  .where('created_at', oneWeekAgo, '>=')
  .orderBy('created_at', 'DESC')
  .limit(50)
  .execute();

// IN operator
const specific = await userModel
  .select()
  .where('id', [id1, id2, id3], 'IN')
  .execute();

// Allow filtering for non-PK queries
const filtered = await userModel
  .select()
  .where('email', 'alice@example.com')
  .allowFiltering()
  .one();

// Pagination
const page1 = await userModel.select().fetchSize(20).execute();
const page2 = await userModel.select().pageState(page1Result.pageState).fetchSize(20).execute();
```

Supported operators: `=` `>` `<` `>=` `<=` `IN` `CONTAINS` `CONTAINS KEY`

---

## Repository Pattern

### Built-in repository

```typescript
@Module({
  imports: [CassandraModule.forFeature([UserEntity])],
})
export class UserModule {}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(UserEntity)
    private readonly userModel: CassandraModel<UserEntity>,
  ) {}
}
```

### Custom repository

```typescript
// user.repository.ts
import { EntityRepository, Repository } from '@l337quez/nest-cassandra';
import { UserEntity } from './user.entity';

@EntityRepository(UserEntity)
export class UserRepository extends Repository<UserEntity> {
  findByEmail(email: string) {
    return this.findOne({ email });
  }

  findRecentUsers(limit = 10) {
    return this.select()
      .where('created_at', oneWeekAgo, '>=')
      .limit(limit)
      .allowFiltering()
      .execute();
  }
}
```

Register the repository alongside the entity:

```typescript
CassandraModule.forFeature([UserEntity, UserRepository])
```

Inject in your service:

```typescript
@InjectRepository(UserRepository)
private readonly userRepo: UserRepository;

const user = await this.userRepo.findByEmail('alice@example.com');
```

---

## Batch Operations

Combine multiple operations from different models into a single atomic batch:

```typescript
import { BatchStatement } from '@l337quez/nest-cassandra';

// Prepare statements (no execution yet)
const insertUser    = userModel.prepareSave({ id, name, email });
const insertProfile = profileModel.prepareSave({ userId: id, bio });
const deleteOld     = oldModel.prepareDelete({ id: oldId });

// Execute all atomically
await userModel.batch([insertUser, insertProfile, deleteOld], {
  type: 'logged', // 'logged' | 'unlogged' | 'counter'
});
```

---

## Materialized Views

```typescript
// user.entity.ts
@Entity({ tableName: 'users', key: ['id'] })
export class UserEntity {
  @GeneratedUuidColumn() id: types.Uuid;
  @Column() name: string;
  @IndexColumn() @Column() email: string;
}

// users-by-email.view.ts
import { MaterializedView, Column } from '@l337quez/nest-cassandra';

@MaterializedView({
  viewName: 'users_by_email',
  baseEntity: UserEntity,
  key: [['email'], 'id'],
  where: 'email IS NOT NULL AND id IS NOT NULL',
})
export class UsersByEmailView {
  @Column({ type: 'text' }) email: string;
  @Column({ type: 'uuid' }) id: types.Uuid;
  @Column({ type: 'text' }) name: string;
}
```

Register the view in `forFeature` — the schema is synced automatically:

```typescript
CassandraModule.forFeature([UserEntity, UsersByEmailView])
```

---

## Async Configuration

### `useFactory`

```typescript
CassandraModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    keyspace: config.get('CASSANDRA_KEYSPACE'),
    contactPoints: [config.get('CASSANDRA_HOST')],
    localDataCenter: config.get('CASSANDRA_DC'),
    syncSchema: 'create',
  }),
})
```

### `useClass`

```typescript
@Injectable()
class CassandraConfigService implements CassandraOptionsFactory {
  createCassandraOptions(): CassandraOptions {
    return {
      keyspace: 'my_app',
      contactPoints: ['127.0.0.1'],
      localDataCenter: 'datacenter1',
    };
  }
}

CassandraModule.forRootAsync({ useClass: CassandraConfigService })
```

---

## Multiple Connections

```typescript
// app.module.ts
@Module({
  imports: [
    CassandraModule.forRoot({
      clientName: 'main',
      keyspace: 'main_db',
      contactPoints: ['127.0.0.1'],
      localDataCenter: 'datacenter1',
    }),
    CassandraModule.forRoot({
      clientName: 'analytics',
      keyspace: 'analytics_db',
      contactPoints: ['10.0.0.1'],
      localDataCenter: 'datacenter1',
    }),
  ],
})
export class AppModule {}

// Register entities with a specific connection
CassandraModule.forFeature([UserEntity], 'main')
CassandraModule.forFeature([EventEntity], 'analytics')

// Inject a specific raw client
@InjectCassandra('analytics')
private readonly analyticsClient: Client;
```

---

## Schema Sync

Configure `syncSchema` in `forRoot`:

| Mode | Behavior |
|---|---|
| `'create'` | `CREATE TABLE IF NOT EXISTS` — safe for production ✅ |
| `'alter'` | `CREATE TABLE` + `ALTER TABLE ADD` for new columns ⚠️ |
| `'none'` | Do nothing — manage migrations manually |

> **Note:** Cassandra does not support removing or renaming columns. Use `'alter'` carefully.

---

## Lifecycle Hooks (Module Level)

```typescript
CassandraModule.forRoot({
  // ...connection options...
  onReady: async (client) => {
    console.log('Cassandra connected!');
    // run custom initialization
  },
  beforeShutdown: async (client) => {
    console.log('Closing Cassandra connection...');
  },
})
```

Enable graceful shutdown in `main.ts`:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // required for onApplicationShutdown
  await app.listen(3000);
}
```

---

## ScyllaDB

This library is fully compatible with **ScyllaDB**. Just point `contactPoints` at your ScyllaDB cluster — no configuration changes needed.

```typescript
CassandraModule.forRoot({
  keyspace: 'my_app',
  contactPoints: ['scylla-node-1', 'scylla-node-2'],
  localDataCenter: 'datacenter1',
  syncSchema: 'create',
})
```

---

## Local Development

```bash
# Start a local Cassandra instance
docker-compose up -d

# Install dependencies
npm install

# Run unit tests (no DB required)
npm test

# Build
npm run build
```

---

## License

MIT © l337quez