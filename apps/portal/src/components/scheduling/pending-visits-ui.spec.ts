import { VisitRequestStatus, WorkOrderSourceContext } from '@iwana/shared';
import type { WfmVisitRequest } from '@/lib/api-client';
import {
  filterActionablePendingVisitRequests,
  formatVisitRequestLocationLabel,
  formatVisitRequestTerritory,
  getVisitRequestOriginLabel,
  getVisitRequestRetryChip,
  hydratePendingVisitFiltersFromSearchParams,
  requiresAttemptDecision,
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

    expect(filterActionablePendingVisitRequests([...visitRequests] as WfmVisitRequest[])).toEqual([
      expect.objectContaining({ id: 'ready' }),
    ]);
  });
});

describe('hydratePendingVisitFiltersFromSearchParams (CA-V2-05 / I-2)', () => {
  it('inicializa status desde la dirección y descarta inválidos', () => {
    expect(
      hydratePendingVisitFiltersFromSearchParams(new URLSearchParams('status=READY_TO_SCHEDULE'))
        .status,
    ).toBe(VisitRequestStatus.READY_TO_SCHEDULE);

    expect(
      hydratePendingVisitFiltersFromSearchParams(new URLSearchParams('status=NOPE')).status,
    ).toBe('');
  });
});

describe('getVisitRequestRetryChip / requiresAttemptDecision', () => {
  it('emite chip de intento con status REQUIRES_RESCHEDULE del contrato', () => {
    const chip = getVisitRequestRetryChip({
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 2,
      lastNonRealizationCauseLabel: 'El cliente no estaba',
    } as WfmVisitRequest);

    expect(chip).toEqual(
      expect.objectContaining({
        label: 'Intento 2 de 3',
        variant: 'warning',
      }),
    );
  });

  it('emite Requiere decisión solo con REQUIRES_RESCHEDULE y 3 intentos', () => {
    const exhausted = {
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 3,
    } as WfmVisitRequest;

    expect(getVisitRequestRetryChip(exhausted)?.label).toBe('Requiere decisión');
    expect(requiresAttemptDecision(exhausted)).toBe(true);

    expect(
      requiresAttemptDecision({
        status: VisitRequestStatus.READY_TO_SCHEDULE,
        retryCount: 3,
      } as WfmVisitRequest),
    ).toBe(false);
  });
});
