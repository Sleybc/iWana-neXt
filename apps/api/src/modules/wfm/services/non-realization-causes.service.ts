import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { NonRealizationCause, runInTenantSchema, TenantContext } from '@iwana/db';
import { NonRealizationCauseCategory } from '@iwana/shared';

/**
 * Semillas base de causas de no realización (ADR-077 D1).
 * La migración 103 crea la tabla; este servicio siembra en el primer uso.
 */
export const DEFAULT_NON_REALIZATION_CAUSES: Array<{
  code: string;
  label: string;
  category: NonRealizationCauseCategory;
  requiresEvidence: boolean;
  pausesSla: boolean;
  closesWork: boolean;
}> = [
  {
    code: 'CLIENTE_AUSENTE',
    label: 'Cliente ausente',
    category: NonRealizationCauseCategory.CUSTOMER,
    requiresEvidence: true,
    pausesSla: true,
    closesWork: false,
  },
  {
    code: 'DIRECCION_INCORRECTA',
    label: 'Dirección incorrecta o no encontrada',
    category: NonRealizationCauseCategory.CUSTOMER,
    requiresEvidence: true,
    pausesSla: true,
    closesWork: false,
  },
  {
    code: 'ACCESO_DENEGADO',
    label: 'Acceso denegado al sitio',
    category: NonRealizationCauseCategory.CUSTOMER,
    requiresEvidence: true,
    pausesSla: true,
    closesWork: false,
  },
  {
    code: 'RECHAZO_CLIENTE',
    label: 'Cliente rechazó o pidió aplazar',
    category: NonRealizationCauseCategory.CUSTOMER,
    requiresEvidence: false,
    pausesSla: true,
    closesWork: false,
  },
  {
    code: 'FUERZA_MAYOR_CLIMA',
    label: 'Condiciones climáticas adversas',
    category: NonRealizationCauseCategory.FORCE_MAJEURE,
    requiresEvidence: false,
    pausesSla: true,
    closesWork: false,
  },
  {
    code: 'FUERZA_MAYOR_ORDEN_PUBLICO',
    label: 'Orden público o vía cerrada',
    category: NonRealizationCauseCategory.FORCE_MAJEURE,
    requiresEvidence: false,
    pausesSla: true,
    closesWork: false,
  },
  {
    code: 'FALLA_TECNICA',
    label: 'Falla técnica del equipo',
    category: NonRealizationCauseCategory.OPERATIONAL,
    requiresEvidence: false,
    pausesSla: false,
    closesWork: false,
  },
  {
    code: 'TECNICO_NO_DISPONIBLE',
    label: 'Técnico no disponible',
    category: NonRealizationCauseCategory.OPERATIONAL,
    requiresEvidence: false,
    pausesSla: false,
    closesWork: false,
  },
  {
    code: 'FALTA_MATERIAL',
    label: 'Falta de material o equipo',
    category: NonRealizationCauseCategory.OPERATIONAL,
    requiresEvidence: false,
    pausesSla: false,
    closesWork: false,
  },
  {
    code: 'YA_NO_APLICA',
    label: 'El caso se resolvió por otra vía o el cliente desistió',
    category: NonRealizationCauseCategory.OPERATIONAL,
    requiresEvidence: false,
    pausesSla: false,
    closesWork: true,
  },
];

@Injectable()
export class NonRealizationCausesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Siembra las causas base si el tenant no tiene ninguna registrada.
   * Idempotente: no duplica códigos existentes.
   */
  async seedDefaults(): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existingCount = await qr.manager.count(NonRealizationCause, {
        where: { tenantId, deletedAt: IsNull() },
      });

      if (existingCount > 0) return;

      for (const cause of DEFAULT_NON_REALIZATION_CAUSES) {
        const entity = qr.manager.create(NonRealizationCause, {
          tenantId,
          code: cause.code,
          label: cause.label,
          category: cause.category,
          requiresEvidence: cause.requiresEvidence,
          pausesSla: cause.pausesSla,
          closesWork: cause.closesWork,
          isActive: true,
        });
        await qr.manager.save(NonRealizationCause, entity);
      }
    });
  }

  /** Lista todas las causas activas del tenant. */
  async listActive(): Promise<NonRealizationCause[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return qr.manager.find(NonRealizationCause, {
        where: { tenantId, isActive: true, deletedAt: IsNull() },
        order: { code: 'ASC' as const },
      });
    });
  }

  /** Obtiene una causa por su id. */
  async getById(id: string): Promise<NonRealizationCause> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const cause = await qr.manager.findOne(NonRealizationCause, {
        where: { id, tenantId, deletedAt: IsNull() },
      });

      if (!cause) {
        throw new NotFoundException(`Causa de no realización ${id} no encontrada`);
      }

      return cause;
    });
  }
}
