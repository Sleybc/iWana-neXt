import { PrivacyRequestsService } from './requests.service';
import { PrivacyRequestsController } from './requests.controller';

const requestId = '76000000-0000-4000-8000-000000000001';
const taskId = '76000000-0000-4000-8000-000000000002';
const actorId = '76000000-0000-4000-8000-000000000003';

describe('PrivacyRequestsController', () => {
  const service = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    transition: jest.fn(),
    getRequesterEvidence: jest.fn(),
    verifyIdentity: jest.fn(),
    completeTask: jest.fn(),
  };
  const request = { user: { sub: actorId } } as never;
  let controller: PrivacyRequestsController;

  beforeEach(() => {
    jest.clearAllMocks();
    service.create.mockResolvedValue({ request: { id: requestId } });
    service.list.mockResolvedValue({ data: [], meta: { total: 0, nextCursor: null } });
    service.get.mockResolvedValue({
      request: { id: requestId, requester: null },
      events: [],
      tasks: [],
    });
    service.transition.mockImplementation(async (_id, action) => ({ action }));
    service.getRequesterEvidence.mockResolvedValue({ url: 'https://storage.invalid/evidence' });
    service.verifyIdentity.mockResolvedValue({ identityStatus: 'VERIFICADA' });
    service.completeTask.mockResolvedValue({ status: 'COMPLETADA' });
    controller = new PrivacyRequestsController(service as unknown as PrivacyRequestsService);
  });

  it('envuelve la radicación y entrega el filtro validado al servicio', async () => {
    const dto = { kind: 'CONSULTA' };
    const query = { kind: 'CONSULTA', status: 'RADICADA', limit: 10 };

    await expect(controller.create(dto as never, request)).resolves.toEqual({
      data: { request: { id: requestId } },
    });
    await expect(controller.list(query as never)).resolves.toEqual({
      data: [],
      meta: { total: 0, nextCursor: null },
    });
    expect(service.create).toHaveBeenCalledWith(dto, actorId);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('no almacena el detalle en caché cuando incluye datos descifrados del solicitante', async () => {
    const response = { setHeader: jest.fn() };
    service.get.mockResolvedValueOnce({
      request: { id: requestId, requester: null },
      events: [],
      tasks: [],
    });
    await expect(controller.get(requestId, request, response as never)).resolves.toMatchObject({
      data: { request: { requester: null } },
    });
    expect(response.setHeader).not.toHaveBeenCalled();

    service.get.mockResolvedValueOnce({
      request: { id: requestId, requester: { name: 'Persona de prueba' } },
      events: [],
      tasks: [],
    });
    await controller.get(requestId, request, response as never);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(service.get).toHaveBeenNthCalledWith(1, requestId, actorId);
    expect(service.get).toHaveBeenNthCalledWith(2, requestId, actorId);
  });

  it.each([
    ['requireInfo', 'require-info', { reason: 'Falta soporte' }],
    ['complete', 'complete', { note: 'Identidad verificada' }],
    ['extend', 'extend', { reason: 'Complejidad', newDueAt: '2026-11-10' }],
    ['resolve', 'resolve', { responseText: 'Respuesta', responseChannel: 'EMAIL' }],
    [
      'reject',
      'reject',
      { legalBasis: 'SOLICITANTE_NO_LEGITIMADO', responseText: 'Sin legitimación' },
    ],
    ['transfer', 'transfer', { transferredTo: 'SIC', reason: 'Competencia' }],
  ] as const)('%s delega la transición y devuelve data', async (method, action, body) => {
    const result = await controller[method](requestId, body as never, request);

    expect(result).toEqual({ data: { action } });
    expect(service.transition).toHaveBeenCalledWith(requestId, action, body, actorId);
  });

  it('expone evidencia, verifica identidad y completa la tarea usando al actor de la sesión', async () => {
    const verify = { method: 'DOCUMENTO_PRESENCIAL' };
    const evidence = await controller.getEvidence(requestId, request);
    const verified = await controller.verifyIdentity(requestId, verify as never, request);
    const task = await controller.completeTask(requestId, taskId, { note: 'Entregada' }, request);

    expect(evidence).toEqual({ data: { url: 'https://storage.invalid/evidence' } });
    expect(verified).toEqual({ data: { identityStatus: 'VERIFICADA' } });
    expect(task).toEqual({ data: { status: 'COMPLETADA' } });
    expect(service.getRequesterEvidence).toHaveBeenCalledWith(requestId, actorId);
    expect(service.verifyIdentity).toHaveBeenCalledWith(requestId, verify, actorId);
    expect(service.completeTask).toHaveBeenCalledWith(requestId, taskId, 'Entregada', actorId);
  });
});
