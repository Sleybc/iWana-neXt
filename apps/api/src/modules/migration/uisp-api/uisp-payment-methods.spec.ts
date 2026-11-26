import { UispApiError } from './uisp-api.client';
import {
  UISP_PAYMENT_METHODS_PATH,
  UispPaymentMethodNamesService,
  parseUispPaymentMethods,
} from './uisp-payment-methods';

const SCOPE = { tenantId: '00000000-0000-4000-8000-0000000000a1', schemaName: 'tenant_demo' };

describe('parseUispPaymentMethods (ADR-110 v1.4 D17)', () => {
  it('toma id y nombre y omite lo que no los trae', () => {
    const names = parseUispPaymentMethods([
      { id: '4145b5f5-3bbc-45e3-8fc5-9cda970c62fb', name: ' Efectivo ' },
      { id: 7, name: 'Consignación' },
      { id: 'sin-nombre' },
      { name: 'sin id' },
      null,
      'x',
    ]);
    expect([...names]).toEqual([
      ['4145b5f5-3bbc-45e3-8fc5-9cda970c62fb', 'Efectivo'],
      ['7', 'Consignación'],
    ]);
  });

  it('una respuesta que no es lista da un mapa vacío', () => {
    expect(parseUispPaymentMethods({ error: 'x' }).size).toBe(0);
  });
});

describe('UispPaymentMethodNamesService', () => {
  const connection = { baseUrl: 'https://uisp.example.com', apiKey: 'k' };

  it('lee el catálogo con la conexión del tenant', async () => {
    const getJson = jest.fn().mockResolvedValue([{ id: 'm1', name: 'Efectivo' }]);
    const service = new UispPaymentMethodNamesService(
      { load: jest.fn().mockResolvedValue({ connection }) } as never,
      { getJson } as never,
    );
    const names = await service.load(SCOPE);
    expect(getJson).toHaveBeenCalledWith(connection, UISP_PAYMENT_METHODS_PATH);
    expect(names.get('m1')).toBe('Efectivo');
  });

  it('sin conexión no llama a UISP', async () => {
    const getJson = jest.fn();
    const service = new UispPaymentMethodNamesService(
      { load: jest.fn().mockResolvedValue(null) } as never,
      { getJson } as never,
    );
    expect((await service.load(SCOPE)).size).toBe(0);
    expect(getJson).not.toHaveBeenCalled();
  });

  it('si UISP falla, la simulación sigue sin nombres', async () => {
    const service = new UispPaymentMethodNamesService(
      { load: jest.fn().mockResolvedValue({ connection }) } as never,
      {
        getJson: jest.fn().mockRejectedValue(new UispApiError('UNREACHABLE', 'RED', true)),
      } as never,
    );
    await expect(service.load(SCOPE)).resolves.toEqual(new Map());
  });
});
