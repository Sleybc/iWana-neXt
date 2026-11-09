import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { summarizeErrorForLog } from '@iwana/db';
import { TenantStatus, TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import type { ProvisioningJobPayload } from '@iwana/shared';
import { TenantResponseDto } from './dto/tenant.dto';
import { TenantService } from './tenant.service';
import { RETRYABLE_TENANT_STATUSES, TENANT_ERROR_CODES } from './tenant-status-transitions';

// `ProvisioningJobPayload` vive en @iwana/shared: estaba declarado por
// duplicado aquí y en el worker, sin vínculo de compilación entre ambos.
export type { ProvisioningJobPayload };

function notRetryable(): ConflictException {
  return new ConflictException({
    code: TENANT_ERROR_CODES.TENANT_NOT_RETRYABLE,
    message: 'El estado actual de la empresa no permite reintentar el aprovisionamiento.',
  });
}

function isStatusTransitionConflict(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { code?: unknown }).code ===
      TENANT_ERROR_CODES.TENANT_STATUS_TRANSITION_NOT_ALLOWED
  );
}

/**
 * Servicio de provisioning de schemas de tenant.
 *
 * Responsabilidad: encolar el job de provisioning en BullMQ cuando se crea un tenant.
 * El procesamiento real lo ejecuta TenantProvisioningProcessor (apps/worker).
 *
 * Flujo de provisioning (HLD Seccion 1 @iwana/tenant):
 * 1. TenantService.create() → guarda tenant con status=PROVISIONING en DB
 * 2. TenantService.create() → llama a TenantProvisioningService.enqueue()
 * 3. TenantProvisioningService.enqueue() → encola job en BullMQ con tenantId + schemaName
 * 4. Worker (apps/worker) lee tenant_template.sql, reemplaza __SCHEMA_NAME__, ejecuta DDL
 * 5. Worker → actualiza tenant.status → ACTIVE (exito) o PROVISIONING_FAILED (falla)
 *
 * NOTA RISK R3: el worker NO puede usar TenantContext.getOrThrow() porque
 * AsyncLocalStorage no propaga entre procesos. El worker opera con los datos
 * del job payload exclusivamente.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/tenant)
 * ADR-017: Multi-tenant schema-per-tenant isolation (tenant_template.sql)
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    @InjectQueue(TENANT_PROVISIONING_QUEUE)
    private readonly provisioningQueue: Queue<ProvisioningJobPayload>,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Encola el job de provisioning del schema PostgreSQL del tenant.
   *
   * El job incluye: tenantId, schemaName y slug para que el worker
   * pueda operar sin depender de TenantContext.
   *
   * Si la encolacion falla, actualiza el estado del tenant a PROVISIONING_FAILED
   * para que SYSTEM_ADMIN pueda detectar y reintentar.
   */
  async enqueue(payload: ProvisioningJobPayload): Promise<void> {
    try {
      await this.provisioningQueue.add('provision-schema', payload, {
        // 3 reintentos con backoff exponencial
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // El job expira si no se procesa en 30 minutos
        removeOnComplete: { age: 24 * 3600 }, // conservar por 24h para auditoría
        removeOnFail: false, // conservar jobs fallidos para diagnostico
        jobId: `provision-${payload.tenantId}`, // idempotencia: no duplicar jobs
      });

      this.logger.log(
        `Job de provisioning encolado para tenant ${payload.tenantSlug} (${payload.tenantId})`,
      );
    } catch (error) {
      this.logger.error(
        `Fallo al encolar provisioning para tenant ${payload.tenantId}: ${summarizeErrorForLog(error)}`,
      );

      // Marcar el tenant como fallo de provisioning con cache consistente.
      // DT-4 v1.1: el cambio es condicional (solo desde PROVISIONING). Si el
      // tenant ya no está en PROVISIONING (p. ej. lo borraron) no se toca, y el
      // error que se propaga sigue siendo el del encolado, no el 409.
      try {
        await this.tenantService.setProvisioningStatus(
          payload.tenantId,
          TenantStatus.PROVISIONING_FAILED,
        );
      } catch (statusError) {
        this.logger.warn(
          `No se marco PROVISIONING_FAILED para tenant ${payload.tenantId}: ${summarizeErrorForLog(statusError)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Reintenta el provisioning de un tenant en estado PROVISIONING o PROVISIONING_FAILED.
   * Usado por SYSTEM_ADMIN via PATCH /api/v1/tenants/:id/retry-provisioning.
   *
   * DT-4 v1.1 §8.2:
   * - Cualquier otro estado → 409 `TENANT_NOT_RETRYABLE`, antes de tocar la cola
   *   o el estado (un tenant marcado nunca vuelve a aprovisionarse por aquí).
   * - Job en curso → 409 `TENANT_PROVISIONING_IN_PROGRESS`, sin reencolar ni
   *   cambiar el estado. En bullmq 5.71 `Queue.remove` NO rechaza con un job
   *   activo: el script `removeJob` devuelve 0 si el job tiene lock (`isLocked`)
   *   y 1 si lo retiró o no existía; solo lanza para jobs de un scheduler (-8).
   * - La guarda inicial lee el estado sin caché, pero la garantía real es el
   *   UPDATE condicional de `setProvisioningStatus(PROVISIONING)` tras `remove` y
   *   antes de `add`: si un DELETE (u otro cambio) llegó en medio, falla, se
   *   responde 409 `TENANT_NOT_RETRYABLE` y no se reencola.
   */
  async retryProvisioning(
    tenantId: string,
    schemaName: string,
    tenantSlug: string,
    adminEmail: string,
  ): Promise<TenantResponseDto> {
    // El estado se lee aquí, de la base y no de la caché, y no se recibe del
    // llamador: la guarda no depende de que cada ruta lo pase bien.
    const currentStatus = await this.tenantService.getCurrentStatus(tenantId);
    if (!RETRYABLE_TENANT_STATUSES.includes(currentStatus)) {
      throw notRetryable();
    }

    // Limpiar el job previo si existe (evitar duplicados). 0 = job bloqueado por
    // el worker (activo): no se reencola para no aprovisionar dos veces.
    const removed = await this.provisioningQueue.remove(`provision-${tenantId}`);
    if (removed === 0) {
      throw new ConflictException({
        code: TENANT_ERROR_CODES.TENANT_PROVISIONING_IN_PROGRESS,
        message: 'El aprovisionamiento de la empresa ya está en curso.',
      });
    }

    // Resetear estado a PROVISIONING antes de reencolar, manteniendo cache
    // consistente. Es un compare-and-set: si el estado cambió desde la guarda,
    // 409 TENANT_NOT_RETRYABLE y no hay add.
    let tenant: TenantResponseDto;
    try {
      tenant = await this.tenantService.setProvisioningStatus(tenantId, TenantStatus.PROVISIONING);
    } catch (error) {
      if (isStatusTransitionConflict(error)) throw notRetryable();
      throw error;
    }

    await this.enqueue({ tenantId, schemaName, tenantSlug, adminEmail });
    return tenant;
  }
}
