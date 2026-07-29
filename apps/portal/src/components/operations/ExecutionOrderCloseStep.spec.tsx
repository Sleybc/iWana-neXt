import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderResult } from '@iwana/shared';
import { ExecutionOrderCloseStep } from './ExecutionOrderCloseStep';

describe('ExecutionOrderCloseStep', () => {
  it('envía la referencia de firma del cliente cuando aplica', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(<ExecutionOrderCloseStep onSubmit={onSubmit} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Resumen de cierre' }),
      'Trabajo completado con ajuste menor',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Referencia de evidencia' }),
      'SIG-REF-001',
    );
    await user.click(screen.getByRole('combobox', { name: 'Forma de aceptación' }));
    await user.click(screen.getByRole('option', { name: 'Firma' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar OT' }));

    expect(onSubmit).toHaveBeenCalledWith({
      result: ExecutionOrderResult.EXECUTED,
      summary: 'Trabajo completado con ajuste menor',
      customerAcceptance: { artifactId: 'SIG-REF-001', method: 'SIGNATURE' },
    });
  });

  it('permite omitir aceptación solo cuando el flujo declara que no aplica', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(<ExecutionOrderCloseStep requiresCustomerAcceptance={false} onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox', { name: 'Resumen de cierre' }), 'No se ejecutó');
    await user.click(screen.getByRole('button', { name: 'Cerrar OT' }));

    expect(onSubmit).toHaveBeenCalledWith({
      result: ExecutionOrderResult.EXECUTED,
      summary: 'No se ejecutó',
    });
    expect(screen.queryByLabelText('Referencia de evidencia')).not.toBeInTheDocument();
  });
});
