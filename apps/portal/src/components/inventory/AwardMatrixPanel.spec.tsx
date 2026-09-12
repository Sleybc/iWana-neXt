import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { PartyStatus, PurchaseRequestLineStatus, PurchaseRequestStatus } from '@iwana/shared';
import type { PurchaseRequestLineAwardInput } from '@iwana/shared';
import { purchasingApi } from '@/lib/api-client';
import { AwardMatrixPanel } from './AwardMatrixPanel';
import {
  AWARD_TEST_SUPPLIER_LABELS,
  buildAwardTestDetail,
  buildAwardTestItems,
  buildAwardedTestDetail,
  makeAwardTestAward,
  makeAwardTestLine,
  makeAwardTestOrder,
  makeAwardTestQuote,
} from './award-matrix-test-fixtures';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    purchasingApi: {
      ...actual.purchasingApi,
      searchSuppliers: jest.fn(),
    },
  };
});

const purchasingApiMock = purchasingApi as jest.Mocked<typeof purchasingApi>;

function renderPanel(
  overrides: Partial<Parameters<typeof AwardMatrixPanel>[0]> = {},
  detail = buildAwardTestDetail(),
) {
  const props = {
    detail,
    items: buildAwardTestItems(detail),
    supplierLabels: AWARD_TEST_SUPPLIER_LABELS,
    onDraftsChange: jest.fn(),
    ...overrides,
  };
  const result = render(<AwardMatrixPanel {...props} />);
  return { ...result, props };
}

