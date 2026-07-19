import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantStatus, TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import type { ProvisioningJobPayload } from '@iwana/shared';
import { TenantResponseDto } from './dto/tenant.dto';
import { TenantService } from './tenant.service';

// `ProvisioningJobPayload` vive en @iwana/shared: estaba declarado por
// duplicado aquí y en el worker, sin vínculo de compilación entre ambos.
export type { ProvisioningJobPayload };

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
        `Fallo al encolar provisioning para tenant ${payload.tenantId}: ${(error as Error).message}`,
      );

      // Marcar el tenant como fallo de provisioning con cache consistente.
      await this.tenantService.setProvisioningStatus(
        payload.tenantId,
        TenantStatus.PROVISIONING_FAILED,
      );

      throw error;
    }
  }

  /**
   * Reintenta el provisioning de un tenant en estado PROVISIONING_FAILED.
   * Usado por SYSTEM_ADMIN via PATCH /api/v1/tenants/:id/retry-provisioning.
   */
  async retryProvisioning(
    tenantId: string,
    schemaName: string,
    tenantSlug: string,
    adminEmail: string,
  ): Promise<TenantResponseDto> {
    // Limpiar el job fallido previo si existe (evitar duplicados)
    await this.provisioningQueue.remove(`provision-${tenantId}`);

    // Resetear estado a PROVISIONING antes de reencolar, manteniendo cache consistente.
    const tenant = await this.tenantService.setProvisioningStatus(
      tenantId,
      TenantStatus.PROVISIONING,
    );

    await this.enqueue({ tenantId, schemaName, tenantSlug, adminEmail });
    return tenant;
  }
}
