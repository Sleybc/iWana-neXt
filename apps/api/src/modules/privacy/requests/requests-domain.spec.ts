import { addColombiaBusinessDays, addCalendarMonths } from '@iwana/shared';
import {
  calculateInitialDueAt,
  calculateImpersonationComplaintDueAt,
  calculateRequestTaskDueAt,
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
    expect(calculateImpersonationComplaintDueAt('2026-07-06')).toBe(
      addColombiaBusinessDays('2026-07-06', 20),
    );
    expect(calculateRequestTaskDueAt('SUSPENDER_COBRO_EXTERNO', '2026-07-06', '2026-07-22')).toBe(
      '2026-07-06',
    );
    expect(calculateRequestTaskDueAt('ENTREGAR_COPIA_DOCUMENTOS', '2026-07-06', '2026-07-22')).toBe(
      '2026-07-22',
    );
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
