import { randomUUID } from 'node:crypto';
import { act, renderHook } from '@testing-library/react';
import { BILLING_ERROR_CODES } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { billingError, useBillingMutation } from './billing-ui';

describe('Mutaciones de facturación', () => {
  const originalUuid = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');

  beforeEach(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: randomUUID,
    });
  });

  afterEach(() => {
    if (originalUuid) Object.defineProperty(globalThis.crypto, 'randomUUID', originalUuid);
    else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
  });
  it('bloquea envíos simultáneos y conserva la clave si se reintenta el mismo comando', async () => {
    const { result } = renderHook(useBillingMutation);
    let fail: (reason: Error) => void = () => undefined;
    const pending = new Promise<void>((_, reject) => {
      fail = reject;
    });
    const send = jest
      .fn<Promise<void>, [string]>()
      .mockImplementationOnce(() => pending)
      .mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    const payload = { amount: '100.00' };

    let first = Promise.resolve();
    act(() => {
      first = result.current.run(payload, send, onSuccess);
      void result.current.run(payload, send, onSuccess);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      fail(new Error('Red no disponible'));
      await first;
    });
    expect(result.current.error).toBeTruthy();

    await act(async () => result.current.run({ ...payload }, send, onSuccess));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toBe(send.mock.calls[1]?.[0]);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    await act(async () => result.current.run(payload, send, onSuccess));
    expect(send.mock.calls[2]?.[0]).not.toBe(send.mock.calls[1]?.[0]);
  });
});

describe('billingError', () => {
  it('traduce el 404 del estado de cuenta sin el mensaje genérico', () => {
    expect(
      billingError(
        new ApiError(404, 'BILLING_SUBSCRIBER_NOT_FOUND', 'No se encontró el suscriptor.'),
      ),
    ).toBe('No se encontró el estado de cuenta de este cliente.');
  });

  it.each(Object.values(BILLING_ERROR_CODES))(
    'traduce %s sin el mensaje genérico ni el código crudo',
    (code) => {
      const message = billingError(new ApiError(422, code, 'mensaje del servidor'));
      expect(message).not.toBe('No pudimos completar la operación de facturación.');
      expect(message).not.toContain(code);
      expect(message).not.toMatch(/documento de cobro|adquir/iu);
    },
  );
});
