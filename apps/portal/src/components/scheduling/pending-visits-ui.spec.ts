import { VisitRequestStatus, WorkOrderSourceContext } from '@iwana/shared';
import {
  filterActionablePendingVisitRequests,
  formatVisitRequestLocationLabel,
  formatVisitRequestTerritory,
  getVisitRequestOriginLabel,
} from './pending-visits-ui';

describe('getVisitRequestOriginLabel', () => {
  it('renders a friendly label for task-originated visit requests', () => {
    expect(getVisitRequestOriginLabel(WorkOrderSourceContext.TASKS)).toBe('Tareas');
  });
});

describe('pending-visits-ui territory formatting', () => {
  it('should format municipality codes using business labels', () => {
    expect(formatVisitRequestLocationLabel('EL_COLEGIO')).toBe('El Colegio');
    expect(formatVisitRequestLocationLabel('SAN_ANTONIO_DEL_TEQUENDAMA')).toBe(
      'San Antonio del Tequendama',
    );
  });

  it('should format unknown snake case sectors with sentence case', () => {
    expect(formatVisitRequestLocationLabel('LOS_MANGOS_DEL_SUR')).toBe('Los Mangos del Sur');
  });

  it('should compose municipality and sector for the inbox and detail panel', () => {
    expect(formatVisitRequestTerritory('EL_COLEGIO', 'LOS_MANGOS_DEL_SUR')).toBe(
      'El Colegio · Los Mangos del Sur',
    );
    expect(formatVisitRequestTerritory('', '')).toBe('Municipio no definido');
  });
});

describe('filterActionablePendingVisitRequests', () => {
  it('excluye solicitudes ya agendadas o cerradas del rail operativo', () => {
    const visitRequests = [
      { id: 'ready', status: VisitRequestStatus.READY_TO_SCHEDULE },
      { id: 'scheduled', status: VisitRequestStatus.SCHEDULED },
      { id: 'cancelled', status: VisitRequestStatus.CANCELLED },
    ] as const;

    expect(filterActionablePendingVisitRequests([...visitRequests] as any)).toEqual([
      expect.objectContaining({ id: 'ready' }),
    ]);
  });
});
