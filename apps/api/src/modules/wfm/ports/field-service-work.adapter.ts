import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { VisitRequest } from '@iwana/db';
import { VisitRequestStatus } from '@iwana/shared';
import {
  FieldServiceWorkPort,
  CancelActiveForTicketResult,
} from '../../assurance/ports/field-service-work.port';

/**
 * Adapter WFM que implementa FieldServiceWorkPort.
 *
 * Cancela la visita activa asociada a un ticket cuando este se resuelve
 * o cierra sin necesidad de trabajo de campo (V8 / F4.2).
 *
 * Boundary: MOD10 (Assurance) no conoce las tablas de MOD09 (WFM).
 * Solo conoce la interfaz FieldServiceWorkPort.
 */
@Injectable()
export class FieldServiceWorkAdapter extends FieldServiceWorkPort {
  async cancelActiveForTicket(
    manager: EntityManager,
    tenantId: string,
    ticketId: string,
    reason: string,
    actorUserId: string,
  ): Promise<CancelActiveForTicketResult> {
    // Buscar VisitRequest activa (no terminal) asociada al ticket
    const visitRequest = await manager.findOne(VisitRequest, {
      where: { tenantId, ticketId },
    });

    if (!visitRequest) {
      return { cancelled: false, visitRequestId: null };
    }

    // Si ya está en estado terminal, no hacer nada
    const terminalStatuses: VisitRequestStatus[] = [
      VisitRequestStatus.CANCELLED,
      VisitRequestStatus.REJECTED,
      VisitRequestStatus.CLOSED,
      VisitRequestStatus.EXPIRED,
    ];

    if (terminalStatuses.includes(visitRequest.status)) {
      return { cancelled: false, visitRequestId: visitRequest.id };
    }

    // Si la visita ya está agendada (SCHEDULED), cancelar con advertencia
    // pero aun así proceder (el ticket se resolvió, la visita sobra)
    await manager.update(
      VisitRequest,
      { id: visitRequest.id, tenantId },
      {
        status: VisitRequestStatus.CANCELLED,
        cancelReason: reason,
        cancelledAt: new Date(),
        cancelledByUserId: actorUserId,
      },
    );

    return { cancelled: true, visitRequestId: visitRequest.id };
  }
}
