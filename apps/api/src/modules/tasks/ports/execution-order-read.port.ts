/** Puerto tipado de lectura de MOD11 consumido por otros módulos. */
export const EXECUTION_ORDER_READ_PORT = Symbol('EXECUTION_ORDER_READ_PORT');

export interface ExecutionOrderReadPort {
  /** Indica si el suscriptor tiene una OT de retiro abierta en su tenant actual. */
  hasOpenWithdrawalOrders(subscriberId: string): Promise<boolean>;
}
