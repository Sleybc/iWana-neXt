import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction, SubscriberStatus } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { Subscriber } from './entities/subscriber.entity';
import { hasRealContact } from './subscriber-contact.util';
import { SubscriberFiscalCompletenessService } from './subscriber-fiscal-completeness.service';

/**
 * Transiciones permitidas del ciclo de vida del suscriptor.
 *
 * LEAD → PROSPECT (requiere: documento, nombre y al menos un contacto)
 * PROSPECT → ACTIVE (requiere: evento de activación)
 * ACTIVE → SUSPENDED (requiere: motivo)
 * SUSPENDED → ACTIVE (requiere: motivo)
 * ACTIVE → CANCELLED (requiere: motivo)
 * Cualquier estado → CANCELLED (requiere: motivo)
 * CANCELLED es terminal (sin retorno)
 */
const ALLOWED_TRANSITIONS: Map<SubscriberStatus, Set<SubscriberStatus>> = new Map([
  [SubscriberStatus.LEAD, new Set([SubscriberStatus.PROSPECT, SubscriberStatus.CANCELLED])],
  [SubscriberStatus.PROSPECT, new Set([SubscriberStatus.ACTIVE, SubscriberStatus.CANCELLED])],
  [SubscriberStatus.ACTIVE, new Set([SubscriberStatus.SUSPENDED, SubscriberStatus.CANCELLED])],
  [SubscriberStatus.SUSPENDED, new Set([SubscriberStatus.ACTIVE, SubscriberStatus.CANCELLED])],
  [SubscriberStatus.CANCELLED, new Set()],
]);

/**
 * Campos mínimos requeridos para cada transición.
 */
const TRANSITION_REQUIREMENTS: Record<string, { fields: string[]; description: string }> = {
  [`${SubscriberStatus.LEAD}->${SubscriberStatus.PROSPECT}`]: {
    fields: ['documentType', 'documentNumberEncrypted', 'firstName', 'lastName'],
    description:
      'Documento, nombre completo y un contacto son obligatorios para calificar como prospecto',
  },
  [`${SubscriberStatus.PROSPECT}->${SubscriberStatus.ACTIVE}`]: {
    fields: [],
    description: 'Se requiere evento de activación (ej. expediente CLIENTE_ACTIVO)',
  },
  [`${SubscriberStatus.ACTIVE}->${SubscriberStatus.SUSPENDED}`]: {
    fields: [],
    description: 'Se requiere motivo de suspensión',
  },
  [`${SubscriberStatus.SUSPENDED}->${SubscriberStatus.ACTIVE}`]: {
    fields: [],
    description: 'Se requiere motivo de reactivación',
  },
  [`${SubscriberStatus.ACTIVE}->${SubscriberStatus.CANCELLED}`]: {
    fields: [],
    description: 'Se requiere motivo de cancelación',
  },
};

export interface TransitionResult {
  fromStatus: SubscriberStatus;
  toStatus: SubscriberStatus;
  reason: string | null;
}

@Injectable()
export class SubscriberStatusTransitionService {
  private readonly logger = new Logger(SubscriberStatusTransitionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly fiscalCompletenessService: SubscriberFiscalCompletenessService,
  ) {}

  /**
   * Valida si una transición es permitida según la máquina de estados.
   */
  canTransition(from: SubscriberStatus, to: SubscriberStatus): boolean {
    const allowed = ALLOWED_TRANSITIONS.get(from);
    if (!allowed) return false;
    return allowed.has(to);
  }

  /**
   * Valida que los campos mínimos estén presentes para la transición.
   * Retorna array de errores. Vacío = válido.
   */
  validateTransitionRequirements(subscriber: Subscriber, targetStatus: SubscriberStatus): string[] {
    const key = `${subscriber.status}->${targetStatus}`;
    const requirement = TRANSITION_REQUIREMENTS[key];

    if (!requirement) {
      // Transición sin requisitos explícitos de campos
      return [];
    }

    const errors: string[] = [];
    for (const field of requirement.fields) {
      const value = (subscriber as unknown as Record<string, unknown>)[field];
      if (value === null || value === undefined || value === '') {
        errors.push(`Campo obligatorio faltante: ${field}`);
      }
    }

    if (
      subscriber.status === SubscriberStatus.LEAD &&
      targetStatus === SubscriberStatus.PROSPECT &&
      !hasRealContact(subscriber)
    ) {
      errors.push('Debe registrar al menos un teléfono o un correo');
    }

    return errors;
  }

