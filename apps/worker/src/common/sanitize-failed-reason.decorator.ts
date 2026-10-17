import { summarizeErrorForLog } from '@iwana/db';

type AsyncMethod = (this: unknown, ...args: unknown[]) => Promise<unknown>;

/** Evita que BullMQ persista mensajes crudos como failedReason en Redis. */
export function SanitizeFailedReason(): MethodDecorator {
  return (_target, _propertyKey, descriptor) => {
    const original = descriptor?.value;
    if (typeof original !== 'function' || !descriptor) return;

    const processMethod = original as AsyncMethod;
    Object.defineProperty(descriptor, 'value', {
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
      writable: true,
      value: async function (this: unknown, ...args: unknown[]): Promise<unknown> {
        try {
          return await processMethod.apply(this, args);
        } catch (error: unknown) {
          const summary = summarizeErrorForLog(error);
          const safeError = new Error(summary);
          if (error instanceof Error) {
            // Preserva instanceof (p. ej. UnrecoverableError de BullMQ) para que
            // los estados de reintento sigan teniendo el mismo comportamiento.
            Object.setPrototypeOf(safeError, Object.getPrototypeOf(error));
            if (/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(error.name)) safeError.name = error.name;
          }
          throw safeError;
        }
      },
    });
  };
}
