// apps/portal/src/components/operations/tasks-query.spec.ts
// Funciones puras de URL ⇄ `ListOperationalTasksParams` (spec 2026-09-13 §4.5;
// ADR-065 §9: estado de bandeja — página, tamaño, filtros y detalle — en la URL).
// Cubre CA-04 (Atrás restaura el estado) y CA-09 (filtros por tipo, responsable
// y ticket) en su capa de serialización.
import { TaskStatus, TaskType } from '@iwana/shared';
import { parseTasksInboxQuery, serializeTasksInboxQuery } from './tasks-query';

describe('tasks-query', () => {
  describe('parseTasksInboxQuery', () => {
    it('lee página, tamaño, filtros y detalle desde la URL', () => {
      const query = parseTasksInboxQuery(
        new URLSearchParams({
          status: TaskStatus.IN_PROGRESS,
          type: TaskType.FIELD_VISIT,
          responsibleRefId: 'user-001',
          ticketId: 'TCK-0001',
          page: '3',
          limit: '50',
          taskId: 'task-001',
        }),
      );

      expect(query).toEqual({
        status: TaskStatus.IN_PROGRESS,
        type: TaskType.FIELD_VISIT,
        responsibleRefId: 'user-001',
        ticketId: 'TCK-0001',
        page: 3,
        limit: 50,
        taskId: 'task-001',
      });
    });

    it('ignora enums fuera del contrato y no los propaga al API', () => {
      const query = parseTasksInboxQuery(
        new URLSearchParams({ status: 'NO_EXISTE', type: 'TAMPOCO' }),
      );

      expect(query.status).toBeUndefined();
      expect(query.type).toBeUndefined();
    });

    it('ignora enteros no positivos o no numéricos de página y tamaño', () => {
      const query = parseTasksInboxQuery(new URLSearchParams({ page: '0', limit: '-4' }));
      expect(query.page).toBeUndefined();
      expect(query.limit).toBeUndefined();

      const another = parseTasksInboxQuery(new URLSearchParams({ page: 'dos', limit: 'muchos' }));
      expect(another.page).toBeUndefined();
      expect(another.limit).toBeUndefined();
    });

    it('recorta texto y descarta valores vacíos (claves ausentes, no undefined)', () => {
      const query = parseTasksInboxQuery(
        new URLSearchParams({ responsibleRefId: '  user-002  ', ticketId: '   ' }),
      );

      expect(query.responsibleRefId).toBe('user-002');
      expect(Object.keys(query)).not.toContain('ticketId');
    });

    it('sin parámetros devuelve una query vacía (defaults quedan al API)', () => {
      expect(parseTasksInboxQuery(new URLSearchParams())).toEqual({});
    });
  });

  describe('serializeTasksInboxQuery', () => {
    it('omite página 1 y tamaño default 20 de la URL', () => {
      expect(serializeTasksInboxQuery({ page: 1, limit: 20, status: TaskStatus.OPEN })).toBe(
        'status=OPEN',
      );
    });

    it('serializa página y tamaño cuando difieren del default', () => {
      expect(serializeTasksInboxQuery({ page: 2, limit: 50 })).toBe('page=2&limit=50');
    });

    it('preserva el detalle abierto (`taskId`) y los filtros activos', () => {
      const serialized = serializeTasksInboxQuery({
        status: TaskStatus.BLOCKED,
        type: TaskType.COLLECTION,
        responsibleRefId: 'user-003',
        ticketId: 'TCK-0002',
        page: 2,
        taskId: 'task-009',
      });

      expect(serialized).toBe(
        'status=BLOCKED&type=COLLECTION&responsibleRefId=user-003&ticketId=TCK-0002&page=2&taskId=task-009',
      );
    });

    it('elimina claves marcadas con undefined explícito (limpiar filtros)', () => {
      const serialized = serializeTasksInboxQuery({
        status: undefined,
        type: undefined,
        responsibleRefId: undefined,
        ticketId: undefined,
        page: undefined,
      });

      expect(serialized).toBe('');
    });

    it('round-trip: parsear lo serializado devuelve la query original', () => {
      const source = {
        status: TaskStatus.IN_PROGRESS,
        type: TaskType.INTERNAL_OPERATION,
        responsibleRefId: 'user-004',
        ticketId: 'TCK-0003',
        page: 4,
        limit: 50,
        taskId: 'task-010',
      };

      const parsed = parseTasksInboxQuery(new URLSearchParams(serializeTasksInboxQuery(source)));
      expect(parsed).toEqual(source);
    });
  });
});
