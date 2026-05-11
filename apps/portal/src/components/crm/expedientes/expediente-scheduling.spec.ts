import {
  INSTALLATION_SCHEDULING_MIN_PROGRESS,
  buildSchedulingHref,
  canScheduleInstallation,
} from './expediente-scheduling';

describe('expediente-scheduling', () => {
  it('should habilitar agendamiento solo cuando el expediente esta listo y cumple readiness', () => {
    expect(
      canScheduleInstallation({
        status: 'LISTO_PARA_INSTALACION',
        overallProgress: INSTALLATION_SCHEDULING_MIN_PROGRESS,
        canTransition: true,
      }),
    ).toBe(true);

    expect(
      canScheduleInstallation({
        status: 'EN_COTIZACION',
        overallProgress: 100,
        canTransition: true,
      }),
    ).toBe(false);

    expect(
      canScheduleInstallation({
        status: 'LISTO_PARA_INSTALACION',
        overallProgress: 74,
        canTransition: true,
      }),
    ).toBe(false);

    expect(
      canScheduleInstallation({
        status: 'LISTO_PARA_INSTALACION',
        overallProgress: 80,
        canTransition: false,
      }),
    ).toBe(false);
  });

  it('should construir la ruta de scheduling con el contexto del expediente', () => {
    expect(buildSchedulingHref('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/dashboard/scheduling?open=create&type=INSTALLATION&expedienteId=550e8400-e29b-41d4-a716-446655440000',
    );
  });
});
