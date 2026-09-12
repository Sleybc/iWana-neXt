import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AwardSelectionBar } from './AwardSelectionBar';
import {
  buildAwardMatrix,
  getAwardMatrixProgress,
  summarizeBySupplier,
  toggleCell,
} from './award-matrix';
import {
  AWARD_TEST_SUPPLIER_LABELS,
  buildAwardTestDetail,
  buildAwardTestItems,
  makeAwardTestQuote,
} from './award-matrix-test-fixtures';

function renderBar(
  overrides: Partial<Parameters<typeof AwardSelectionBar>[0]> = {},
  options: { selections?: Array<[string, string]>; mixed?: boolean } = {},
) {
  const detail =
    options.mixed === true
      ? buildAwardTestDetail({
          quotes: [
            makeAwardTestQuote('quote-1', 'party-1', 'COT-1', 'COP', {
              'line-p1': '100.00',
              'line-p2': '200.00',
            }),
            makeAwardTestQuote('quote-2', 'party-2', 'COT-2', 'USD', {
              'line-p3': '10.00',
              'line-p4': '20.00',
            }),
          ],
        })
      : buildAwardTestDetail();
  const items = buildAwardTestItems(detail);
  let state = buildAwardMatrix(detail, items, { supplierLabels: AWARD_TEST_SUPPLIER_LABELS });
  for (const [lineId, quoteId] of options.selections ?? []) {
    state = toggleCell(state, lineId, quoteId);
  }
  const progress = getAwardMatrixProgress(state);
  const props = {
    summaries: summarizeBySupplier(state),
    pendingCount: progress.pendingCount,
    totalCount: progress.totalCount,
    currencyMixed: state.currencyMixed,
    submitting: false,
    onSubmit: jest.fn(),
    onSaveOnly: jest.fn(),
    ...overrides,
  };
  const result = render(<AwardSelectionBar {...props} />);
  return { ...result, props, state };
}

describe('AwardSelectionBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('anuncia el avance con role status y live polite', () => {
    renderBar({}, { selections: [['line-p1', 'quote-1']] });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('1 de 4 productos adjudicados · 3 pendientes');
  });

  it('resume el caso canónico: dos proveedores y dos órdenes de compra', () => {
    renderBar(
      {},
      {
        selections: [
          ['line-p1', 'quote-1'],
          ['line-p3', 'quote-1'],
          ['line-p2', 'quote-2'],
          ['line-p4', 'quote-2'],
        ],
      },
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '4 de 4 productos adjudicados · 0 pendientes',
    );
    expect(screen.getByText(/Proveedor 1 · 2 productos/)).toBeInTheDocument();
    expect(screen.getByText(/Proveedor 2 · 2 productos/)).toBeInTheDocument();
    expect(screen.getByText('Se generarán 2 órdenes de compra')).toBeInTheDocument();
  });

  it('usa el singular con una sola orden', () => {
    renderBar({}, { selections: [['line-p1', 'quote-1']] });

    expect(screen.getByText('Se generarán 1 orden de compra')).toBeInTheDocument();
  });

  it('separa los totales por moneda sin mezclarlas', () => {
    renderBar(
      {},
      {
        mixed: true,
        selections: [
          ['line-p1', 'quote-1'],
          ['line-p3', 'quote-2'],
        ],
      },
    );

    expect(screen.getByText(/Proveedor 1 · 1 producto/)).toBeInTheDocument();
    expect(screen.getByText(/Proveedor 2 · 1 producto/)).toBeInTheDocument();
    expect(screen.queryByText('Más barato')).not.toBeInTheDocument();
    expect(screen.getByText(/totales separados por moneda/)).toBeInTheDocument();
  });

  it('con cero selecciones deshabilita las CTAs y explica por qué', () => {
    renderBar();

    const submit = screen.getByRole('button', { name: 'Adjudicar y continuar' });
    const save = screen.getByRole('button', { name: 'Guardar adjudicación' });
    expect(submit).toBeDisabled();
    expect(save).toBeDisabled();
    const reason = screen.getByText('Selecciona al menos un producto en la matriz para adjudicar.');
    expect(reason).toBeInTheDocument();
    expect(submit).toHaveAttribute('aria-describedby', reason.id);
    expect(save).toHaveAttribute('aria-describedby', reason.id);
    expect(screen.queryByText(/Se generarán/)).not.toBeInTheDocument();
  });

  it('con aviso contextual muestra esa razón en vez de la de selección vacía', () => {
    renderBar({
      emptySelectionNotice:
        'Todos los productos ya están adjudicados y tienen una orden de compra en curso.',
    });

    const reason = screen.getByText(
      'Todos los productos ya están adjudicados y tienen una orden de compra en curso.',
    );
    expect(reason).toBeInTheDocument();
    expect(
      screen.queryByText('Selecciona al menos un producto en la matriz para adjudicar.'),
    ).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Adjudicar y continuar' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-describedby', reason.id);
  });

  it('con selección habilita las CTAs, oculta el motivo y envía', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    const onSaveOnly = jest.fn();
    renderBar({ onSubmit, onSaveOnly }, { selections: [['line-p1', 'quote-1']] });

    const submit = screen.getByRole('button', { name: 'Adjudicar y continuar' });
    const save = screen.getByRole('button', { name: 'Guardar adjudicación' });
    expect(submit).toBeEnabled();
    expect(save).toBeEnabled();
    expect(
      screen.queryByText('Selecciona al menos un producto en la matriz para adjudicar.'),
    ).not.toBeInTheDocument();

    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(save);
    expect(onSaveOnly).toHaveBeenCalledTimes(1);
  });

  it('enviando deshabilita sin mostrar el motivo de vacío', () => {
    renderBar({ submitting: true }, { selections: [['line-p1', 'quote-1']] });

    expect(screen.getByRole('button', { name: 'Adjudicar y continuar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar adjudicación' })).toBeDisabled();
    expect(
      screen.queryByText('Selecciona al menos un producto en la matriz para adjudicar.'),
    ).not.toBeInTheDocument();
  });

  it('pasa axe sin violaciones con selección y sin ella', async () => {
    const first = renderBar({}, { selections: [['line-p1', 'quote-1']] });
    expect(await axe(first.container)).toHaveNoViolations();
    first.unmount();

    const second = renderBar();
    expect(await axe(second.container)).toHaveNoViolations();
  });
});
