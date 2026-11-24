import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, tenantApi } from '@/lib/api-client';
import { TenantAdminAccess } from './TenantAdminAccess';

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError: MockApiError, tenantApi: { regenerateCredentials: jest.fn() } };
});

const regenerate = tenantApi.regenerateCredentials as jest.Mock;
const issued = {
  message: 'Credenciales temporales regeneradas.',
  adminEmail: 'admin@demo.co',
  temporaryPassword: 'Temporal-Prueba-1',
  expiresAt: '2026-11-25T10:00:00.000Z',
};

const view = (status = 'ACTIVE') =>
  render(<TenantAdminAccess tenantId="t-1" tenantName="ISP Demo" tenantStatus={status} />);
const openConfirm = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Emitir nueva contraseña temporal' }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Emitir contraseña' }));

describe('TenantAdminAccess', () => {
  let sequence = 0;

  beforeEach(() => {
    regenerate.mockReset();
    sequence = 0;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => `clave-${++sequence}` },
    });
  });

  it('no emite nada hasta confirmar y cancelar no cambia la contraseña', () => {
    view();
    openConfirm();
    expect(screen.getByText(/dejará\s+de servir/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('muestra la contraseña y usa una clave distinta en cada emisión', async () => {
    regenerate.mockResolvedValue(issued);
    view();
    openConfirm();
    confirm();
    expect(await screen.findByText('Temporal-Prueba-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Temporal-Prueba-1')).not.toBeInTheDocument();

    openConfirm();
    confirm();
    await screen.findByText('Temporal-Prueba-1');
    expect(regenerate.mock.calls).toEqual([
      ['t-1', 'clave-1'],
      ['t-1', 'clave-2'],
    ]);
  });

  it('repite la clave tras un fallo incierto y la renueva tras un 409', async () => {
    regenerate
      .mockRejectedValueOnce(new Error('red'))
      .mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'duplicada'))
      .mockResolvedValueOnce(issued);
    view();
    openConfirm();
    confirm();
    expect(await screen.findByText(/Inténtalo de nuevo/)).toBeInTheDocument();
    openConfirm();
    confirm();
    expect(await screen.findByText(/sí cambió la contraseña/)).toBeInTheDocument();
    openConfirm();
    confirm();
    await screen.findByText('Temporal-Prueba-1');
    expect(regenerate.mock.calls.map(([, key]) => key)).toEqual(['clave-1', 'clave-1', 'clave-2']);
    await waitFor(() =>
      expect(screen.queryByText(/sí cambió la contraseña/)).not.toBeInTheDocument(),
    );
  });

  it('no permite emitir si la empresa no está activa', () => {
    view('PENDING');
    expect(screen.getByRole('button', { name: 'Emitir nueva contraseña temporal' })).toBeDisabled();
  });
});
