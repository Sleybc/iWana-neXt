import { useExecutionOrderConsoleAdapter } from './use-execution-order-console-adapter';

/** Fachada pública estable de la consola de OT. */
export function useExecutionOrderConsole() {
  return useExecutionOrderConsoleAdapter();
}
