import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillingTable } from './billing-ui';

it('muestra cinco filas por página y permite llegar a la última', async () => {
  render(
    <BillingTable
      paginate
      label="Movimientos"
      columns={['Referencia']}
      rows={Array.from({ length: 6 }, (_, index) => ({
        id: String(index),
        cells: [`Movimiento ${index + 1}`],
      }))}
    />,
  );

  expect(screen.getAllByRole('row')).toHaveLength(6);
  expect(screen.queryByText('Movimiento 6')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /página 2/i }));
  expect(screen.getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText('Movimiento 6')).toBeVisible();
});
