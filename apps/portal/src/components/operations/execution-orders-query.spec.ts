// apps/portal/src/components/operations/execution-orders-query.spec.ts
// Funciones puras de URL ⇄ `ListExecutionOrdersQuery` (spec 2026-09-13 §4.5;
// contrato congelado `execution-orders-list.ts` v1; ADR-065 §9). Cubre CA-04
// (estado de bandeja en la URL: Atrás vuelve a la página anterior) en su capa
// de serialización y la validación de fecha-only del rango de ventana (§7.2 H5).
import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import { parseExecutionOrdersQuery, serializeExecutionOrdersQuery } from './execution-orders-query';

describe('execution-orders-query', () => {
  describe('parseExecutionOrdersQuery', () => {
    it('lee página, tamaño, filtros y trazabilidad desde la URL', () => {
      const query = parseExecutionOrdersQuery(
        new URLSearchParams({
          status: ExecutionOrderStatus.ASSIGNED,
          result: ExecutionOrderResult.EXECUTED,
          workType: WfmWorkType.INSTALLATION,
          assigneeId: '88888888-8888-4888-8888-888888888888',
          organizationSiteId: '99999999-9999-4999-8999-999999999999',
          ticketId: 'TCK-0009',
          taskId: 'task-009',
          visitRequestId: '11111111-1111-4111-8111-111111111111',
          windowFrom: '2026-09-01',
          windowTo: '2026-09-30',
          page: '2',
          limit: '50',
        }),
      );

      expect(query).toEqual({
        status: ExecutionOrderStatus.ASSIGNED,
        result: ExecutionOrderResult.EXECUTED,
        workType: WfmWorkType.INSTALLATION,
        assigneeId: '88888888-8888-4888-8888-888888888888',
        organizationSiteId: '99999999-9999-4999-8999-999999999999',
        ticketId: 'TCK-0009',
        taskId: 'task-009',
        visitRequestId: '11111111-1111-4111-8111-111111111111',
        windowFrom: '2026-09-01',
        windowTo: '2026-09-30',
        page: 2,
        limit: 50,
      });
    });

    it('descarta enums, fechas y enteros inválidos sin llegar al API', () => {
      const query = parseExecutionOrdersQuery(
        new URLSearchParams({
          status: 'INVENTADO',
          result: 'TAMPOCO',
          workType: 'NO_ES_UN_TIPO',
          windowFrom: '01/09/2026',
          windowTo: '2026-9-3',
          page: '0',
          limit: '-20',
        }),
      );

      expect(query).toEqual({});
    });

    it('recorta texto y descarta valores vacíos', () => {
      const query = parseExecutionOrdersQuery(
        new URLSearchParams({ assigneeId: '  tech-001  ', ticketId: '   ' }),
      );

      expect(query.assigneeId).toBe('tech-001');
      expect(Object.keys(query)).not.toContain('ticketId');
    });

    it('sin parámetros devuelve una query vacía', () => {
      expect(parseExecutionOrdersQuery(new URLSearchParams())).toEqual({});
    });
  });

  describe('serializeExecutionOrdersQuery', () => {
    it('omite página 1 y tamaño default 20 (URL mínima)', () => {
      expect(
        serializeExecutionOrdersQuery({
          page: 1,
          limit: 20,
          status: ExecutionOrderStatus.ASSIGNED,
        }),
      ).toBe('status=ASSIGNED');
    });

    it('serializa página y tamaño no default junto al resto del estado', () => {
      const serialized = serializeExecutionOrdersQuery({
        workType: WfmWorkType.SUPPORT,
        windowFrom: '2026-09-01',
        page: 3,
        limit: 50,
      });

      expect(serialized).toBe('workType=SUPPORT&windowFrom=2026-09-01&page=3&limit=50');
    });

    it('elimina claves con undefined explícito (limpiar filtros reinicia página)', () => {
      const serialized = serializeExecutionOrdersQuery({
        status: undefined,
        result: undefined,
        workType: undefined,
        assigneeId: undefined,
        organizationSiteId: undefined,
        windowFrom: undefined,
        windowTo: undefined,
        page: undefined,
      });

      expect(serialized).toBe('');
    });

    it('round-trip: parsear lo serializado devuelve la misma query', () => {
      const source = {
        status: ExecutionOrderStatus.IN_PROGRESS,
        result: ExecutionOrderResult.REQUIRES_FOLLOW_UP,
        workType: WfmWorkType.MAINTENANCE,
        assigneeId: '88888888-8888-4888-8888-888888888888',
        ticketId: 'TCK-0010',
        windowTo: '2026-09-30',
        page: 5,
        limit: 50,
      };

      const parsed = parseExecutionOrdersQuery(
        new URLSearchParams(serializeExecutionOrdersQuery(source)),
      );
      expect(parsed).toEqual(source);
    });
  });
});
