/**
 * Ajustes → Importaciones → informe del lote (ADR-110 D3, D4, D6, D7; plan 2026-11-12 bloque F).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  UserRole,
  type MigrationBatchReport,
  type MigrationPendingValue,
} from '@iwana/shared';
import { ApiError, billingCyclesApi, commercialApi, migrationApi } from '@/lib/api-client';
import { MigrationBatchDetailClient } from './MigrationBatchDetailClient';

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: (() => {
    const ctx = { user: { role: UserRole.ADMIN }, isLoading: false };
    return () => ctx;
  })(),
}));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = {
      hasPermission: (key: AccessPermissionKey) =>
        key === AccessPermissionKey.MIGRATION_IMPORT_MANAGE,
    };
    return () => ctx;
  })(),
}));

const BATCH_ID = '00000000-0000-4000-8000-0000000000b1';
const SUBSCRIBER_ID = '00000000-0000-4000-8000-0000000000a1';

function report(overrides: Partial<MigrationBatchReport> = {}): MigrationBatchReport {
  return {
    id: BATCH_ID,
    source: 'UISP_ZIP',
    status: 'SIMULADO',
    processing: 'COMPLETADO',
    filesReceived: 2,
    createdBy: '00000000-0000-4000-8000-0000000000aa',
    createdAt: '2026-11-12T10:00:00.000Z',
    purgeAfter: '2026-12-12T10:00:00.000Z',
    purgedAt: null,
    counts: {
      procesamiento: 'COMPLETADO',
      archivos: { recibidos: 2, leidos: 1, rechazados: { ZIP_INVALIDO: 1 } },
      entidades: {
        SUSCRIPTOR: { leidos: 5, validos: 3, rechazados: 2 },
        DOCUMENTO_COBRO: { leidos: 10, validos: 10, rechazados: 0 },
      },
      observaciones: { FACTURA_SIN_PDF: 4 },
      tareasSinFuente: 0,
      pendientesEquivalencia: [],
      procesadoEn: '2026-11-12T10:01:00.000Z',
    },
    rejections: { SUSCRIPTOR: { TITULAR_EXISTENTE: 1, PLAN_SIN_EQUIVALENCIA: 1 } },
    promotion: null,
    reconciliation: null,
    ...overrides,
  } as MigrationBatchReport;
}

const PENDING: MigrationPendingValue[] = [
  { kind: 'CICLO', externalValue: '5', externalLabel: 'Día 5', occurrences: 3 },
];

let getSpy: jest.SpyInstance;
beforeEach(() => {
  getSpy = jest.spyOn(migrationApi, 'getBatch').mockResolvedValue(report());
  jest.spyOn(migrationApi, 'pendingMappings').mockResolvedValue([]);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('MigrationBatchDetailClient', () => {
  it('muestra el informe por entidad y los motivos traducidos, sin códigos', async () => {
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    const table = await screen.findByRole('table', { name: 'Registros por entidad' });
    const row = within(table).getByRole('row', { name: /Suscriptores/ });
    expect(row).toHaveTextContent('Suscriptores532');
    expect(screen.getByText('El suscriptor ya existe en iWana: 1')).toBeInTheDocument();
    expect(screen.getByText('Plan sin equivalencia: 1')).toBeInTheDocument();
    expect(screen.getByText('Archivo ZIP dañado o no válido: 1')).toBeInTheDocument();
    expect(screen.getByText('Facturas sin PDF: 4')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/TITULAR_EXISTENTE|SUSCRIPTOR|ZIP_INVALIDO/);
    expect(screen.getByText('Simulado')).toBeInTheDocument();
  });

  it('Promover pide confirmación y no llama al API si se cancela', async () => {
    const promoteSpy = jest
      .spyOn(migrationApi, 'promote')
      .mockResolvedValue({ id: BATCH_ID, status: 'CARGADO' });
    const user = userEvent.setup();
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    await user.click(await screen.findByRole('button', { name: 'Promover' }));
    let dialog = await screen.findByRole('dialog', { name: 'Promover el lote' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(promoteSpy).not.toHaveBeenCalled();

    getSpy.mockResolvedValue(report({ status: 'CARGADO' }));
    await user.click(screen.getByRole('button', { name: 'Promover' }));
    dialog = await screen.findByRole('dialog', { name: 'Promover el lote' });
    await user.click(within(dialog).getByRole('button', { name: 'Promover' }));
    await waitFor(() => expect(promoteSpy).toHaveBeenCalledWith(BATCH_ID));
    expect(
      await screen.findByText('Promoviendo el lote a iWana. El informe se actualiza solo.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Promover' })).not.toBeInTheDocument();
  });

  it('refresca el informe mientras procesa y lo anuncia en una región viva', async () => {
    jest.useFakeTimers();
    getSpy
      .mockResolvedValueOnce(
        report({
          processing: 'PENDIENTE',
          counts: { ...report().counts, procesamiento: 'PENDIENTE' },
        }),
      )
      .mockResolvedValue(report());
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    const status = await screen.findByText(/Leyendo los archivos/);
    expect(status).toHaveAttribute('aria-live', 'polite');
    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    await waitFor(() => expect(screen.queryByText(/Leyendo los archivos/)).not.toBeInTheDocument());
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('Revertir bloqueado explica qué lo impide', async () => {
    getSpy.mockResolvedValue(report({ status: 'PROMOVIDO' }));
    jest.spyOn(migrationApi, 'revert').mockRejectedValue(
      new ApiError(409, 'MIGRATION_REVERT_BLOCKED', 'x', {
        blockers: [
          { motivo: 'PAGO_POSTERIOR', cantidad: 2 },
          { motivo: 'ORDEN_DE_TRABAJO', cantidad: 1 },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    await user.click(await screen.findByRole('button', { name: 'Revertir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revertir el lote' });
    await user.click(within(dialog).getByRole('button', { name: 'Revertir' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se puede revertir');
    const blockers = within(alert).getByRole('list', { name: 'Qué bloquea la reversión' });
    expect(blockers).toHaveTextContent('Pagos registrados después de la importación: 2');
    expect(blockers).toHaveTextContent('Órdenes de trabajo asociadas: 1');
    expect(alert.textContent).not.toMatch(/PAGO_POSTERIOR/);
  });

  it('Conciliar muestra el informe de diferencias por suscriptor', async () => {
    getSpy.mockResolvedValue(report({ status: 'PROMOVIDO' }));
    const reconciled = report({
      status: 'CONCILIADO',
      reconciliation: {
        resultado: 'CON_DIFERENCIAS',
        titulares: 3,
        conciliados: 2,
        calculadoEn: '2026-11-12T11:00:00.000Z',
        diferencias: [
          {
            subscriberId: SUBSCRIBER_ID,
            externalId: 'uisp:client:77',
            facturado: { uisp: '100000.00', iwana: '90000.00' },
            pagado: { uisp: '50000.00', iwana: '50000.00' },
            saldo: { uisp: '50000.00', iwana: '40000.00' },
          },
        ],
      },
    });
    const reconcileSpy = jest.spyOn(migrationApi, 'reconcile').mockImplementation(async () => {
      getSpy.mockResolvedValue(reconciled);
      return reconciled.reconciliation!;
    });
    const user = userEvent.setup();
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    await user.click(await screen.findByRole('button', { name: 'Conciliar' }));
    await waitFor(() => expect(reconcileSpy).toHaveBeenCalledWith(BATCH_ID));
    expect(await screen.findByText('Hay diferencias con UISP')).toBeInTheDocument();
    expect(screen.getByText(/2 de 3 suscriptores coinciden/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Diferencias por suscriptor' });
    expect(within(table).getByRole('link', { name: 'Cliente 77 de UISP' })).toHaveAttribute(
      'href',
      `/dashboard/crm/subscribers/${SUBSCRIBER_ID}`,
    );
  });

  it('avisa de equivalencias pendientes y las guarda con el catálogo real', async () => {
    jest.spyOn(migrationApi, 'pendingMappings').mockResolvedValue(PENDING);
    jest
      .spyOn(billingCyclesApi, 'list')
      .mockResolvedValue([
        { cycleDay: 5, cutoffDay: 20, active: true, nextCutoffDate: '2026-11-20' },
      ]);
    const plansSpy = jest.spyOn(commercialApi, 'getPlans');
    const createSpy = jest.spyOn(migrationApi, 'createMapping').mockResolvedValue({} as never);
    const user = userEvent.setup();
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    expect(await screen.findByText('Hay valores sin equivalencia')).toBeInTheDocument();
    const select = await screen.findByLabelText('Equivale en iWana a');
    await user.selectOptions(select, '5');
    await user.click(
      screen.getByRole('button', { name: 'Guardar equivalencia de ciclo de facturación «Día 5»' }),
    );
    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        kind: 'CICLO',
        externalValue: '5',
        externalLabel: 'Día 5',
        action: 'EQUIVALE',
        targetRef: '5',
      }),
    );
    // Solo se piden los catálogos de los tipos pendientes.
    expect(plansSpy).not.toHaveBeenCalled();
  });

  it('error de carga con reintento', async () => {
    getSpy.mockRejectedValueOnce(new ApiError(404, 'MIGRATION_BATCH_NOT_FOUND', 'x'));
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    expect(await screen.findByText('El lote ya no existe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('promoción fallida: deja de sondear, la anuncia y permite reintentar Promover', async () => {
    jest.useFakeTimers();
    const failed = report({
      status: 'CARGADO',
      promotion: {
        procesamiento: 'FALLIDO',
        promovidos: {},
        existentes: {},
        rechazados: {},
        etiquetasAsignadas: 0,
        periodosSuspension: 0,
        aplicaciones: 0,
        iniciadoEn: '2026-11-12T10:02:00.000Z',
        terminadoEn: '2026-11-12T10:03:00.000Z',
      },
    } as Partial<MigrationBatchReport>);
    getSpy.mockResolvedValue(failed);
    const promoteSpy = jest
      .spyOn(migrationApi, 'promote')
      .mockResolvedValue({ id: BATCH_ID, status: 'CARGADO' });
    render(<MigrationBatchDetailClient batchId={BATCH_ID} />);
    expect(await screen.findByText('Promoción fallida')).toBeInTheDocument();
    expect(
      screen.getByText('La promoción del lote falló. Puedes intentar promoverlo de nuevo.'),
    ).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(getSpy).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Promover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Promover el lote' });
    await user.click(within(dialog).getByRole('button', { name: 'Promover' }));
    await waitFor(() => expect(promoteSpy).toHaveBeenCalledWith(BATCH_ID));
  });
});
