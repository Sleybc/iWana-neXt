import { isBatchInProgress } from './migration-labels';
/**
 * Ajustes → Importaciones: subida y lista de lotes (ADR-110; plan 2026-11-12 bloque F).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey, UserRole, type MigrationBatchSummary } from '@iwana/shared';
import { ApiError, migrationApi } from '@/lib/api-client';
import { MigrationImportsClient } from './MigrationImportsClient';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: (() => {
    const router = { push: (...args: unknown[]) => mockPush(...args) };
    return () => router;
  })(),
}));
const mockRole = { current: UserRole.ADMIN as UserRole };
const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: (() => {
    const byRole = new Map<UserRole, { user: { role: UserRole }; isLoading: boolean }>();
    return () => {
      const role = mockRole.current;
      let ctx = byRole.get(role);
      if (!ctx) byRole.set(role, (ctx = { user: { role }, isLoading: false }));
      return ctx;
    };
  })(),
}));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = {
      hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
    };
    return () => ctx;
  })(),
}));

function batch(n: number, overrides: Partial<MigrationBatchSummary> = {}): MigrationBatchSummary {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    source: 'UISP_ZIP',
    status: 'SIMULADO',
    processing: 'COMPLETADO',
    promotionProcessing: null,
    filesReceived: 3,
    createdBy: '00000000-0000-4000-8000-0000000000aa',
    createdAt: '2026-11-12T10:00:00.000Z',
    purgeAfter: '2026-12-12T10:00:00.000Z',
    purgedAt: null,
    ...overrides,
  };
}

function listResponse(data: MigrationBatchSummary[]) {
  return {
    data,
    meta: { total: data.length, page: 1, limit: 50, totalPages: 1 },
  } as unknown as Awaited<ReturnType<typeof migrationApi.listBatches>>;
}

beforeEach(() => {
  mockRole.current = UserRole.ADMIN;
  mockGranted.current = new Set([AccessPermissionKey.MIGRATION_IMPORT_MANAGE]);
  mockPush.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('MigrationImportsClient', () => {
  it('sin el permiso o sin ser ADMIN no consulta el API y lo explica', () => {
    const listSpy = jest.spyOn(migrationApi, 'listBatches');
    mockGranted.current = new Set();
    const { unmount } = render(<MigrationImportsClient />);
    expect(screen.getByText('No tienes acceso a las importaciones')).toBeInTheDocument();
    unmount();
    mockGranted.current = new Set([AccessPermissionKey.MIGRATION_IMPORT_MANAGE]);
    mockRole.current = UserRole.SUPPORT;
    render(<MigrationImportsClient />);
    expect(screen.getByText('No tienes acceso a las importaciones')).toBeInTheDocument();
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('lista los lotes con su estado en español, sin códigos', async () => {
    jest
      .spyOn(migrationApi, 'listBatches')
      .mockResolvedValue(
        listResponse([
          batch(1, { status: 'CONCILIADO' }),
          batch(2, { status: 'REVERTIDO', filesReceived: 1 }),
          batch(3, { processing: 'FALLIDO' }),
        ]),
      );
    render(<MigrationImportsClient />);
    const list = await screen.findByRole('list', { name: 'Lotes de importación' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Conciliado');
    expect(items[1]).toHaveTextContent('Revertido');
    expect(items[1]).toHaveTextContent('1 archivo');
    expect(items[2]).toHaveTextContent('Procesamiento fallido');
    expect(list.textContent).not.toMatch(/CONCILIADO|REVERTIDO|FALLIDO/);
    expect(within(items[0]!).getByRole('link', { name: /Ver informe del lote/ })).toHaveAttribute(
      'href',
      '/dashboard/settings/imports/00000000-0000-4000-8000-000000000001',
    );
  });

  it('estado vacío y error con reintento', async () => {
    const spy = jest
      .spyOn(migrationApi, 'listBatches')
      .mockRejectedValueOnce(new ApiError(500, 'X', 'x'))
      .mockResolvedValueOnce(listResponse([]));
    const user = userEvent.setup();
    render(<MigrationImportsClient />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no hay lotes')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('refresca la lista mientras un lote procesa y lo anuncia', async () => {
    jest.useFakeTimers();
    const spy = jest
      .spyOn(migrationApi, 'listBatches')
      .mockResolvedValueOnce(listResponse([batch(1, { processing: 'PENDIENTE' })]))
      .mockResolvedValue(listResponse([batch(1)]));
    render(<MigrationImportsClient />);
    expect(await screen.findByText('Procesando')).toBeInTheDocument();
    expect(screen.getByText(/la lista se actualiza sola/)).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(await screen.findByText('Simulado')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('valida los archivos antes de subir y navega al informe al crear el lote', async () => {
    jest.spyOn(migrationApi, 'listBatches').mockResolvedValue(listResponse([]));
    const createSpy = jest.spyOn(migrationApi, 'createBatch').mockResolvedValue(batch(7));
    const user = userEvent.setup({ applyAccept: false });
    render(<MigrationImportsClient />);
    const input = await screen.findByLabelText('Archivos ZIP de clientes de UISP');
    await user.upload(input, new File(['x'], 'clientes.csv', { type: 'text/csv' }));
    await user.click(screen.getByRole('button', { name: 'Subir y simular' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '«clientes.csv» no es un archivo ZIP.',
    );
    expect(createSpy).not.toHaveBeenCalled();

    const zip = new File(['x'], 'cliente.zip', { type: 'application/zip' });
    await user.upload(input, zip);
    await user.click(screen.getByRole('button', { name: 'Subir y simular' }));
    await waitFor(() => expect(createSpy).toHaveBeenCalledWith([zip]));
    expect(mockPush).toHaveBeenCalledWith(
      '/dashboard/settings/imports/00000000-0000-4000-8000-000000000007',
    );
  });

  it('traduce el rechazo del API al subir', async () => {
    jest.spyOn(migrationApi, 'listBatches').mockResolvedValue(listResponse([]));
    jest
      .spyOn(migrationApi, 'createBatch')
      .mockRejectedValue(new ApiError(400, 'MIGRATION_ZIP_REJECTED', 'x'));
    const user = userEvent.setup();
    render(<MigrationImportsClient />);
    await user.upload(
      await screen.findByLabelText('Archivos ZIP de clientes de UISP'),
      new File(['x'], 'c.zip', { type: 'application/zip' }),
    );
    await user.click(screen.getByRole('button', { name: 'Subir y simular' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Uno de los archivos no se pudo leer como ZIP de UISP.',
    );
  });
  it('no sigue consultando un lote con la promoción fallida y lo marca', async () => {
    expect(isBatchInProgress(batch(1, { status: 'CARGADO', promotionProcessing: 'FALLIDO' }))).toBe(
      false,
    );
    expect(
      isBatchInProgress(batch(1, { status: 'CARGADO', promotionProcessing: 'PENDIENTE' })),
    ).toBe(true);
  });
});
