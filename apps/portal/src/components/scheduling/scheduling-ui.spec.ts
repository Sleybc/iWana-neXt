import { ScheduleEventStatus, WfmWorkType, WorkOrderSourceContext } from '@iwana/shared';
import {
  HIGH_DENSITY_DAY_THRESHOLD,
  buildSchedulingFiltersForViewSwitch,
  buildSchedulingSearchParams,
  formatScheduleEventCoordinates,
  formatSchedulingExpedienteLabel,
  getEventReferenceLabel,
  getRecommendedSchedulingViewForDensity,
  getSchedulingVisibleDescription,
  getWorkOrderSourceContextLabel,
  getWorkOrderSourceReferenceLabel,
  getDefaultSchedulingViewForRole,
  getSchedulingViewDescription,
  getSchedulingQueryKeyWithoutViewState,
  hasScheduleEventCoordinates,
  hydrateSchedulingFiltersFromSearchParams,
  isHighDensityScheduleDay,
  parseLocalDayKey,
  parseOptionalCoordinate,
  parseSchedulingView,
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
    ).toBe('Evento originado para la oportunidad FCDA817A.');
  });

  it('etiqueta el origen comercial como oportunidades', () => {
    expect(getWorkOrderSourceContextLabel(WorkOrderSourceContext.CRM)).toBe('Oportunidades');
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

  it('hidrata view+fromDate desde la dirección (CA-V2-05 / I-1)', () => {
    expect(parseSchedulingView('day')).toBe('day');
    expect(parseSchedulingView('bogus')).toBeNull();
    expect(parseLocalDayKey('2026-08-10')).toBe('2026-08-10');
    expect(parseLocalDayKey('2026-02-31')).toBeNull();

    const hydrated = hydrateSchedulingFiltersFromSearchParams(
      new URLSearchParams('view=day&fromDate=2026-08-10'),
    );
    expect(hydrated).toEqual(
      expect.objectContaining({
        view: 'day',
        fromDate: '2026-08-10',
        toDate: '2026-08-10',
      }),
    );
  });

  it('escribe vista, fecha base y filtros en la dirección sin tocar otros parámetros (§3 E)', () => {
    const current = new URLSearchParams(
      'source=pending-visits&visitRequestId=vr-1&technicianId=tech-viejo&status=SCHEDULED',
    );
    const next = buildSchedulingSearchParams(current, {
      view: 'week',
      fromDate: '2026-11-16',
      toDate: '2026-11-22',
      technicianId: '',
      type: WfmWorkType.INSTALLATION,
      status: '',
    });

    expect(next.get('source')).toBe('pending-visits');
    expect(next.get('visitRequestId')).toBe('vr-1');
    expect(next.get('view')).toBe('week');
    expect(next.get('fromDate')).toBe('2026-11-16');
    expect(next.get('workType')).toBe(WfmWorkType.INSTALLATION);
    expect(next.has('type')).toBe(false);
    expect(next.has('technicianId')).toBe(false);
    expect(next.has('status')).toBe(false);
    expect(current.get('technicianId')).toBe('tech-viejo');
  });

  it('reproduce desde la dirección lo que escribió: vista, rango y filtros válidos', () => {
    const written = buildSchedulingSearchParams(new URLSearchParams(), {
      view: 'month',
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      technicianId: 'tech-1',
      type: WfmWorkType.INSTALLATION,
      status: ScheduleEventStatus.SCHEDULED,
    });

    expect(hydrateSchedulingFiltersFromSearchParams(written)).toEqual({
      view: 'month',
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      technicianId: 'tech-1',
      type: WfmWorkType.INSTALLATION,
      status: ScheduleEventStatus.SCHEDULED,
    });
    expect(written.get('workType')).toBe(WfmWorkType.INSTALLATION);
    expect(written.has('type')).toBe(false);
    expect(
      hydrateSchedulingFiltersFromSearchParams(new URLSearchParams('workType=BOGUS&status=nada')),
    ).toEqual(expect.objectContaining({ type: '', status: '' }));
  });

  it('el `type` del enlace entrante de CRM no se lee como filtro de tipo de trabajo', () => {
    expect(
      hydrateSchedulingFiltersFromSearchParams(
        new URLSearchParams('open=create&type=INSTALLATION&expedienteId=x'),
      ),
    ).toEqual(expect.objectContaining({ type: '' }));
  });

  it('escribir filtros conserva `type` y `expedienteId` del enlace pendiente', () => {
    const next = buildSchedulingSearchParams(
      new URLSearchParams('open=create&type=INSTALLATION&expedienteId=x'),
      {
        view: 'day',
        fromDate: '2026-11-19',
        toDate: '2026-11-19',
        technicianId: 'tech-1',
        type: '',
        status: '',
      },
    );
    expect(next.get('open')).toBe('create');
    expect(next.get('type')).toBe('INSTALLATION');
    expect(next.get('expedienteId')).toBe('x');
    expect(next.has('workType')).toBe(false);
  });

  it('la clave de enlaces entrantes ignora el estado de la agenda', () => {
    expect(
      getSchedulingQueryKeyWithoutViewState(
        new URLSearchParams(
          'source=pending-visits&visitRequestId=vr-1&view=week&fromDate=2026-11-16&workType=INSTALLATION',
        ),
      ),
    ).toBe('source=pending-visits&visitRequestId=vr-1');
    expect(
      getSchedulingQueryKeyWithoutViewState(
        new URLSearchParams('open=create&type=INSTALLATION&expedienteId=x&workType=REPAIR'),
      ),
    ).toBe('open=create&type=INSTALLATION&expedienteId=x');
  });
});
