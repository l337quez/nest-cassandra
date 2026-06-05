import { HOOKS_METADATA } from '../cassandra.constants';
import { HookEvent, HookMetadata } from '../interfaces/entity-metadata.interface';

function createHookDecorator(event: HookEvent): MethodDecorator {
  return (target, propertyKey) => {
    const hooks: HookMetadata[] =
      Reflect.getMetadata(HOOKS_METADATA, target.constructor) ?? [];
    hooks.push({ event, methodName: propertyKey as string });
    Reflect.defineMetadata(HOOKS_METADATA, hooks, target.constructor);
  };
}

/**
 * Runs this method before an entity is saved (INSERT).
 * Receives `(instance: this)`.
 * @example
 * ```ts
 * @BeforeSave()
 * validate() {
 *   if (!this.email.includes('@')) throw new Error('Invalid email');
 * }
 * ```
 */
export const BeforeSave   = (): MethodDecorator => createHookDecorator('beforeSave');

/**
 * Runs this method after an entity is saved (INSERT).
 * @example
 * ```ts
 * @AfterSave()
 * async audit() { await auditLog.record(this); }
 * ```
 */
export const AfterSave    = (): MethodDecorator => createHookDecorator('afterSave');

/**
 * Runs this method before an entity is updated (UPDATE).
 * Receives `(where: Partial<T>, values: Partial<T>)`.
 */
export const BeforeUpdate = (): MethodDecorator => createHookDecorator('beforeUpdate');

/**
 * Runs this method after an entity is updated (UPDATE).
 */
export const AfterUpdate  = (): MethodDecorator => createHookDecorator('afterUpdate');

/**
 * Runs this method before an entity is deleted (DELETE).
 * Receives `(where: Partial<T>)`.
 */
export const BeforeDelete = (): MethodDecorator => createHookDecorator('beforeDelete');

/**
 * Runs this method after an entity is deleted (DELETE).
 */
export const AfterDelete  = (): MethodDecorator => createHookDecorator('afterDelete');
