import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AwardQuoteAccordion } from './AwardQuoteAccordion';
import { buildAwardMatrix, toggleCell } from './award-matrix';
import {
  AWARD_TEST_SUPPLIER_LABELS,
  buildAwardTestDetail,
  buildAwardTestItems,
  buildAwardedTestDetail,
  makeAwardTestQuote,
} from './award-matrix-test-fixtures';

function renderAccordion(
  overrides: Partial<Parameters<typeof AwardQuoteAccordion>[0]> = {},
  detail = buildAwardTestDetail(),
) {
  const state = buildAwardMatrix(detail, buildAwardTestItems(detail), {
    supplierLabels: AWARD_TEST_SUPPLIER_LABELS,
  });
  const props = {
    rows: state.rows,
    columns: state.columns,
    selections: state.selections,
    canEdit: true,
    onToggleCell: jest.fn(),
    onToggleColumn: jest.fn(),
    ...overrides,
  };
  const result = render(<AwardQuoteAccordion {...props} />);
  return { ...result, props, state };
}

describe('AwardQuoteAccordion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra una sección por cotización con sus productos y totales', async () => {
    const user = userEvent.setup();
    renderAccordion();

    // La primera sección abre por defecto; la segunda se expande con clic.
    expect(
      screen.getByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Proveedor 2/ }));
    expect(
      screen.getByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 2' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/0 productos ·[^·]*0,00/).length).toBeGreaterThan(0);
  });

  it('el checkbox propaga la selección y la refleja como marcado', async () => {
    const user = userEvent.setup();
    const onToggleCell = jest.fn();
    renderAccordion({ onToggleCell });

    const checkbox = screen.getByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 1' });
    await user.click(checkbox);
    expect(onToggleCell).toHaveBeenCalledWith('line-p1', 'quote-1');
  });

  it('conserva la selección al re-renderizar y avisa del movimiento en la otra sección', async () => {
    const user = userEvent.setup();
    const detail = buildAwardTestDetail();
    const items = buildAwardTestItems(detail);
    const selected = toggleCell(
      buildAwardMatrix(detail, items, { supplierLabels: AWARD_TEST_SUPPLIER_LABELS }),
      'line-p1',
      'quote-1',
    );
    renderAccordion({
      rows: selected.rows,
      columns: selected.columns,
      selections: selected.selections,
    });

    expect(
      screen.getByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).toBeChecked();

    await user.click(screen.getByRole('button', { name: /Proveedor 2/ }));
    const other = screen.getByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 2' });
    expect(other).not.toBeChecked();
    expect(screen.getByText(/marcarlo aquí lo mueve/)).toBeInTheDocument();
  });

  it('muestra filas bloqueadas con chip y sin checkbox', async () => {
    const user = userEvent.setup();
    const detail = buildAwardedTestDetail();
    renderAccordion({}, detail);

    expect(screen.getByText('Adjudicado')).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 1' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Proveedor 2/ }));
    expect(
      screen.queryByRole('checkbox', { name: 'Adjudicar Producto 1 a Proveedor 2' }),
    ).not.toBeInTheDocument();
  });

  it('cada sección ofrece adjudicar sus productos libres', async () => {
    const user = userEvent.setup();
    const onToggleColumn = jest.fn();
    renderAccordion({ onToggleColumn });

    const buttons = screen.getAllByRole('button', { name: 'Adjudicar productos libres' });
    await user.click(buttons[0] as HTMLElement);
    expect(onToggleColumn).toHaveBeenCalledWith('quote-1');
  });

  it('lista solo los productos que cubre cada cotización', async () => {
    const user = userEvent.setup();
    const detail = buildAwardTestDetail({
      quotes: [
        makeAwardTestQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
        makeAwardTestQuote('quote-2', 'party-2', 'COT-2', 'COP', {
          'line-p1': '110.00',
          'line-p2': '180.00',
        }),
      ],
    });
    renderAccordion({}, detail);

    expect(
      screen.queryByRole('checkbox', { name: 'Adjudicar Producto 2 a Proveedor 1' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Proveedor 2/ }));
    expect(
      screen.getByRole('checkbox', { name: 'Adjudicar Producto 2 a Proveedor 2' }),
    ).toBeInTheDocument();
  });

  it('sin edición deshabilita los controles', () => {
    renderAccordion({ canEdit: false });

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled();
    }
    for (const button of screen.getAllByRole('button', { name: 'Adjudicar productos libres' })) {
      expect(button).toBeDisabled();
    }
  });

  it('las secciones son alcanzables con teclado', async () => {
    const user = userEvent.setup();
    const { container } = renderAccordion();

    const sectionButtons = within(container).getAllByRole('button');
    expect(sectionButtons.length).toBeGreaterThan(0);
    sectionButtons[0]?.focus();
    expect(sectionButtons[0]).toHaveFocus();
    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('pasa axe sin violaciones con todas las secciones abiertas', async () => {
    const user = userEvent.setup();
    const { container } = renderAccordion();

    await user.click(screen.getByRole('button', { name: /Proveedor 2/ }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
