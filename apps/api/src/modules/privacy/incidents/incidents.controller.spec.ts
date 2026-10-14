import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';

const incident = {
  id: '77000000-0000-4000-8000-000000000001',
  detectedAt: '2026-10-14T15:00:00.000Z',
  description: 'Incidente sintético de prueba.',
  affectedCategories: ['IDENTIFICACION'],
  sicReportDueAt: '2026-11-04',
  reportedAt: null,
  externalReference: null,
};

describe('IncidentsController', () => {
  const service = { list: jest.fn(), create: jest.fn(), report: jest.fn() };
  const actor = { sub: '77000000-0000-4000-8000-000000000002' };
  let controller: IncidentsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new IncidentsController(service as unknown as IncidentsService);
  });

  it('valida el listado y lo envuelve', async () => {
    service.list.mockResolvedValue([incident]);
    await expect(controller.list()).resolves.toEqual({ data: [incident] });
  });

  it('crea un incidente con actor autenticado y devuelve la proyección pública', async () => {
    service.create.mockResolvedValue(incident);
    const dto = {
      description: incident.description,
      affectedCategories: incident.affectedCategories,
    };
    await expect(controller.create(dto as never, { user: actor } as never)).resolves.toEqual({
      data: incident,
    });
    expect(service.create).toHaveBeenCalledWith(dto, actor);
  });

  it('registra la fecha y referencia del reporte con el actor autenticado', async () => {
    const reported = {
      ...incident,
      reportedAt: '2026-10-14',
      externalReference: 'SIC-SINTETICO-1',
    };
    service.report.mockResolvedValue(reported);
    const dto = { reportedAt: reported.reportedAt, externalReference: reported.externalReference };
    await expect(
      controller.report(incident.id, dto as never, { user: actor } as never),
    ).resolves.toEqual({ data: reported });
    expect(service.report).toHaveBeenCalledWith(incident.id, dto, actor);
  });
});
