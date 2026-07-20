import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AUDIT_EXPORT_MAX_ROWS, buildAuditCsv, buildCreatedAtFilter } from './audit-export.helper';

describe('audit-export.helper', () => {
  describe('buildCreatedAtFilter', () => {
    it('retorna undefined sin fechas', () => {
      expect(buildCreatedAtFilter()).toBeUndefined();
    });

    it('usa Between cuando hay fromDate y toDate', () => {
      const filter = buildCreatedAtFilter('2026-01-01T00:00:00.000Z', '2026-06-30T23:59:59.999Z');
      expect(filter).toEqual(
        Between(new Date('2026-01-01T00:00:00.000Z'), new Date('2026-06-30T23:59:59.999Z')),
      );
    });

    it('usa MoreThanOrEqual solo con fromDate', () => {
      expect(buildCreatedAtFilter('2026-01-01T00:00:00.000Z')).toEqual(
        MoreThanOrEqual(new Date('2026-01-01T00:00:00.000Z')),
      );
    });

    it('usa LessThanOrEqual solo con toDate', () => {
      expect(buildCreatedAtFilter(undefined, '2026-06-30T23:59:59.999Z')).toEqual(
        LessThanOrEqual(new Date('2026-06-30T23:59:59.999Z')),
      );
    });
  });

  describe('buildAuditCsv', () => {
    it('incluye headers en español y escapa comillas', () => {
      const csv = buildAuditCsv([
        {
          createdAt: new Date('2026-04-30T12:00:00.000Z'),
          action: 'UPDATE',
          entityType: 'User',
          entityId: 'e-1',
          actorLabel: 'Ana "Ops"',
          ipAddress: '10.0.0.1',
          requestId: 'req-1',
        },
      ]);

      expect(csv).toContain(
        '"Fecha","Acción","Entidad","ID de entidad","Actor","IP","ID de solicitud"',
      );
      expect(csv).toContain('"Ana ""Ops"""');
      expect(csv).not.toContain('Export limitado');
    });

    it('añade fila de comentario cuando truncated', () => {
      const csv = buildAuditCsv([], { truncated: true, maxRows: AUDIT_EXPORT_MAX_ROWS });
      expect(csv.startsWith('"Export limitado a 5000 registros"')).toBe(true);
    });
  });
});
