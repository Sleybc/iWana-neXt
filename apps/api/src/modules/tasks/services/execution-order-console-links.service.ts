import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  AccessPermissionKey,
  type ExecutionOrderSourceTicketLink,
  type ExecutionOrderSubscriberLink,
  type ExecutionOrderVisitLink,
} from '@iwana/shared';
import { TenantContext, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { AssuranceTicketReferenceReadPort } from '../../assurance/ports/assurance-ticket-reference-read.port';

/** Datos de la OT que la consola necesita para sus enlaces; todos son columnas propias de MOD11. */
export interface ExecutionOrderConsoleLinkSource {
  subscriberId: string | null;
  ticketId: string | null;
  scheduleEventId: string | null;
  serviceAddress: string | null;
  municipality: string | null;
}

export interface ExecutionOrderConsoleLinks {
  subscriber: ExecutionOrderSubscriberLink | null;
  sourceTicket: ExecutionOrderSourceTicketLink | null;
  visit: ExecutionOrderVisitLink | null;
}

const NO_LINKS: ExecutionOrderConsoleLinks = { subscriber: null, sourceTicket: null, visit: null };

/**
 * Enlaces y cliente de la cabecera de la consola de la OT (contrato v1.8, spec
 * 2026-11-18 §3 G–H y §4). Regla de nulo del detalle del ticket (MOD10):
 * - suscriptor: `crm.subscribers.read` y titular AVAILABLE según CRM (bloqueo y
 *   supresión los decide CRM, sin excepción por permiso);
 * - ticket: `assurance.tickets.read` y ticket existente en el tenant;
 * - visita: `wfm.schedule.read` y evento de agenda en la OT.
 * Cada lectura ajena va por el puerto público del módulo dueño, con el `qr` de
 * una sola transacción y en su propio SAVEPOINT: un fallo anula solo su enlace
 * (fail-closed) y nunca convierte el detalle en error.
 */
@Injectable()
export class ExecutionOrderConsoleLinksService {
  private readonly logger = new Logger(ExecutionOrderConsoleLinksService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly effectivePermissionsService?: EffectivePermissionsService,
    @Optional() private readonly crmSubscriberReadPort?: CrmSubscriberReadPort,
    @Optional() private readonly ticketReferenceReadPort?: AssuranceTicketReferenceReadPort,
  ) {}

  async resolve(
    order: ExecutionOrderConsoleLinkSource,
    actor: Pick<JwtPayload, 'sub'>,
  ): Promise<ExecutionOrderConsoleLinks> {
    let permissions: ReadonlySet<string>;
    try {
      if (!this.effectivePermissionsService) return NO_LINKS;
      permissions = new Set(
        await this.effectivePermissionsService.getEffectivePermissionsForUser(actor.sub),
      );
    } catch (error) {
      this.logger.warn(
        `Permisos no verificados para los enlaces de la OT: ${summarizeErrorForLog(error)}`,
      );
      return NO_LINKS;
    }

    const visit: ExecutionOrderVisitLink | null =
      order.scheduleEventId && permissions.has(AccessPermissionKey.WFM_SCHEDULE_READ)
        ? { scheduleEventId: order.scheduleEventId }
        : null;

    const wantsSubscriber =
      Boolean(order.subscriberId) &&
      Boolean(this.crmSubscriberReadPort) &&
      permissions.has(AccessPermissionKey.CRM_SUBSCRIBERS_READ);
    const wantsTicket =
      Boolean(order.ticketId) &&
      Boolean(this.ticketReferenceReadPort) &&
      permissions.has(AccessPermissionKey.ASSURANCE_TICKETS_READ);
    if (!wantsSubscriber && !wantsTicket) {
      return { subscriber: null, sourceTicket: null, visit };
    }

    try {
      const { schemaName } = TenantContext.getOrThrow();
      const { subscriber, sourceTicket } = await runInTenantSchema(
        this.dataSource,
        schemaName,
        async (qr) => ({
          subscriber: wantsSubscriber ? await this.resolveSubscriber(order, qr) : null,
          sourceTicket: wantsTicket ? await this.resolveTicket(order.ticketId!, qr) : null,
        }),
      );
      return { subscriber, sourceTicket, visit };
    } catch (error) {
      // Fallo al abrir o cerrar la transacción: los enlaces son enriquecimiento,
      // nunca convierten el detalle en error (fail-closed).
      this.logger.warn(
        `Transacción de enlaces de la OT no disponible (fail-closed): ${summarizeErrorForLog(error)}`,
      );
      return { subscriber: null, sourceTicket: null, visit };
    }
  }

  private async resolveSubscriber(
    order: ExecutionOrderConsoleLinkSource,
    qr: QueryRunner,
  ): Promise<ExecutionOrderSubscriberLink | null> {
    const snapshots = await this.inSavepoint(qr, 'eo_console_subscriber', () =>
      this.crmSubscriberReadPort!.resolveTicketParties(
        [{ type: 'SUBSCRIBER', id: order.subscriberId! }],
        qr,
      ),
    );
    const match = snapshots?.find((item) => item.type === 'SUBSCRIBER');
    if (!match || match.state !== 'AVAILABLE' || match.profile?.kind !== 'SUBSCRIBER') {
      return null;
    }
    return {
      id: match.profile.id,
      displayName: match.displayName,
      serviceAddress: order.serviceAddress,
      municipality: order.municipality,
    };
  }

  private async resolveTicket(
    ticketId: string,
    qr: QueryRunner,
  ): Promise<ExecutionOrderSourceTicketLink | null> {
    return (
      (await this.inSavepoint(qr, 'eo_console_ticket', () =>
        this.ticketReferenceReadPort!.findTicketReference(ticketId, qr),
      )) ?? null
    );
  }

  private async inSavepoint<T>(
    qr: QueryRunner,
    name: string,
    work: () => Promise<T>,
  ): Promise<T | null> {
    await qr.query(`SAVEPOINT ${name}`);
    try {
      const result = await work();
      await qr.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await qr.query(`ROLLBACK TO SAVEPOINT ${name}`);
      // Solo clase y sqlstate: ni nombre, ni dirección, ni referencia del titular.
      this.logger.warn(
        `Enlace ${name} no verificado (fail-closed): ${summarizeErrorForLog(error)}`,
      );
      return null;
    }
  }
}
