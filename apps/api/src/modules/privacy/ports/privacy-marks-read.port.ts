import { PrivacyMark } from '@iwana/shared';
import type { EntityManager } from 'typeorm';

export abstract class IPrivacyMarksReadPort {
  /**
   * Marcas vigentes por Party.
   *
   * Con `ctx` la lectura reutiliza la conexión de la transacción del llamante
   * (misma conexión, mismo tenant). Sin `ctx` abre su propia transacción con
   * `SET LOCAL search_path`, como antes.
   */
  abstract activeMarks(
    partyIds: string[],
    ctx?: { manager: EntityManager },
  ): Promise<Record<string, PrivacyMark[]>>;
  abstract partyIdsWithActiveMark(mark: PrivacyMark): Promise<string[]>;
}
