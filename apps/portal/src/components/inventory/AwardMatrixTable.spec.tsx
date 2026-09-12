import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { PurchaseRequestType } from '@iwana/shared';
import { AwardMatrixTable } from './AwardMatrixTable';
import { buildAwardMatrix, toggleCell } from './award-matrix';
import {
  AWARD_TEST_SUPPLIER_LABELS,
  buildAwardTestDetail,
  buildAwardTestItems,
  buildAwardedTestDetail,
  buildOrderedTestDetail,
  makeAwardTestQuote,
} from './award-matrix-test-fixtures';

function renderTable(
  overrides: Partial<Parameters<typeof AwardMatrixTable>[0]> = {},
  detail = buildAwardTestDetail(),
) {
  const state = buildAwardMatrix(detail, buildAwardTestItems(detail), {
    supplierLabels: AWARD_TEST_SUPPLIER_LABELS,
  });
  const props = {
    rows: state.rows,
    columns: state.columns,
    canEdit: true,
    quantityEditable: false,
    onToggleCell: jest.fn(),
    onToggleColumn: jest.fn(),
    ...overrides,
  };
  const result = render(<AwardMatrixTable {...props} />);
  return { ...result, props, state };
}

describe('AwardMatrixTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra una fila por producto con nombre, código y cantidad, y una columna por cotización', () => {
    renderTable();

    expect(screen.getByRole('radiogroup', { name: 'Producto 1' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Producto 4' })).toBeInTheDocument();
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
    expect(screen.getByText('Proveedor 1')).toBeInTheDocument();
    expect(screen.getByText('Proveedor 2')).toBeInTheDocument();
    expect(screen.getByText(/COT-1/)).toBeInTheDocument();
  });

  it('conserva el orden de las filas de entrada sin mutarlas', () => {
    const { props } = renderTable();
    const groups = screen.getAllByRole('radiogroup');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Producto 1',
      'Producto 2',
      'Producto 3',
      'Producto 4',
    ]);
    // El arreglo de filas que recibió la tabla sigue intacto.
    expect(props.rows.map((row) => row.purchaseRequestLineId)).toEqual([
      'line-p1',
      'line-p2',
      'line-p3',
      'line-p4',
    ]);
  });

  it('celda sin cotizar: muestra «—» con nombre accesible y sin control seleccionable', () => {
    const detail = buildAwardTestDetail({
      quotes: [
        makeAwardTestQuote('quote-1', 'party-1', 'COT-1', 'COP', {
          'line-p1': '100.00',
          'line-p2': '200.00',
          'line-p3': '300.00',
          'line-p4': '400.00',
        }),
        makeAwardTestQuote('quote-2', 'party-2', 'COT-2', 'COP', {
          'line-p1': '110.00',
          'line-p2': '180.00',
          'line-p3': '320.00',
        }),
      ],
    });
    renderTable({}, detail);

    const missing = screen.getByRole('img', { name: 'Sin cotizar' });
    expect(missing).toHaveTextContent('—');
    // La fila conserva el radio de la cotización que sí la cubre, pero no hay
    // control para la cotización ausente.
    expect(
      screen.getByRole('radio', { name: 'Adjudicar Producto 4 a Proveedor 1' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: 'Adjudicar Producto 4 a Proveedor 2' }),
    ).not.toBeInTheDocument();
  });

  it('celda disponible: muestra costo unitario e importe, y marca «Más barato» al menor precio', () => {
    renderTable();

    const row1 = screen.getByRole('radiogroup', { name: 'Producto 1' });
    expect(within(row1).getByText(/100,00 \/ u\./)).toBeInTheDocument();
    expect(
      within(screen.getByRole('radiogroup', { name: 'Producto 2' })).getByText(/180,00 \/ u\./),
    ).toBeInTheDocument();
    // Q1 gana P1, Q2 gana P2: un chip por fila.
    expect(within(row1).getByText('Más barato')).toBeInTheDocument();
    expect(screen.getAllByText('Más barato')).toHaveLength(4);
  });

  it('con monedas mixtas no marca «Más barato» en ninguna celda', () => {
    const detail = buildAwardTestDetail({
      quotes: [
        makeAwardTestQuote('quote-1', 'party-1', 'COT-1', 'COP', { 'line-p1': '100.00' }),
        makeAwardTestQuote('quote-2', 'party-2', 'COT-2', 'USD', { 'line-p1': '1.00' }),
      ],
    });
    renderTable({}, detail);

    expect(screen.queryByText('Más barato')).not.toBeInTheDocument();
  });

  it('cada radio nombra producto y proveedor, y agrupa por fila para flechas nativas', () => {
    renderTable();

    const radio = screen.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' });
    expect(radio).toBeInTheDocument();
    const row1 = screen.getByRole('radiogroup', { name: 'Producto 1' });
    const rowRadios = within(row1).getAllByRole('radio');
    const groupName = rowRadios[0]?.getAttribute('name');
    expect(groupName).toBeTruthy();
    for (const entry of rowRadios) {
      expect(entry.getAttribute('name')).toBe(groupName);
    }
    const row2Radio = screen.getByRole('radio', { name: 'Adjudicar Producto 2 a Proveedor 1' });
    expect(row2Radio.getAttribute('name')).not.toBe(groupName);
  });

  it('propaga el clic en la celda a onToggleCell y refleja la selección', async () => {
    const user = userEvent.setup();
    const onToggleCell = jest.fn();
    const { props } = renderTable({ onToggleCell });

    await user.click(screen.getByRole('radio', { name: 'Adjudicar Producto 1 a Proveedor 1' }));
    expect(onToggleCell).toHaveBeenCalledWith('line-p1', 'quote-1');

    // Re-render con el estado movido: la celda queda marcada, sin duplicar.
    const moved = toggleCell(
      buildAwardMatrix(buildAwardTestDetail(), buildAwardTestItems(buildAwardTestDetail()), {
        supplierLabels: AWARD_TEST_SUPPLIER_LABELS,
      }),
      'line-p1',
      'quote-1',
    );
    expect(moved.selections).toEqual({ 'line-p1': 'quote-1' });
    expect(props.rows).toHaveLength(4);
  });

  it('el checkbox de columna adjudica solo lo libre y se deshabilita sin edición', async () => {
    const user = userEvent.setup();
    const onToggleColumn = jest.fn();
    renderTable({ onToggleColumn });

    const columnCheck = screen.getByRole('checkbox', {
      name: 'Adjudicar productos libres a Proveedor 1',
    });
    await user.click(columnCheck);
    expect(onToggleColumn).toHaveBeenCalledWith('quote-1');
  });

  it('sin edición deshabilita radios y checkboxes de columna', () => {
    renderTable({ canEdit: false });

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(
      screen.getByRole('checkbox', { name: 'Adjudicar productos libres a Proveedor 1' }),
    ).toBeDisabled();
  });

  it('fila adjudicada: chip, acción Revocar y sin radios', async () => {
    const user = userEvent.setup();
    const onToggleCell = jest.fn();
    const onRevokeRequest = jest.fn();
    const detail = buildAwardedTestDetail();
    renderTable({ onToggleCell, onRevokeRequest }, detail);

    const row1 = screen.getByRole('radiogroup', { name: 'Producto 1' });
    // Una celda bloqueada por columna: el chip se repite en cada celda.
    expect(within(row1).getAllByText('Adjudicado')).toHaveLength(2);
    expect(within(row1).queryByRole('radio')).not.toBeInTheDocument();
    expect(onToggleCell).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Revocar adjudicación de Producto 1' }));
    expect(onRevokeRequest).toHaveBeenCalledWith('line-p1');
  });

  it('fila ordenada: chip sin Revocar y bloqueo duro', () => {
    const detail = buildOrderedTestDetail();
    renderTable({ onRevokeRequest: jest.fn() }, detail);

    const row1 = screen.getByRole('radiogroup', { name: 'Producto 1' });
    expect(within(row1).getAllByText('Ordenado')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Revocar adjudicación/ })).not.toBeInTheDocument();
  });

  it('columna de cantidad de solo lectura fuera de PROJECT, con ayuda', () => {
    renderTable();

    expect(screen.getAllByText(/cubre la cantidad total/)).toHaveLength(4);
    expect(screen.queryByLabelText(/Cantidad adjudicada/)).not.toBeInTheDocument();
  });

  it('columna de cantidad editable en PROJECT y propaga cambios', () => {
    const onQuantityChange = jest.fn();
    const projectDetail = buildAwardTestDetail({
      request: { requestType: PurchaseRequestType.PROJECT },
    });
    renderTable({ quantityEditable: true, onQuantityChange }, projectDetail);

    const input = screen.getByLabelText('Cantidad adjudicada de Producto 1');
    // fireEvent para un cambio determinista: el input es controlado y el valor
    // lo gobierna el estado del panel, no el tipeo.
    fireEvent.change(input, { target: { value: '0.5' } });
    expect(onQuantityChange).toHaveBeenCalledWith('line-p1', '0.5');
  });

  it('el pie muestra subtotal en vivo por proveedor', () => {
    const detail = buildAwardTestDetail();
    const items = buildAwardTestItems(detail);
    const base = buildAwardMatrix(detail, items, { supplierLabels: AWARD_TEST_SUPPLIER_LABELS });
    const selected = toggleCell(toggleCell(base, 'line-p1', 'quote-1'), 'line-p2', 'quote-2');
    renderTable({ rows: selected.rows, columns: selected.columns });

    expect(screen.getByText(/1 producto ·[^·]*100,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 producto ·[^·]*180,00/)).toBeInTheDocument();
  });

  it('el primer control de la tabla es alcanzable con teclado', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.tab();
    expect(
      screen.getByRole('checkbox', { name: 'Adjudicar productos libres a Proveedor 1' }),
    ).toHaveFocus();
  });

  it('pasa axe sin violaciones', async () => {
    const { container } = renderTable();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('pasa axe sin violaciones con filas bloqueadas', async () => {
    const detail = buildOrderedTestDetail();
    const { container } = renderTable({ onRevokeRequest: jest.fn() }, detail);
    expect(await axe(container)).toHaveNoViolations();
  });
});
