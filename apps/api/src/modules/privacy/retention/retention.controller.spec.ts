import { RetentionService } from './retention.service';
import { RetentionController } from './retention.controller';

const policy = {
  category: 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR',
  years: 2,
  startEvent: 'FIN_RELACION',
  legalBasis: 'Conservación legal',
  isLegalMinimum: true,
};

describe('RetentionController', () => {
  const service = { list: jest.fn(), extend: jest.fn() };
  let controller: RetentionController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RetentionController(service as unknown as RetentionService);
  });

  it('valida y envuelve el catálogo', async () => {
    service.list.mockResolvedValue([policy]);
    await expect(controller.list()).resolves.toEqual({ data: [policy] });
  });

  it('valida y envuelve una extensión', async () => {
    const extended = { ...policy, years: 3 };
    const dto = { category: policy.category, years: 3 };
    service.extend.mockResolvedValue(extended);
    await expect(controller.extend(dto as never)).resolves.toEqual({ data: extended });
    expect(service.extend).toHaveBeenCalledWith(dto);
  });
});
