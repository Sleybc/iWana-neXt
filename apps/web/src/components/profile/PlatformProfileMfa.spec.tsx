import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, authApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { PlatformProfileMfa } from './PlatformProfileMfa';

const COPY = PLATFORM_UI_COPY.profileMfa;

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  authApi: { setupPlatformSelfMfa: jest.fn(), verifyPlatformSelfMfa: jest.fn() },
}));

const setupMock = jest.mocked(authApi.setupPlatformSelfMfa);
const verifyMock = jest.mocked(authApi.verifyPlatformSelfMfa);
const onEnabled = jest.fn();

async function openDialog() {
  const user = userEvent.setup();
  render(<PlatformProfileMfa enabled={false} onEnabled={onEnabled} />);
  await user.click(screen.getByRole('button', { name: COPY.action }));
  return user;
}

async function startEnrollment() {
  const user = await openDialog();
  await user.type(screen.getByLabelText(COPY.password), 'clave-de-prueba');
  await user.click(screen.getByRole('button', { name: COPY.continue }));
  await screen.findByLabelText(COPY.code);
  return user;
}

async function submitCode(user: Awaited<ReturnType<typeof openDialog>>, code = '123456') {
  await user.type(screen.getByLabelText(COPY.code), code);
  await user.click(screen.getByRole('button', { name: COPY.confirm }));
}

describe('PlatformProfileMfa', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupMock.mockResolvedValue({
      qrCodeBase64: 'data:image/png;base64,ABC',
      otpauthUri: 'otpauth://totp/demo?secret=CLAVEDEPRUEBA',
      challenge: 'reto-1',
    });
  });

  it('activa la verificación con el código del reto vigente', async () => {
    verifyMock.mockResolvedValue(undefined);
    const user = await startEnrollment();
    expect(setupMock).toHaveBeenCalledWith('clave-de-prueba');

    await submitCode(user);

    expect(await screen.findByRole('status')).toHaveTextContent(COPY.saved);
    expect(verifyMock).toHaveBeenCalledWith('reto-1', '123456');
    expect(onEnabled).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un 400 al confirmar reinicia la inscripción y muestra la causa', async () => {
    verifyMock.mockRejectedValue(new ApiError(400, 'BAD_REQUEST', 'El código venció.'));
    const user = await startEnrollment();

    await submitCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('El código venció.');
    expect(screen.getByLabelText(COPY.password)).toHaveValue('');
    expect(screen.queryByLabelText(COPY.code)).not.toBeInTheDocument();
    expect(onEnabled).not.toHaveBeenCalled();
  });

  it('un fallo distinto de 400 conserva la inscripción para reintentar', async () => {
    verifyMock.mockRejectedValue(new Error('network'));
    const user = await startEnrollment();

    await submitCode(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.verifyError);
    expect(screen.getByLabelText(COPY.code)).toBeInTheDocument();
    expect(onEnabled).not.toHaveBeenCalled();
  });

  it('un 409 al iniciar la da por activa y cierra sin anunciar una activación propia', async () => {
    setupMock.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Ya está activa.'));
    const user = await openDialog();
    await user.type(screen.getByLabelText(COPY.password), 'clave-de-prueba');
    await user.click(screen.getByRole('button', { name: COPY.continue }));

    await waitFor(() => expect(onEnabled).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('un 409 al confirmar la da por activa y cierra', async () => {
    verifyMock.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Ya está activa.'));
    const user = await startEnrollment();

    await submitCode(user);

    await waitFor(() => expect(onEnabled).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['12345', '12345a'])('no envía un código incompleto o no numérico (%s)', async (code) => {
    verifyMock.mockResolvedValue(undefined);
    const user = await startEnrollment();

    await submitCode(user, code);

    expect(screen.getByLabelText(COPY.code)).toBeInvalid();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
