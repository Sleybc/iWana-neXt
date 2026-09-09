import { fireEvent, render, screen } from '@testing-library/react';
import { PORTAL_MODAL_DRAWER_STATE_EVENT } from '@/components/shared/portal-side-drawer-layers';
import type { Contract, Subscriber360Response } from '@/lib/api-client';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { ConvertExpedienteToContractDialog } from './ConvertExpedienteToContractDialog';
import { CreateContractDialog } from './CreateContractDialog';

/**
 * Los tres diálogos de CRM adoptaron en M5 la capa única del ADR-075
 * (`fixed inset-0 z-(--z-modal)` con el velo `absolute inset-0` dentro y el panel
 * como hermano posterior) pero se quedaron colgando del árbol de la página: sin
 * `createPortal`, un `fixed inset-0` se ancla al primer ancestro que le cree
 * bloque contenedor (`transform`, `filter`, `backdrop-filter`, `contain`,
 * `will-change`) y deja de cubrir el viewport — tapa el contenido y deja el
 * chrome FUERA del velo (INFORME-MOD12-…-DESENFOQUE-v3.0 §3.2; enmienda C-DS-04
 * §2bis, que exige la capa portalada a `document.body`).
 *
 * Lo que se asierta aquí es justo lo que un `container.querySelector` NO puede
 * ver: que la capa sea hija directa de `document.body` y quede fuera del nodo de
 * render. Por eso las consultas van contra `screen` / `document.body`.
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
  customerSegment: 'RESIDENTIAL',
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

const EXPEDIENTE_SUMMARY: NonNullable<Subscriber360Response['expedienteSummary']> = {
  id: 'exp-1',
  fullName: 'Ana Ruiz',
  status: 'QUALIFIED',
  source: null,
  createdAt: '2026-01-10T10:00:00.000Z',
  statusChangedAt: null,
  paymentMethod: 'PSE',
  billingCycle: 'Mensual',
  fiscalName: null,
  // Sin plan de interés no hay fetch en el montaje: el caso bajo prueba es la
  // capa, no la resolución del label del plan.
  interestedPlanId: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  commercialNotes: null,
};

/** Velo y panel son hermanos dentro de la capa; el velo va primero. */
function layerOf(dialog: HTMLElement): HTMLElement {
  const layer = dialog.parentElement;
  if (!layer) throw new Error('El diálogo no tiene capa contenedora.');
  return layer;
}

/**
 * El velo se localiza por el marcador que declara `ModalLayer`, no por rol: dejó
 * de ser un `<button>` etiquetado. La consulta va contra `document.body` porque
 * la capa está portalada; contra el contenedor de render sería siempre vacía.
 */
function veilOf(dialog: HTMLElement): HTMLElement {
  const veil = layerOf(dialog).querySelector<HTMLElement>('[data-portal-veil]');
  if (!veil) throw new Error('La capa no tiene velo.');
  return veil;
}

