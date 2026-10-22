import type { NetworkInboxErrorCode } from '@iwana/shared';

export class NetworkActivationListenerError extends Error {
  constructor(
    public readonly code: Extract<
      NetworkInboxErrorCode,
      'CRM_LISTENER_FAILED' | 'INVENTORY_LISTENER_FAILED'
    >,
    options?: ErrorOptions,
  ) {
    super('Falló un listener de activación de aprovisionamiento.', options);
    this.name = 'NetworkActivationListenerError';
  }
}
