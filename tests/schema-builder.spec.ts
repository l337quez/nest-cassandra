import 'reflect-metadata';
import { SchemaBuilder } from '../src/schema/schema-builder';
import { Entity } from '../src/decorators/entity.decorator';
import { Column } from '../src/decorators/column.decorator';
import { GeneratedUuidColumn } from '../src/decorators/generated.decorator';
import { CreateDateColumn, UpdateDateColumn } from '../src/decorators/timestamp.decorator';
import { IndexColumn } from '../src/decorators/index-column.decorator';

// ─── Test Entities ────────────────────────────────────────────────────────────

@Entity({ tableName: 'users', key: ['id'] })
class SimpleUserEntity {
  @GeneratedUuidColumn()
  id: unknown;

  @Column({ type: 'text' })
  name: string = '';

  @Column()
  email: string = '';

  @IndexColumn()
  @Column({ type: 'text' })
  status: string = '';

  @CreateDateColumn()
  created_at: Date = new Date();

  @UpdateDateColumn()
  updated_at: Date = new Date();
}

@Entity({
  tableName: 'events',
  key: [['tenant_id', 'bucket'], 'event_time'],
  orderBy: { event_time: 'DESC' },
})
class CompoundKeyEntity {
  @Column({ type: 'uuid' })
  tenant_id: unknown;

  @Column({ type: 'int' })
  bucket: number = 0;

  @Column({ type: 'timeuuid' })
  event_time: unknown;

  @Column({ type: 'text' })
  payload: string = '';
}

@Entity({
  tableName: 'products',
  key: ['id'],
  keyspace: 'catalog',
  withOptions: { gc_grace_seconds: 86400 },
})
class ProductEntity {
  @GeneratedUuidColumn()
  id: unknown;

  @Column({ type: 'text' })
  name: string = '';

  @Column({ type: 'decimal' })
  price: number = 0;

  @Column({ type: 'list<text>', frozen: true })
  tags: string[] = [];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SchemaBuilder.buildCreateTable()', () => {
  it('generates a simple CREATE TABLE with PRIMARY KEY (id)', () => {
    const statements = SchemaBuilder.buildCreateTable(SimpleUserEntity);
    const createTable = statements[0];

    expect(createTable).toContain('CREATE TABLE IF NOT EXISTS');
    expect(createTable).toContain('"users"');
    expect(createTable).toContain('id uuid');
    expect(createTable).toContain('name text');
    expect(createTable).toContain('email text');
    expect(createTable).toContain('status text');
    expect(createTable).toContain('created_at timestamp');
    expect(createTable).toContain('updated_at timestamp');
    expect(createTable).toContain('PRIMARY KEY (id)');
  });

  it('generates a CREATE INDEX for @IndexColumn fields', () => {
    const statements = SchemaBuilder.buildCreateTable(SimpleUserEntity);
    const indexStatement = statements.find((s) => s.startsWith('CREATE INDEX'));

    expect(indexStatement).toBeDefined();
    expect(indexStatement).toContain('CREATE INDEX IF NOT EXISTS ON');
    expect(indexStatement).toContain('"users"(status)');
  });

  it('generates a compound partition key', () => {
    const statements = SchemaBuilder.buildCreateTable(CompoundKeyEntity);
    const createTable = statements[0];

    expect(createTable).toContain('PRIMARY KEY ((tenant_id, bucket), event_time)');
  });

  it('generates WITH CLUSTERING ORDER BY for compound key entity', () => {
    const statements = SchemaBuilder.buildCreateTable(CompoundKeyEntity);
    const createTable = statements[0];

    expect(createTable).toContain('WITH CLUSTERING ORDER BY (event_time DESC)');
  });

  it('prefixes table with keyspace when keyspace is defined on entity', () => {
    const statements = SchemaBuilder.buildCreateTable(ProductEntity);
    const createTable = statements[0];

    expect(createTable).toContain('"catalog"."products"');
  });

  it('uses defaultKeyspace when entity has no keyspace', () => {
    const statements = SchemaBuilder.buildCreateTable(SimpleUserEntity, 'my_app');
    const createTable = statements[0];

    expect(createTable).toContain('"my_app"."users"');
  });

  it('generates FROZEN<> for frozen collections', () => {
    const statements = SchemaBuilder.buildCreateTable(ProductEntity);
    const createTable = statements[0];

    expect(createTable).toContain('frozen<list<text>>');
  });

  it('includes WITH options', () => {
    const statements = SchemaBuilder.buildCreateTable(ProductEntity);
    const createTable = statements[0];

    expect(createTable).toContain('gc_grace_seconds');
  });
});

describe('SchemaBuilder.buildAlterTable()', () => {
  it('generates ALTER TABLE ADD for new columns only', () => {
    const existing = ['id', 'name']; // price and tags are new
    const statements = SchemaBuilder.buildAlterTable(ProductEntity, existing, 'catalog');

    expect(statements.length).toBeGreaterThanOrEqual(2);
    expect(statements.some((s) => s.includes('ADD price'))).toBe(true);
    expect(statements.some((s) => s.includes('ADD tags'))).toBe(true);
    expect(statements.some((s) => s.includes('ADD name'))).toBe(false);
  });

  it('returns empty array when all columns already exist', () => {
    const existing = ['id', 'name', 'price', 'tags'];
    const statements = SchemaBuilder.buildAlterTable(ProductEntity, existing);

    expect(statements).toHaveLength(0);
  });
});