describe('diálogos de contrato de CRM — capa única portalada (ADR-075 + C-DS-04 §2bis)', () => {
  describe('ContractDetailDrawer', () => {
    it('monta la capa `--z-modal` como hija directa de document.body, fuera del árbol de render', () => {
      const { container } = render(
        <ContractDetailDrawer
          contract={CONTRACT}
          onClose={jest.fn()}
          onReload={jest.fn(async () => undefined)}
        />,
      );

      const dialog = screen.getByRole('dialog');
      const layer = layerOf(dialog);

      expect(layer).toHaveClass('fixed', 'inset-0', 'z-(--z-modal)');
      expect(layer.parentElement).toBe(document.body);
      expect(container.contains(dialog)).toBe(false);
    });

    it('conserva el velo `absolute inset-0` y su guarda: cierra en lectura, no cierra en edición', () => {
      const onClose = jest.fn();
      render(
        <ContractDetailDrawer
          contract={CONTRACT}
          onClose={onClose}
          onReload={jest.fn(async () => undefined)}
        />,
      );

      const veil = veilOf(screen.getByRole('dialog'));
      expect(veil.tagName).toBe('DIV');
      expect(veil).toHaveClass('absolute', 'inset-0');
      expect(veil).toHaveAttribute('aria-hidden', 'true');

      // Cierra en `mousedown`, no en `click`.
      fireEvent.mouseDown(veil);
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
      // En edición el velo queda inerte: sin handler no hay cierre accidental
      // de una edición en curso, y no queda un `<button>` que anunciar.
      fireEvent.mouseDown(veilOf(screen.getByRole('dialog')));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape cierra en lectura y solo cancela la edición mientras se edita', () => {
      const onClose = jest.fn();
      render(
        <ContractDetailDrawer
          contract={CONTRACT}
          onClose={onClose}
          onReload={jest.fn(async () => undefined)}
        />,
      );

      // Prerrequisito del velo sin `<button>`: Escape y el botón «Cerrar» de la
      // cabecera son el único affordance de cierre para teclado y AT.
      fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Editar contrato' })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('difusión del estado modal hacia el chrome', () => {
    it('difunde al montar y libera al desmontar, para que el chrome quede inerte', () => {
      const estados: boolean[] = [];
      const escucha = (event: Event) => {
        estados.push((event as CustomEvent<{ open: boolean }>).detail.open);
      };
      window.addEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, escucha);

      const { unmount } = render(
        <ContractDetailDrawer
          contract={CONTRACT}
          onClose={jest.fn()}
          onReload={jest.fn()}
          onRemove={jest.fn()}
        />,
      );

      // Sin esto el chrome queda bajo el velo pero tabulable: el foco escapa.
      expect(estados).toEqual([true]);

      unmount();

      expect(estados).toEqual([true, false]);

      window.removeEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, escucha);
    });
  });

  describe('ConvertExpedienteToContractDialog', () => {
    it('monta la capa `--z-modal` como hija directa de document.body, fuera del árbol de render', () => {
      const { container } = render(
        <ConvertExpedienteToContractDialog
          subscriberId="sub-1"
          expedienteSummary={EXPEDIENTE_SUMMARY}
          onClose={jest.fn()}
          onSuccess={jest.fn(async () => undefined)}
        />,
      );

      const dialog = screen.getByRole('dialog');
      const layer = layerOf(dialog);

      expect(layer).toHaveClass('fixed', 'inset-0', 'z-(--z-modal)');
      expect(layer.parentElement).toBe(document.body);
      expect(container.contains(dialog)).toBe(false);
    });

    it('cierra al pulsar el velo', () => {
      const onClose = jest.fn();
      render(
        <ConvertExpedienteToContractDialog
          subscriberId="sub-1"
          expedienteSummary={EXPEDIENTE_SUMMARY}
          onClose={onClose}
          onSuccess={jest.fn(async () => undefined)}
        />,
      );

      fireEvent.mouseDown(veilOf(screen.getByRole('dialog')));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape cierra el diálogo', () => {
      const onClose = jest.fn();
      render(
        <ConvertExpedienteToContractDialog
          subscriberId="sub-1"
          expedienteSummary={EXPEDIENTE_SUMMARY}
          onClose={onClose}
          onSuccess={jest.fn(async () => undefined)}
        />,
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('CreateContractDialog', () => {
    it('monta la capa `--z-modal` como hija directa de document.body, fuera del árbol de render', () => {
      const { container } = render(
        <CreateContractDialog
          subscriberId="sub-1"
          onClose={jest.fn()}
          onSuccess={jest.fn(async () => undefined)}
        />,
      );

      const dialog = screen.getByRole('dialog');
      const layer = layerOf(dialog);

      expect(layer).toHaveClass('fixed', 'inset-0', 'z-(--z-modal)');
      expect(layer.parentElement).toBe(document.body);
      expect(container.contains(dialog)).toBe(false);
    });

    it('cierra al pulsar el velo mientras no hay guardado en vuelo', () => {
      const onClose = jest.fn();
      render(
        <CreateContractDialog
          subscriberId="sub-1"
          onClose={onClose}
          onSuccess={jest.fn(async () => undefined)}
        />,
      );

      fireEvent.mouseDown(veilOf(screen.getByRole('dialog')));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape cierra el diálogo', () => {
      const onClose = jest.fn();
      render(
        <CreateContractDialog
          subscriberId="sub-1"
          onClose={onClose}
          onSuccess={jest.fn(async () => undefined)}
        />,
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
