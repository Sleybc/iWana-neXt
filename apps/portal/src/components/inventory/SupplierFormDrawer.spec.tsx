import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { PartyStatus, SupplierProfileStatus } from '@iwana/shared';
import type { SupplierProfileRecord } from '@/lib/api-client';
import { SESSION_RECOVERY_OPEN_EVENT } from '@/components/auth/SessionRecoveryModal';
import { SupplierFormDrawer } from './SupplierFormDrawer';

const SESSION_ERROR_MESSAGE = 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';

function buildSupplier(overrides: Partial<SupplierProfileRecord> = {}): SupplierProfileRecord {
  return {
    id: 'supplier-001',
    supplierCode: 'PROV-0001',
    partyRefId: 'party-ref-1',
    status: SupplierProfileStatus.ACTIVE,
    paymentTermsDays: 30,
    currency: 'COP',
    incoterm: null,
    defaultLeadTimeDays: null,
    purchasingContactName: null,
    purchasingContactEmail: null,
    purchasingContactPhone: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    party: {
      partyRefId: 'party-ref-1',
      displayName: 'Distribuciones Andinas',
      primaryContact: null,
      phone: null,
      email: null,
      city: null,
      status: PartyStatus.ACTIVE,
    },
    ...overrides,
  };
}

function renderDrawer(
  overrides: Partial<ComponentProps<typeof SupplierFormDrawer>> = {},
  supplier: SupplierProfileRecord | null = buildSupplier(),
) {
  const onCreate = jest.fn().mockResolvedValue(undefined);
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  const onSetStatus = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();

  render(
    <SupplierFormDrawer
      open={true}
      supplier={supplier}
      isSubmitting={false}
      error={null}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onSetStatus={onSetStatus}
      {...overrides}
    />,
  );

  return { onCreate, onUpdate, onSetStatus, onClose };
}

describe('SupplierFormDrawer — recuperación de sesión', () => {
  it('con fallo de sesión muestra CTA Iniciar sesión (abre el modal global) y Reintentar (reintenta el guardado)', async () => {
    const recoveryOpenHandler = jest.fn();
    window.addEventListener(SESSION_RECOVERY_OPEN_EVENT, recoveryOpenHandler);

    try {
      // El usuario ya había escrito notas cuando la sesión murió.
      const { onUpdate } = renderDrawer({
        error: SESSION_ERROR_MESSAGE,
        isSessionError: true,
      });

      await screen.findByRole('dialog', { name: 'Editar proveedor' });
      expect(screen.getByText('No fue posible guardar')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Notas'), {
        target: { value: 'Entrega los viernes' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
      expect(recoveryOpenHandler).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(
          'party-ref-1',
          expect.objectContaining({ notes: 'Entrega los viernes' }),
        );
      });

      // El drawer conserva lo escrito: el reemplazo del input no se perdió.
      expect(screen.getByLabelText('Notas')).toHaveValue('Entrega los viernes');
    } finally {
      window.removeEventListener(SESSION_RECOVERY_OPEN_EVENT, recoveryOpenHandler);
    }
  });

  it('sin fallo de sesión la alerta de error no ofrece los CTA de recuperación', async () => {
    renderDrawer({ error: 'El nombre del proveedor ya existe.', isSessionError: false });

    await screen.findByRole('dialog', { name: 'Editar proveedor' });
    expect(screen.getByText('No fue posible guardar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('sin error no hay alerta ni CTA de recuperación', async () => {
    renderDrawer({ error: null, isSessionError: true });

    await screen.findByRole('dialog', { name: 'Editar proveedor' });
    expect(screen.queryByText('No fue posible guardar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });
});
