import { WorkOrderSourceContext } from '@iwana/shared';
import {
  HIGH_DENSITY_DAY_THRESHOLD,
  buildSchedulingFiltersForViewSwitch,
  formatScheduleEventCoordinates,
  formatSchedulingExpedienteLabel,
  getEventReferenceLabel,
  getRecommendedSchedulingViewForDensity,
  getSchedulingVisibleDescription,
  getWorkOrderSourceReferenceLabel,
  getDefaultSchedulingViewForRole,
  getSchedulingViewDescription,
  hasScheduleEventCoordinates,
  isHighDensityScheduleDay,
  parseOptionalCoordinate,
} from './scheduling-ui';

describe('scheduling-ui', () => {
  it('formatea la referencia corta del expediente para operaciones de campo', () => {
    expect(formatSchedulingExpedienteLabel('fcda817a-6340-4b83-bdd3-8bb4caa6cae9')).toBe(
      'FCDA817A',
    );
  });

  it('humaniza descripciones legacy originadas desde CRM', () => {
    expect(
      getSchedulingVisibleDescription(
        'Evento originado desde CRM para el expediente fcda817a-6340-4b83-bdd3-8bb4caa6cae9.',
      ),
    ).toBe('Evento originado desde CRM para la oportunidad FCDA817A.');
  });

  it('muestra referencias cortas para expediente y orden de trabajo CRM', () => {
    expect(
      getEventReferenceLabel({
        ticketId: null,
        contractId: null,
        subscriberId: null,
        expedienteId: 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9',
      } as any),
    ).toBe('Oportunidad FCDA817A');

    expect(
      getWorkOrderSourceReferenceLabel({
        sourceContext: WorkOrderSourceContext.CRM,
        sourceRef: 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9',
      }),
    ).toBe('FCDA817A');
  });

  it('resuelve referencia CRM desde la orden de trabajo cuando el evento no tiene expedienteId', () => {
    expect(
      getEventReferenceLabel(
        {
          ticketId: null,
          contractId: null,
          subscriberId: null,
          expedienteId: null,
          workOrderId: 'wo-1',
        } as any,
        {
          id: 'wo-1',
          sourceContext: WorkOrderSourceContext.CRM,
          sourceRef: 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9',
        } as any,
      ),
    ).toBe('Oportunidad FCDA817A');
  });

  it('activa la heurística oficial desde 20 tareas en el día visible', () => {
    expect(isHighDensityScheduleDay(HIGH_DENSITY_DAY_THRESHOLD - 1)).toBe(false);
    expect(isHighDensityScheduleDay(HIGH_DENSITY_DAY_THRESHOLD)).toBe(true);
  });

  it('mantiene el rango actual al cambiar desde una jornada a la vista lista', () => {
    expect(
      buildSchedulingFiltersForViewSwitch(
        {
          fromDate: '2026-06-19',
          toDate: '2026-06-19',
          technicianId: '',
          type: '',
          status: '',
          view: 'day',
        },
        'list',
      ),
    ).toMatchObject({
      fromDate: '2026-06-19',
      toDate: '2026-06-19',
      view: 'list',
    });
  });

  it('colapsa a un solo día al abrir lista desde una vista analítica', () => {
    expect(
      buildSchedulingFiltersForViewSwitch(
        {
          fromDate: '2026-06-16',
          toDate: '2026-06-22',
          technicianId: '',
          type: '',
          status: '',
          view: 'week',
        },
        'list',
      ),
    ).toMatchObject({
      fromDate: '2026-06-16',
      toDate: '2026-06-16',
      view: 'list',
    });
  });

  it('recomienda lista solo para jornadas de un día con alta densidad', () => {
    expect(
      getRecommendedSchedulingViewForDensity(
        { fromDate: '2026-06-19', toDate: '2026-06-19' },
        HIGH_DENSITY_DAY_THRESHOLD,
      ),
    ).toBe('list');

    expect(
      getRecommendedSchedulingViewForDensity(
        { fromDate: '2026-06-19', toDate: '2026-06-25' },
        HIGH_DENSITY_DAY_THRESHOLD,
      ),
    ).toBeNull();
  });

  it('expone copy de vista y fallback operativo por rol', () => {
    expect(getDefaultSchedulingViewForRole()).toBe('day');
    expect(getSchedulingViewDescription('list')).toBe('Revisa todo el volumen del rango activo.');
  });

  it('normaliza y formatea coordenadas del evento', () => {
    expect(parseOptionalCoordinate('4,7110')).toBeCloseTo(4.711, 3);
    expect(parseOptionalCoordinate('-74.0721')).toBeCloseTo(-74.0721, 4);
    expect(
      hasScheduleEventCoordinates({
        latitude: '4.711',
        longitude: '-74.0721',
      } as any),
    ).toBe(true);
    expect(
      formatScheduleEventCoordinates({
        latitude: '4.711',
        longitude: '-74.0721',
      } as any),
    ).toBe('4.711, -74.0721');
  });
});
