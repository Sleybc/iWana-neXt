import { Injectable, Logger } from '@nestjs/common';
import { summarizeErrorForLog } from '@iwana/db';
import type { MigrationTenantScope } from '../migration-batches.service';
import { MigrationSourceConnectionService } from '../migration-source-connection.service';
import { UispApiClient } from './uisp-api.client';

export const UISP_PAYMENT_METHODS_PATH = '/crm/api/v1.0/payment-methods';

/** Largo máximo de la etiqueta de un pendiente (`externalLabel`). */
const LABEL_MAX = 120;

/**
 * `GET /crm/api/v1.0/payment-methods` → id → nombre (ADR-110 v1.4 D17). Catálogo sin PII; los
 * elementos sin id o sin nombre de texto se omiten.
 */
export function parseUispPaymentMethods(body: unknown): Map<string, string> {
  const names = new Map<string, string>();
  if (!Array.isArray(body)) return names;
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const { id, name } = item as { id?: unknown; name?: unknown };
    const key = typeof id === 'string' || typeof id === 'number' ? String(id).trim() : '';
    const label = typeof name === 'string' ? name.trim() : '';
    if (key && label) names.set(key, label.slice(0, LABEL_MAX));
  }
  return names;
}

/**
 * Nombres de los métodos de pago de UISP con la conexión de D15. Nunca bloquea la simulación:
 * sin conexión o ante cualquier fallo devuelve un mapa vacío y el pendiente queda sin etiqueta.
 */
@Injectable()
export class UispPaymentMethodNamesService {
  private readonly logger = new Logger(UispPaymentMethodNamesService.name);

  constructor(
    private readonly connections: MigrationSourceConnectionService,
    private readonly client: UispApiClient,
  ) {}

  async load(scope: MigrationTenantScope): Promise<ReadonlyMap<string, string>> {
    try {
      const loaded = await this.connections.load(scope);
      if (!loaded) return new Map();
      return parseUispPaymentMethods(
        await this.client.getJson(loaded.connection, UISP_PAYMENT_METHODS_PATH),
      );
    } catch (error) {
      this.logger.warn(
        `[migration] No se pudieron leer los métodos de pago de UISP (tenant=${scope.tenantId}): ${summarizeErrorForLog(error)}`,
      );
      return new Map();
    }
  }
}
