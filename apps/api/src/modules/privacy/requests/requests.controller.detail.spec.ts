import type { Response } from 'express';
import { PrivacyRequestsController } from './requests.controller';
import { PrivacyRequestsService } from './requests.service';

const requestId = '60000000-0000-4000-8000-000000000001';
const actorId = '60000000-0000-4000-8000-000000000002';

describe('PrivacyRequestsController — detalle A23', () => {
  const requestsService = { get: jest.fn() };
  let controller: PrivacyRequestsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PrivacyRequestsController(
      requestsService as unknown as PrivacyRequestsService,
    );
  });

  it('marca no-store cuando la respuesta incluye identidad del solicitante', async () => {
    requestsService.get.mockResolvedValue({
      request: { requester: { name: 'Solicitante ficticio' } },
      events: [],
      tasks: [],
    });
    const response = { setHeader: jest.fn() } as unknown as Response;

    const result = await controller.get(
      requestId,
      { user: { sub: actorId } } as Parameters<PrivacyRequestsController['get']>[1],
      response,
    );

    expect(requestsService.get).toHaveBeenCalledWith(requestId, actorId);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(result.data.request.requester).toEqual({ name: 'Solicitante ficticio' });
  });

  it('no añade no-store cuando los datos del solicitante están ocultos', async () => {
    requestsService.get.mockResolvedValue({
      request: { requester: null },
      events: [],
      tasks: [],
    });
    const response = { setHeader: jest.fn() } as unknown as Response;

    await controller.get(
      requestId,
      { user: { sub: actorId } } as Parameters<PrivacyRequestsController['get']>[1],
      response,
    );

    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
