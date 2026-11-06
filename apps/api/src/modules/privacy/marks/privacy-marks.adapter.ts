import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PrivacyMark } from '@iwana/shared';
import { DataSource, EntityManager, In } from 'typeorm';
import { PartyPrivacyMarkEntity } from '../entities/party-privacy-mark.entity';
import { IPrivacyMarksReadPort } from '../ports/privacy-marks-read.port';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

@Injectable()
export class PrivacyMarksAdapter implements IPrivacyMarksReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async activeMarks(
    partyIds: string[],
    ctx?: { manager: EntityManager },
  ): Promise<Record<string, PrivacyMark[]>> {
    const result: Record<string, PrivacyMark[]> = Object.fromEntries(
      partyIds.map((partyId) => [partyId, []]),
    );
    if (partyIds.length === 0) return result;

    // Con contexto se reutiliza la transacción del llamante; sin él la lectura
    // abre su propia transacción tenant, como antes.
    const rows = ctx
      ? await this.loadMarkRows(partyIds, ctx.manager)
      : await withPrivacyTenant(this.dataSource, (manager) => this.loadMarkRows(partyIds, manager));

    const latest = new Map<string, PartyPrivacyMarkEntity>();
    for (const row of rows) {
      if (!latest.has(`${row.partyId}:${row.mark}`)) {
        latest.set(`${row.partyId}:${row.mark}`, row);
      }
    }
    for (const row of latest.values()) {
      if (row.event === 'OPEN') {
        result[row.partyId]?.push(row.mark as PrivacyMark);
      }
    }
    return result;
  }

  async partyIdsWithActiveMark(mark: PrivacyMark): Promise<string[]> {
    const rows = await withPrivacyTenant(this.dataSource, (manager) =>
      this.loadMarkRowsByMark(mark, manager),
    );
    const latest = new Map<string, PartyPrivacyMarkEntity>();
    for (const row of rows) {
      if (!latest.has(`${row.partyId}:${row.mark}`)) {
        latest.set(`${row.partyId}:${row.mark}`, row);
      }
    }
    const blocked: string[] = [];
    for (const row of latest.values()) {
      if (row.event === 'OPEN') {
        blocked.push(row.partyId);
      }
    }
    return blocked;
  }

  /** Lectura de marcas sobre el manager recibido (propio o de la transacción). */
  private loadMarkRows(
    partyIds: string[],
    manager: EntityManager,
  ): Promise<PartyPrivacyMarkEntity[]> {
    return manager.getRepository(PartyPrivacyMarkEntity).find({
      where: { partyId: In(partyIds) },
      order: { occurredAt: 'DESC', id: 'DESC' },
    });
  }

  private loadMarkRowsByMark(
    mark: PrivacyMark,
    manager: EntityManager,
  ): Promise<PartyPrivacyMarkEntity[]> {
    return manager.getRepository(PartyPrivacyMarkEntity).find({
      where: { mark },
      order: { occurredAt: 'DESC', id: 'DESC' },
    });
  }
}
