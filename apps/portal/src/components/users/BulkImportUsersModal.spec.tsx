import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { BulkImportUsersModal } from './BulkImportUsersModal';

const bulkCreateMock = jest.fn();
const getBulkJobStatusMock = jest.fn();
const claimBulkJobResultMock = jest.fn();

jest.mock('csv-parse/browser/esm/sync', () => ({
  parse: jest.fn(() => []),
}));

jest.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    usersApi: {
      bulkCreate: (...args: unknown[]) => bulkCreateMock(...args),
      getBulkJobStatus: (...args: unknown[]) => getBulkJobStatusMock(...args),
      claimBulkJobResult: (...args: unknown[]) => claimBulkJobResultMock(...args),
    },
  };
});

jest.mock('./bulk-import-job-storage', () => ({
  readActiveBulkJobId: jest.fn(() => null),
  writeActiveBulkJobId: jest.fn(),
}));

describe('BulkImportUsersModal (async Ola C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('al reabrir un job completado reclama credenciales one-time', async () => {
    getBulkJobStatusMock.mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      summary: { total: 1, succeeded: 1, failed: 0 },
      failed: [],
      credentialsClaimed: false,
    });
    claimBulkJobResultMock.mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      summary: { total: 1, succeeded: 1, failed: 0 },
      succeeded: [
        {
          email: 'nuevo@empresa.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: UserRole.NOC,
          temporaryPassword: 'Temp-OneTime-1!',
          createdAt: '2026-07-22T12:00:00.000Z',
        },
      ],
      failed: [],
      credentialsClaimed: true,
    });

    const onSuccess = jest.fn();
    const onActiveJobChange = jest.fn();

    render(
      <BulkImportUsersModal
        isOpen
        onClose={jest.fn()}
        onSuccess={onSuccess}
        onActiveJobChange={onActiveJobChange}
        resumeJobId="job-1"
      />,
    );

    expect(screen.getByText('Importación en curso')).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(claimBulkJobResultMock).toHaveBeenCalledWith('job-1');
    });

    expect(await screen.findByText('Usuarios importados')).toBeInTheDocument();
    expect(screen.getByText('Temp-OneTime-1!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descargar credenciales/i })).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
    expect(onActiveJobChange).toHaveBeenCalledWith(null);
  });

  it('muestra fallo total sin secretos y permite volver a intentar', async () => {
    getBulkJobStatusMock.mockResolvedValue({
      jobId: 'job-fail',
      status: 'completed',
      summary: { total: 1, succeeded: 0, failed: 1 },
      failed: [{ rowIndex: 2, email: 'dup@empresa.com', reason: 'El correo ya está registrado' }],
      credentialsClaimed: false,
    });

    render(
      <BulkImportUsersModal
        isOpen
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        resumeJobId="job-fail"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(await screen.findByText('No se importaron usuarios')).toBeInTheDocument();
    expect(screen.getByText('El correo ya está registrado')).toBeInTheDocument();
    expect(claimBulkJobResultMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Volver a intentar/i })).toBeInTheDocument();
  });

  it('si el resultado ya fue reclamado, no vuelve a pedir contraseñas', async () => {
    getBulkJobStatusMock.mockResolvedValue({
      jobId: 'job-claimed',
      status: 'completed',
      summary: { total: 2, succeeded: 2, failed: 0 },
      failed: [],
      credentialsClaimed: true,
    });

    render(
      <BulkImportUsersModal
        isOpen
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        resumeJobId="job-claimed"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      await screen.findByText(
        /Esta importación ya se completó. Las contraseñas temporales no están disponibles./i,
      ),
    ).toBeInTheDocument();
    expect(claimBulkJobResultMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/temporaryPassword|Temp-/i)).not.toBeInTheDocument();
  });

  it('en error de polling muestra reintentar sin inventar éxito', async () => {
    getBulkJobStatusMock.mockRejectedValue(new Error('network'));

    render(
      <BulkImportUsersModal
        isOpen
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        resumeJobId="job-net"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      await screen.findByText('No pudimos consultar el estado. Reintentar.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Usuarios importados')).not.toBeInTheDocument();

    getBulkJobStatusMock.mockResolvedValue({
      jobId: 'job-net',
      status: 'active',
      summary: null,
      failed: [],
      credentialsClaimed: false,
    });

    fireEvent.click(screen.getByRole('button', { name: /^Reintentar$/i }));

    await waitFor(() => {
      expect(getBulkJobStatusMock).toHaveBeenCalledTimes(2);
    });
  });
});
