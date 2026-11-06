import { DataAuthorizationView, DataPurpose } from '@iwana/shared';
import type { EntityManager } from 'typeorm';

export interface PrivacyAuthorizationState {
  active: boolean;
  authorizationId: string | null;
  legalTextVersion: string | null;
  legacyUnverified: boolean;
}

export abstract class IPrivacyAuthorizationReadPort {
  /**
   * Autorización vigente para una finalidad.
   *
   * Con `ctx` la lectura reutiliza la conexión de la transacción del llamante.
   * Sin `ctx` abre su propia transacción, como antes.
   */
  abstract hasActive(
    partyId: string,
    purpose: DataPurpose,
    ctx?: { manager: EntityManager },
  ): Promise<PrivacyAuthorizationState>;

  abstract listForParty(partyId: string): Promise<DataAuthorizationView[]>;
}
