import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema, TicketPqrRecord } from '@iwana/db';
import { PqrDeadlineType } from '@iwana/shared';

@Injectable()
export class PqrService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Crea el registro PQR de respuesta inicial para un ticket de tipo PQR.
   * Se invoca dentro de la misma transaccion que crea el ticket.
   */
  async createInitialPqrRecord(
    manager: EntityManager,
    ticketId: string,
    tenantId: string,
    deadlineAt: Date,
  ): Promise<TicketPqrRecord> {
    const record = manager.create(TicketPqrRecord, {
      ticketId,
      tenantId,
      pqrNumber: null,
      deadlineType: PqrDeadlineType.INITIAL_RESPONSE,
      deadlineAt,
      notifiedAt: null,
      resolvedAt: null,
      notes: null,
    });

    return manager.save(TicketPqrRecord, record);
  }

  /** Lista los registros PQR de un ticket. */
  async listPqrRecords(ticketId: string): Promise<TicketPqrRecord[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return qr.manager
        .createQueryBuilder(TicketPqrRecord, 'pqr')
        .where('pqr.ticket_id = :ticketId', { ticketId })
        .andWhere('pqr.tenant_id = :tenantId', { tenantId })
        .orderBy('pqr.created_at', 'ASC')
        .getMany();
    });
  }

  /**
   * Verifica si el registro regulatorio PQR está completo.
   * Completo = existe al menos un registro PQR con `resolvedAt` no nulo.
   */
  async isPqrRecordComplete(
    manager: EntityManager,
    ticketId: string,
    tenantId: string,
  ): Promise<boolean> {
    const records = await manager
      .createQueryBuilder(TicketPqrRecord, 'pqr')
      .where('pqr.ticket_id = :ticketId', { ticketId })
      .andWhere('pqr.tenant_id = :tenantId', { tenantId })
      .getMany();

    return records.length > 0 && records.some((rec) => rec.resolvedAt !== null);
  }
}
