import { fireEvent, render, screen } from '@testing-library/react';
import type { Contract } from '@/lib/api-client';
import { ContractCard } from './ContractCard';

/**
 * M8 quitó el literal `z-20` del cazador de clic exterior del menú de acciones y
 * lo dejó SIN escalón. Sin z, un cazador `fixed inset-0` queda por debajo de
 * cualquier hermano posicionado posterior con z > 0 y el clic sobre esa zona deja
 * de cerrar el menú — el contrato implícito de orden de documento que ADR-075
 * vino a eliminar.
 *
 * Contrato verificado aquí: cazador y menú comparten el escalón `--z-popover`
 * (el cazador es superficie transparente de captura, no capa visible: sube al
 * escalón del menú al que sirve) y el menú va DESPUÉS en orden de documento, que
 * es lo que lo hace pintar encima dentro del mismo escalón.
 */

const CONTRACT: Contract = {
  id: 'contract-1',
  tenantId: 'tenant-1',
  quoteId: null,
  subscriberId: 'sub-1',
  planId: 'plan-1',
  planSnapshotJson: { name: 'Plan Fibra 300' },
  status: 'ACTIVE',
  alias: 'Sede principal',
  installationAddress: 'Calle 1 # 2-3',
  installationCity: 'Bogotá',
  installationDepartment: 'Cundinamarca',
  installationPostalCode: '110111',
  installationNotes: null,
  customerSegment: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  paymentMethod: 'PSE',
  billingCycle: 'Mensual',
  fiscalName: null,
  fiscalDocument: null,
  fiscalAddress: null,
  startDate: null,
  endDate: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  deletedAt: null,
};

function renderCard() {
  return render(
    <ContractCard
      contract={CONTRACT}
      onTransition={jest.fn(async () => undefined)}
      onRemove={jest.fn(async () => undefined)}
      onViewDetail={jest.fn()}
    />,
  );
}

/** El cazador y el menú son los dos hermanos que el desplegable añade al abrirse. */
function menuParts(root: HTMLElement) {
  const catcher = root.querySelector<HTMLElement>('div.fixed.inset-0');
  if (!catcher) throw new Error('No hay cazador de clic exterior.');
  const menu = catcher.nextElementSibling as HTMLElement | null;
  if (!menu) throw new Error('El cazador no tiene menú hermano posterior.');
  return { catcher, menu };
}

describe('ContractCard — cazador de clic exterior en `--z-popover`', () => {
  it('cazador y menú comparten el escalón, con el menú después en orden de documento', () => {
    const { container } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones del contrato' }));
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeInTheDocument();

    const { catcher, menu } = menuParts(container);
    expect(catcher).toHaveClass('z-(--z-popover)');
    expect(menu).toHaveClass('z-(--z-popover)');
    expect(catcher.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('el clic sobre el cazador cierra el menú de acciones', () => {
    const { container } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones del contrato' }));
    expect(screen.getByRole('button', { name: 'Terminar' })).toBeInTheDocument();

    fireEvent.click(menuParts(container).catcher);

    expect(screen.queryByRole('button', { name: 'Terminar' })).not.toBeInTheDocument();
    expect(container.querySelector('div.fixed.inset-0')).toBeNull();
  });
});