describe('AwardMatrixPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra la cabecera con el conteo de cotizaciones y la validez más próxima', () => {
    const detail = buildAwardTestDetail({
      quotes: [
        makeAwardTestQuote(
          'quote-1',
          'party-1',
          'COT-1',
          'COP',
          { 'line-p1': '100.00' },
          {
            validUntil: '2026-12-01',
          },
        ),
        makeAwardTestQuote(
          'quote-2',
          'party-2',
          'COT-2',
          'COP',
          { 'line-p1': '110.00' },
          {
            validUntil: '2026-10-15',
          },
        ),
      ],
    });
    renderPanel({}, detail);

    expect(screen.getByText('Adjudicación')).toBeInTheDocument();
    expect(screen.getByText('Adjudicar productos a proveedores')).toBeInTheDocument();
    expect(screen.getByText(/Compara 2 cotizaciones por producto/)).toBeInTheDocument();
    expect(screen.getByText(/validez más próxima/)).toBeInTheDocument();
  });

  it('sin cotizaciones muestra el estado vacío con la CTA pendiente de FE-3', () => {
    renderPanel({}, buildAwardTestDetail({ quotes: [] }));

    expect(screen.getByText('Sin cotizaciones para comparar')).toBeInTheDocument();
    expect(
      screen.getByText('Registra al menos una cotización antes de adjudicar.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sin líneas de catálogo muestra el estado vacío correspondiente', () => {
    const detail = buildAwardTestDetail({
      lines: [
        makeAwardTestLine('line-free-1', { inventoryItemId: null }),
        makeAwardTestLine('line-free-2', { inventoryItemId: null }),
      ],
    });
    renderPanel({}, detail);

    expect(screen.getByText('Sin productos adjudicables')).toBeInTheDocument();
    expect(
      screen.getByText('Solo los productos de catálogo se pueden adjudicar en esta etapa.'),
    ).toBeInTheDocument();
  });

  it('solicitud no aprobada: avisa y deshabilita la edición', () => {
    const detail = buildAwardTestDetail({
      request: { status: PurchaseRequestStatus.PENDING_APPROVAL },
    });
    renderPanel({}, detail);

    expect(
      screen.getByText('La adjudicación solo está disponible cuando la solicitud está aprobada.'),
    ).toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });

  it('solicitud convertida en OC: banner de registro en vez del aviso de aprobación', () => {
    const detail = buildAwardTestDetail({
      request: { status: PurchaseRequestStatus.CONVERTED_TO_PO },
      lines: [
        makeAwardTestLine('line-p1', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeAwardTestLine('line-p2', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeAwardTestLine('line-p3', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
        makeAwardTestLine('line-p4', { lineStatus: PurchaseRequestLineStatus.ORDERED }),
      ],
      awards: [
        makeAwardTestAward('award-1', 'line-p1', 'party-1', 'quote-1', '1.00'),
        makeAwardTestAward('award-2', 'line-p2', 'party-2', 'quote-2', '1.00'),
        makeAwardTestAward('award-3', 'line-p3', 'party-1', 'quote-1', '1.00'),
        makeAwardTestAward('award-4', 'line-p4', 'party-2', 'quote-2', '1.00'),
      ],
      orders: [makeAwardTestOrder('order-1', 'party-1'), makeAwardTestOrder('order-2', 'party-2')],
    });
    renderPanel({}, detail);

    expect(
      screen.getByText(
        'La solicitud ya fue convertida en orden de compra: la adjudicación queda como registro y el seguimiento continúa en Abastecer.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('La adjudicación solo está disponible cuando la solicitud está aprobada.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Todos los productos ya están adjudicados y tienen una orden de compra en curso.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adjudicar y continuar' })).toBeDisabled();
  });

  it('monedas mixtas: alerta informativa y sin «Más barato»', () => {
    const detail = buildAwardTestDetail({
      quotes: [
        makeAwardTestQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
        makeAwardTestQuote('quote-2', 'party-2', 'COT-2', 'USD', { 'line-p1': '1.00' }),
      ],
    });
    renderPanel({}, detail);

    expect(
      screen.getByText(
        'Las cotizaciones están en monedas distintas: la comparación de precios está desactivada.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Más barato')).not.toBeInTheDocument();
  });

  it('error de servidor: alerta «No se pudo adjudicar»', () => {
    renderPanel({ error: 'Falla temporal del servicio.' });

    expect(screen.getByText('No se pudo adjudicar')).toBeInTheDocument();
    expect(screen.getByText('Falla temporal del servicio.')).toBeInTheDocument();
  });

  it('mover una marca no duplica: el draft emite la línea una sola vez', async () => {
    const user = userEvent.setup();
    const onDraftsChange = jest.fn();
    renderPanel({ onDraftsChange });

    await user.click(screen.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }));
    await user.click(screen.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 2' }));

    const lastCall: PurchaseRequestLineAwardInput[] =
      onDraftsChange.mock.calls[onDraftsChange.mock.calls.length - 1]?.[0] ?? [];
    const lineEntries = lastCall.filter((draft) => draft.purchaseRequestLineId === 'line-p1');
    expect(lineEntries).toHaveLength(1);
    expect(lineEntries[0]).toMatchObject({
      purchaseRequestLineId: 'line-p1',
      supplierQuoteId: 'quote-2',
      awardedPartyRefId: 'party-2',
      awardedQuantity: '1.00',
    });
  });

  it('la columna solo adjudica lo libre: no toca filas ya adjudicadas', async () => {
    const user = userEvent.setup();
    const onDraftsChange = jest.fn();
    const detail = buildAwardedTestDetail();
    renderPanel({ onDraftsChange }, detail);

    await user.click(
      screen.getByRole('checkbox', { name: 'Adjudicar productos libres a Proveedor 2' }),
    );

    const lastCall: PurchaseRequestLineAwardInput[] =
      onDraftsChange.mock.calls[onDraftsChange.mock.calls.length - 1]?.[0] ?? [];
    expect(lastCall.filter((draft) => draft.purchaseRequestLineId === 'line-p1')).toHaveLength(0);
    expect(lastCall).toHaveLength(3);
  });

  it('conmuta a acordeón manualmente conservando la selección', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }));
    await user.click(screen.getByRole('button', { name: 'Por cotización' }));

    expect(
      screen.getByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Matriz' }));
    expect(screen.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' })).toBeChecked();
  });

  it('con más de 3 cotizaciones arranca en acordeón y conserva la selección al volver', async () => {
    const user = userEvent.setup();
    const lineCosts = {
      'line-p1': '100.00',
      'line-p2': '200.00',
      'line-p3': '300.00',
      'line-p4': '400.00',
    };
    const detail = buildAwardTestDetail({
      quotes: [
        makeAwardTestQuote('quote-1', 'party-1', 'COT-1', 'COP', lineCosts),
        makeAwardTestQuote('quote-2', 'party-2', 'COT-2', 'COP', lineCosts),
        makeAwardTestQuote('quote-3', 'party-3', 'COT-3', 'COP', lineCosts),
        makeAwardTestQuote('quote-4', 'party-4', 'COT-4', 'COP', lineCosts),
      ],
    });
    renderPanel({}, detail);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Adjudicar Producto 2 a Proveedor 1' }));

    await user.click(screen.getByRole('button', { name: 'Matriz' }));
    expect(screen.getByRole('radio', { name: 'Adjudicar Producto 2 a Proveedor 1' })).toBeChecked();
  });

  it('revocar pide confirmación y llama con el awardId resuelto desde los locks', async () => {
    const user = userEvent.setup();
    const onRevokeAward = jest.fn().mockResolvedValue(true);
    const detail = buildAwardedTestDetail();
    renderPanel({ onRevokeAward }, detail);

    await user.click(screen.getByRole('button', { name: 'Revocar adjudicación de Producto 1' }));
    expect(screen.getByRole('heading', { name: 'Revocar adjudicación' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Revocar adjudicación' }));
    expect(onRevokeAward).toHaveBeenCalledWith('award-1');
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Revocar adjudicación' }),
      ).not.toBeInTheDocument();
    });
  });

  it('revocar se puede cancelar sin efectos', async () => {
    const user = userEvent.setup();
    const onRevokeAward = jest.fn().mockResolvedValue(true);
    const detail = buildAwardedTestDetail();
    renderPanel({ onRevokeAward }, detail);

    await user.click(screen.getByRole('button', { name: 'Revocar adjudicación de Producto 1' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onRevokeAward).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Revocar adjudicación' }),
      ).not.toBeInTheDocument();
    });
  });

  it('la escotilla exige costo unitario y persiste por el camino de costo aportado (CA-UX-10)', async () => {
    const user = userEvent.setup();
    const onDirectAward = jest.fn().mockResolvedValue(undefined);
    renderPanel({ onDirectAward });

    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Adjudicar a proveedor sin cotización' }),
    );

    // La matriz sigue montada detrás del diálogo.
    expect(screen.getByRole('radiogroup', { name: 'Producto 1' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    const dialogQueries = within(dialog);
    // Sin proveedor elegido el guardado sigue bloqueado aunque haya costo.
    await user.clear(dialogQueries.getByLabelText(/Costo unitario/));
    await user.type(dialogQueries.getByLabelText(/Costo unitario/), '150000');
    expect(dialogQueries.getByRole('button', { name: 'Guardar adjudicación' })).toBeDisabled();

    await user.click(dialogQueries.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByText('Adjudicar a proveedor sin cotización')).not.toBeInTheDocument();
    });
    expect(onDirectAward).not.toHaveBeenCalled();
  });

  it('la escotilla persiste con costo aportado y sin cotización vinculada', async () => {
    const user = userEvent.setup();
    const onDirectAward = jest.fn().mockResolvedValue(undefined);
    purchasingApiMock.searchSuppliers.mockResolvedValue({
      data: [
        { partyRefId: 'party-9', displayName: 'Proveedor Directo', status: PartyStatus.ACTIVE },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    renderPanel({ onDirectAward });

    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Adjudicar a proveedor sin cotización' }),
    );

    const dialogQueries = within(screen.getByRole('dialog'));
    const supplierBox = dialogQueries.getByRole('combobox', { name: 'Proveedor adjudicado' });
    await user.click(supplierBox);
    await user.type(supplierBox, 'Proveedor');
    await user.click(await dialogQueries.findByRole('option', { name: /Proveedor Directo/ }));
    await user.clear(dialogQueries.getByLabelText(/Costo unitario/));
    await user.type(dialogQueries.getByLabelText(/Costo unitario/), '250000');
    await user.click(dialogQueries.getByRole('button', { name: 'Guardar adjudicación' }));

    await waitFor(() => {
      expect(onDirectAward).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseRequestLineId: 'line-p1',
          awardedPartyRefId: 'party-9',
          awardedQuantity: '1.00',
          unitCost: '250000.00',
        }),
      );
    });
    expect(onDirectAward.mock.calls[0]?.[0]).not.toHaveProperty('supplierQuoteId');
  });

  it('el envío conecta la barra con el padre (FE-3): guardar y continuar emiten el draft', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onSaveOnly = jest.fn().mockResolvedValue(undefined);
    renderPanel({ onSubmit, onSaveOnly });

    await user.click(screen.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }));
    await user.click(screen.getByRole('button', { name: 'Guardar adjudicación' }));

    expect(onSaveOnly).toHaveBeenCalledWith([
      expect.objectContaining({
        purchaseRequestLineId: 'line-p1',
        supplierQuoteId: 'quote-1',
        awardedPartyRefId: 'party-1',
        awardedQuantity: '1.00',
      }),
    ]);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Adjudicar y continuar' }));
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ purchaseRequestLineId: 'line-p1' }),
    ]);
  });

  it('sin cotizaciones la CTA navega al tab Cotizar', async () => {
    const user = userEvent.setup();
    const onGoToQuotes = jest.fn();
    renderPanel({ onGoToQuotes }, buildAwardTestDetail({ quotes: [] }));

    await user.click(screen.getByRole('button', { name: 'Ir a cotizar' }));
    expect(onGoToQuotes).toHaveBeenCalledTimes(1);
  });

  it('la barra queda deshabilitada con motivo cuando no hay selección', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Adjudicar y continuar' })).toBeDisabled();
    expect(
      screen.getByText('Selecciona al menos un producto en la matriz para adjudicar.'),
    ).toBeInTheDocument();
  });

  it('pasa axe sin violaciones en matriz', async () => {
    const { container } = renderPanel();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('pasa axe sin violaciones en acordeón', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Por cotización' }));
    const accordion = within(container).getByText(/Proveedor 1 · COT-1/);
    expect(accordion).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
