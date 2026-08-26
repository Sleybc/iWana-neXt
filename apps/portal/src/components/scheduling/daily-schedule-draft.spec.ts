import { WfmWorkType } from '@iwana/shared';
import type { WfmOperatingWindowResult } from '@/lib/api-client';
import {
  buildDailyDraftFromDrop,
  buildDisplayWindowFromOperatingWindow,
  buildTimelineSlotsForDisplayWindow,
  moveDailyDraftToTime,
  resizeDailyDraftEnd,
  resizeDailyDraftStart,
  validateDailyDraft,
  type DailyDraftEvent,
  type DailyDisplayWindow,
  type PendingVisitDragPayload,
} from './daily-schedule-draft';
import { toLocalTimeValue } from './schedule-event-time';

describe('daily-schedule-draft', () => {
  const operatingWindow: WfmOperatingWindowResult = {
    status: 'OPEN',
    source: 'SITE_HOURS',
    startTime: '08:00',
    endTime: '17:00',
    reason: null,
  };

  it('crea un draft local al simular drop sobre una celda valida', () => {
    const draft = buildDailyDraftFromDrop({
      visitRequestId: 'visit-1',
      organizationSiteId: 'site-1',
      workType: WfmWorkType.INSTALLATION,
      durationMinutes: 120,
      customerDisplayName: 'Cliente demo',
      title: 'Instalación fibra',
      assignedUserId: 'tech-1',
      dayKey: '2026-06-05',
      scheduledStartAt: '2026-06-05T09:00:00.000Z',
      scheduledEndAt: '2026-06-05T11:00:00.000Z',
    });

    expect(draft.visitRequestId).toBe('visit-1');
    expect(draft.source).toBe('pending-visit-drop');
  });

  it('mueve el draft a otra franja sin perder visitRequestId', () => {
    const draft = buildDailyDraftFromDrop({
      visitRequestId: 'visit-1',
      organizationSiteId: null,
      workType: WfmWorkType.TECHNICAL_VISIT,
      durationMinutes: 60,
      customerDisplayName: 'Cliente demo',
      title: 'Visita técnica',
      assignedUserId: 'tech-1',
      dayKey: '2026-06-05',
      scheduledStartAt: '2026-06-05T09:00:00.000Z',
      scheduledEndAt: '2026-06-05T10:00:00.000Z',
    });

    const moved = moveDailyDraftToTime(draft, '2026-06-05', 'tech-1', '14:00');

    expect(moved.visitRequestId).toBe('visit-1');
    expect(toLocalTimeValue(moved.scheduledStartAt)).toBe('14:00');
  });

  it('redimensiona el draft respetando minimo de 30 minutos', () => {
    const draft = buildDailyDraftFromDrop({
      visitRequestId: 'visit-1',
      organizationSiteId: null,
      workType: WfmWorkType.SUPPORT,
      durationMinutes: 60,
      customerDisplayName: 'Cliente demo',
      title: 'Soporte',
      assignedUserId: 'tech-1',
      dayKey: '2026-06-05',
      scheduledStartAt: '2026-06-05T09:00:00.000Z',
      scheduledEndAt: '2026-06-05T10:00:00.000Z',
    });

    const resized = resizeDailyDraftEnd(draft, '09:10');

    expect(resized.durationMinutes).toBeGreaterThanOrEqual(30);
  });

  it('marca invalido un draft fuera de ventana operativa para instalaciones', () => {
    const draft = buildDailyDraftFromDrop({
      visitRequestId: 'visit-1',
      organizationSiteId: 'site-1',
      workType: WfmWorkType.INSTALLATION,
      durationMinutes: 120,
      customerDisplayName: 'Cliente demo',
      title: 'Instalación fibra',
      assignedUserId: 'tech-1',
      dayKey: '2026-06-05',
      scheduledStartAt: '2026-06-05T05:00:00.000Z',
      scheduledEndAt: '2026-06-05T07:00:00.000Z',
    });

    const validated = validateDailyDraft(draft, operatingWindow, []);

    expect(validated.validationState).toBe('out-of-window');
  });

  it('marca invalido un draft en el pasado', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-05T14:00:00'));

    const draft = buildDailyDraftFromDrop({
      visitRequestId: 'visit-1',
      organizationSiteId: null,
      workType: WfmWorkType.SUPPORT,
      durationMinutes: 60,
      customerDisplayName: 'Cliente demo',
      title: 'Soporte',
      assignedUserId: 'tech-1',
      dayKey: '2026-06-05',
      scheduledStartAt: new Date('2026-06-05T10:00:00').toISOString(),
      scheduledEndAt: new Date('2026-06-05T11:00:00').toISOString(),
    });

    const validated = validateDailyDraft(draft, operatingWindow, []);

    expect(validated.validationState).toBe('in-the-past');

    jest.useRealTimers();
  });

  it('construye display window desde ventana operativa de sede', () => {
    const displayWindow = buildDisplayWindowFromOperatingWindow(operatingWindow);

    expect(displayWindow.operatingStartMinutes).toBe(8 * 60);
    expect(displayWindow.operatingEndMinutes).toBe(17 * 60);
    expect(displayWindow.startHour).toBeLessThan(8);
    expect(displayWindow.endHour).toBeGreaterThan(17);
  });

  it('genera subfranjas de 30 minutos dentro de cada hora', () => {
    const slots = buildTimelineSlotsForDisplayWindow({
      startHour: 7,
      endHour: 8,
      operatingStartMinutes: null,
      operatingEndMinutes: null,
      isClosedDay: false,
    });

    expect(slots).toEqual(['07:00', '07:30']);
  });
});
