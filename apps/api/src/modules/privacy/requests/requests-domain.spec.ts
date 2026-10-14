import { addColombiaBusinessDays, addCalendarMonths } from '@iwana/shared';
import {
  calculateInitialDueAt,
  calculateImpersonationComplaintDueAt,
  calculateRequestTaskDueAt,
  calculateExtendedUntil,
  isWithinBusinessDeadline,
  requestTransitionAllowed,
} from './requests-domain';

describe('reglas de solicitudes de privacidad', () => {
  it.each([
    ['CONSULTA', '2026-07-22'],
    ['SUPLANTACION', '2026-07-22'],
  ] as const)(
    'calcula 10 días hábiles para %s cruzando el festivo del 9 de julio',
    (kind, expected) => {
      expect(calculateInitialDueAt(kind, '2026-07-06', null)).toBe(expected);
    },
  );

  it('calcula el plazo de reclamo desde la fecha de completitud, pasando Semana Santa', () => {
    expect(calculateInitialDueAt('RECLAMO', '2026-03-30', '2026-04-01')).toBe('2026-04-24');
  });

  it('calcula los dos plazos de suplantación y las tareas asociadas', () => {
    expect(calculateInitialDueAt('SUPLANTACION', '2026-07-06', null)).toBe('2026-07-22');
    expect(calculateImpersonationComplaintDueAt('2026-07-06')).toBe('2026-08-05');
    expect(calculateRequestTaskDueAt('SUSPENDER_COBRO_EXTERNO', '2026-07-06', '2026-07-22')).toBe(
      '2026-07-06',
    );
    expect(calculateRequestTaskDueAt('ENTREGAR_COPIA_DOCUMENTOS', '2026-07-06', '2026-07-22')).toBe(
      '2026-07-22',
    );
  });

  it('verifica la tabla de plazos legales y sus límites al cruzar festivos', () => {
    // Ley 1581: requerimiento dentro de cinco días hábiles desde la radicación.
    expect(isWithinBusinessDeadline('2026-07-14', '2026-07-06', 5)).toBe(true);
    expect(isWithinBusinessDeadline('2026-07-15', '2026-07-06', 5)).toBe(false);

    // Ley 1581: prórroga de cinco días para consulta y ocho para reclamo.
    expect(calculateExtendedUntil('CONSULTA', '2026-07-22')).toBe('2026-07-29');
    expect(calculateExtendedUntil('RECLAMO', '2026-04-24')).toBe('2026-05-07');
    expect(() => calculateExtendedUntil('SUPLANTACION', '2026-07-23')).toThrow(RangeError);

    // Las ventanas de dos días para traslado y leyenda usan el mismo calendario civil hábil.
    expect(isWithinBusinessDeadline('2026-04-07', '2026-04-01', 2)).toBe(true);
    expect(isWithinBusinessDeadline('2026-04-08', '2026-04-01', 2)).toBe(false);
  });

  it('calcula desistimiento a dos meses calendario y permite solo transiciones válidas', () => {
    expect(addCalendarMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(requestTransitionAllowed('RADICADA', 'require-info')).toBe(true);
    expect(requestTransitionAllowed('INCOMPLETA', 'complete')).toBe(true);
    expect(requestTransitionAllowed('EN_TRAMITE', 'extend')).toBe(true);
    expect(requestTransitionAllowed('EN_TRAMITE', 'resolve')).toBe(true);
    expect(requestTransitionAllowed('EN_TRAMITE', 'reject')).toBe(true);
    expect(requestTransitionAllowed('RADICADA', 'transfer')).toBe(true);
    expect(requestTransitionAllowed('RESUELTA', 'extend')).toBe(false);
  });
});
