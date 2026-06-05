import 'reflect-metadata';
import { Entity } from '../src/decorators/entity.decorator';
import { Column } from '../src/decorators/column.decorator';
import { GeneratedUuidColumn } from '../src/decorators/generated.decorator';
import { CreateDateColumn, UpdateDateColumn, VersionColumn } from '../src/decorators/timestamp.decorator';
import { IndexColumn } from '../src/decorators/index-column.decorator';
import { BeforeSave, AfterSave, BeforeDelete } from '../src/decorators/hooks.decorator';
import { MaterializedView } from '../src/decorators/materialized-view.decorator';
import {
  ENTITY_METADATA,
  COLUMNS_METADATA,
  HOOKS_METADATA,
  MATERIALIZED_VIEW_METADATA,
} from '../src/cassandra.constants';

// ─── Test Entity ──────────────────────────────────────────────────────────────

@Entity({ tableName: 'articles', key: ['id'] })
class ArticleEntity {
  @GeneratedUuidColumn()
  id: unknown;

  @Column({ type: 'text' })
  title: string = '';

  @IndexColumn()
  @Column()
  slug: string = '';

  @Column({ type: 'int', default: 0 })
  view_count: number = 0;

  @CreateDateColumn()
  created_at: Date = new Date();

  @UpdateDateColumn()
  updated_at: Date = new Date();

  @VersionColumn()
  __v: unknown;

  @BeforeSave()
  validate() {
    if (!this.title) throw new Error('Title required');
  }

  @AfterSave()
  logSave() { /* audit */ }

  @BeforeDelete()
  checkPermission() { /* auth */ }
}

@MaterializedView({
  viewName: 'articles_by_slug',
  baseEntity: ArticleEntity,
  key: [['slug'], 'id'],
  where: 'slug IS NOT NULL AND id IS NOT NULL',
  orderBy: { id: 'ASC' },
})
class ArticlesBySlugView {
  @Column({ type: 'text' }) slug: string = '';
  @Column({ type: 'uuid' }) id: unknown;
  @Column({ type: 'text' }) title: string = '';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('@Entity decorator', () => {
  it('stores entity metadata via Reflect', () => {
    const meta = Reflect.getMetadata(ENTITY_METADATA, ArticleEntity);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe('articles');
    expect(meta.key).toEqual(['id']);
  });
});

describe('@Column decorator', () => {
  it('stores all column metadata', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    expect(Array.isArray(columns)).toBe(true);
    expect(columns.length).toBeGreaterThan(0);
  });

  it('auto-infers text type from string TypeScript type', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const slug = columns.find((c: { propertyKey: string }) => c.propertyKey === 'slug');
    expect(slug).toBeDefined();
    expect(slug.type).toBe('text');
  });

  it('stores explicit type override', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const vc = columns.find((c: { propertyKey: string }) => c.propertyKey === 'view_count');
    expect(vc?.type).toBe('int');
  });

  it('stores default value', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const vc = columns.find((c: { propertyKey: string }) => c.propertyKey === 'view_count');
    expect(vc?.default).toBe(0);
  });
});

describe('@GeneratedUuidColumn decorator', () => {
  it('marks column as generated uuid', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const id = columns.find((c: { propertyKey: string }) => c.propertyKey === 'id');
    expect(id?.generated).toBe('uuid');
    expect(id?.type).toBe('uuid');
  });
});

describe('@CreateDateColumn / @UpdateDateColumn / @VersionColumn', () => {
  it('marks created_at as isCreateDate', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const col = columns.find((c: { propertyKey: string }) => c.propertyKey === 'created_at');
    expect(col?.isCreateDate).toBe(true);
    expect(col?.type).toBe('timestamp');
  });

  it('marks updated_at as isUpdateDate', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const col = columns.find((c: { propertyKey: string }) => c.propertyKey === 'updated_at');
    expect(col?.isUpdateDate).toBe(true);
  });

  it('marks __v as isVersion with timeuuid type', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const col = columns.find((c: { propertyKey: string }) => c.propertyKey === '__v');
    expect(col?.isVersion).toBe(true);
    expect(col?.type).toBe('timeuuid');
  });
});

describe('@IndexColumn decorator', () => {
  it('marks column as indexed', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const slug = columns.find((c: { propertyKey: string }) => c.propertyKey === 'slug');
    expect(slug?.isIndex).toBe(true);
  });

  it('merges correctly with @Column on the same property', () => {
    const columns = Reflect.getMetadata(COLUMNS_METADATA, ArticleEntity);
    const slug = columns.find((c: { propertyKey: string }) => c.propertyKey === 'slug');
    // Should have BOTH isIndex (from @IndexColumn) AND type (from @Column)
    expect(slug?.isIndex).toBe(true);
    expect(slug?.type).toBe('text');
  });
});

describe('Hook decorators', () => {
  it('registers @BeforeSave, @AfterSave, @BeforeDelete hooks', () => {
    const hooks = Reflect.getMetadata(HOOKS_METADATA, ArticleEntity);
    expect(Array.isArray(hooks)).toBe(true);
    expect(hooks.some((h: { event: string }) => h.event === 'beforeSave')).toBe(true);
    expect(hooks.some((h: { event: string }) => h.event === 'afterSave')).toBe(true);
    expect(hooks.some((h: { event: string }) => h.event === 'beforeDelete')).toBe(true);
  });

  it('stores the method name for each hook', () => {
    const hooks = Reflect.getMetadata(HOOKS_METADATA, ArticleEntity);
    const beforeSave = hooks.find((h: { event: string }) => h.event === 'beforeSave');
    expect(beforeSave?.methodName).toBe('validate');
  });
});

describe('@MaterializedView decorator', () => {
  it('stores materialized view metadata', () => {
    const meta = Reflect.getMetadata(MATERIALIZED_VIEW_METADATA, ArticlesBySlugView);
    expect(meta).toBeDefined();
    expect(meta.viewName).toBe('articles_by_slug');
    expect(meta.where).toBe('slug IS NOT NULL AND id IS NOT NULL');
    expect(meta.key).toEqual([['slug'], 'id']);
  });

  it('stores the base entity reference', () => {
    const meta = Reflect.getMetadata(MATERIALIZED_VIEW_METADATA, ArticlesBySlugView);
    expect(meta.baseEntity).toBe(ArticleEntity);
  });
});