  /**
   * Ejecuta una transición de estado con validación completa.
   * Persiste el cambio y retorna el resultado.
   */
  async transition(
    subscriberId: string,
    targetStatus: SubscriberStatus,
    reason: string | null,
    actorId: string,
  ): Promise<TransitionResult> {
    const { schemaName } = TenantContext.getOrThrow();

    // Cargar subscriber actual
    const subscriber = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Subscriber, { where: { id: subscriberId } }),
    );

    if (!subscriber) {
      throw new BadRequestException(`Suscriptor ${subscriberId} no encontrado`);
    }

    const fromStatus = subscriber.status;

    // No-op si ya está en el estado destino
    if (fromStatus === targetStatus) {
      return { fromStatus, toStatus: targetStatus, reason };
    }

    // Validar transición permitida
    if (!this.canTransition(fromStatus, targetStatus)) {
      throw new BadRequestException(
        `Transición no permitida: ${fromStatus} → ${targetStatus}. ` +
          `Estados permitidos desde ${fromStatus}: ${[...(ALLOWED_TRANSITIONS.get(fromStatus) || [])].join(', ')}`,
      );
    }

    if (targetStatus === SubscriberStatus.ACTIVE) {
      this.fiscalCompletenessService.assertComplete(subscriber);
    }

    if (targetStatus === SubscriberStatus.ACTIVE && !hasRealContact(subscriber)) {
      throw new UnprocessableEntityException({
        code: 'SUBSCRIBER_CONTACT_REQUIRED',
        message:
          'Para activar el servicio, registra al menos un teléfono o un correo del suscriptor.',
      });
    }

    // Validar campos mínimos para la transición
    const fieldErrors = this.validateTransitionRequirements(subscriber, targetStatus);
    if (fieldErrors.length > 0) {
      throw new BadRequestException({
        code: 'TRANSITION_REQUIREMENTS_NOT_MET',
        message: `No se puede transicionar a ${targetStatus}. ${fieldErrors.join('. ')}`,
        errors: fieldErrors,
      });
    }

    // Validar motivo para ciertas transiciones
    if (
      (targetStatus === SubscriberStatus.SUSPENDED ||
        targetStatus === SubscriberStatus.CANCELLED) &&
      !reason?.trim()
    ) {
      throw new BadRequestException(
        `Se requiere motivo para la transición ${fromStatus} → ${targetStatus}`,
      );
    }

    // Persistir cambio de estado
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(Subscriber, { id: subscriberId }, { status: targetStatus });
    });

    // GSEC-01: audit manual mínimo (handler con @SkipAudit). Sin PII.
    const reasonIsPrivate =
      fromStatus === SubscriberStatus.LEAD && targetStatus === SubscriberStatus.PROSPECT;
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Subscriber',
      entityId: subscriberId,
      userId: actorId,
      newValue: {
        fromStatus,
        toStatus: targetStatus,
        ...(!reasonIsPrivate ? { reason } : {}),
      },
    });

    const reasonSuffix = !reasonIsPrivate && reason ? ` (${reason})` : '';
    this.logger.log(
      `Suscriptor ${subscriberId}: ${fromStatus} → ${targetStatus}${reasonSuffix} [actor: ${actorId}]`,
    );

    return { fromStatus, toStatus: targetStatus, reason };
  }

  /**
   * Única excepción a CANCELLED terminal: restaurar un prospecto cancelado
   * por el descarte de su mismo expediente. No se expone como transición general.
   */
  async reactivateFromExpediente(
    subscriberId: string,
    expedienteId: string,
    actorId: string,
  ): Promise<TransitionResult> {
    const { schemaName } = TenantContext.getOrThrow();
    const subscriber = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Subscriber, { where: { id: subscriberId } }),
    );

    if (!subscriber || subscriber.expedienteId !== expedienteId) {
      throw new BadRequestException('El suscriptor no pertenece al expediente reactivado.');
    }
    if (subscriber.activatedAt !== null && subscriber.activatedAt !== undefined) {
      throw new BadRequestException(
        'Un suscriptor previamente activado no puede restaurarse desde su expediente.',
      );
    }
    if (subscriber.status === SubscriberStatus.PROSPECT) {
      return {
        fromStatus: SubscriberStatus.PROSPECT,
        toStatus: SubscriberStatus.PROSPECT,
        reason: 'EXPEDIENTE_REACTIVATED',
      };
    }
    if (subscriber.status !== SubscriberStatus.CANCELLED) {
      throw new BadRequestException(
        'Solo un suscriptor cancelado puede restaurarse como prospecto.',
      );
    }

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.update(
        Subscriber,
        {
          id: subscriberId,
          expedienteId,
          status: SubscriberStatus.CANCELLED,
          activatedAt: IsNull(),
        },
        { status: SubscriberStatus.PROSPECT },
      ),
    );
    if (result.affected !== 1) {
      const current = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
        qr.manager.findOne(Subscriber, { where: { id: subscriberId, expedienteId } }),
      );
      if (current?.status === SubscriberStatus.PROSPECT) {
        return {
          fromStatus: SubscriberStatus.PROSPECT,
          toStatus: SubscriberStatus.PROSPECT,
          reason: 'EXPEDIENTE_REACTIVATED',
        };
      }
      throw new BadRequestException('No se pudo restaurar el suscriptor del expediente.');
    }

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Subscriber',
      entityId: subscriberId,
      userId: actorId,
      newValue: {
        fromStatus: SubscriberStatus.CANCELLED,
        toStatus: SubscriberStatus.PROSPECT,
        reason: 'EXPEDIENTE_REACTIVATED',
        expedienteId,
      },
    });
    this.logger.log(
      `Suscriptor ${subscriberId}: CANCELLED → PROSPECT por reactivación del expediente`,
    );

    return {
      fromStatus: SubscriberStatus.CANCELLED,
      toStatus: SubscriberStatus.PROSPECT,
      reason: 'EXPEDIENTE_REACTIVATED',
    };
  }

  /**
   * Retorna las transiciones permitidas desde un estado dado.
   */
  getAllowedTransitions(currentStatus: SubscriberStatus): SubscriberStatus[] {
    const allowed = ALLOWED_TRANSITIONS.get(currentStatus);
    return allowed ? [...allowed] : [];
  }
}
