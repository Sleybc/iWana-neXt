import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderResult } from '@iwana/shared';
import { ExecutionOrderCloseStep } from './ExecutionOrderCloseStep';

describe('ExecutionOrderCloseStep', () => {
  it('envía la referencia de firma del cliente cuando aplica', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(<ExecutionOrderCloseStep requiresCustomerSignature={true} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Nota de cierre'), 'Trabajo completado con ajuste menor');
    await user.type(screen.getByLabelText('Evidencia de firma del cliente'), 'SIG-REF-001');
    await user.click(screen.getByRole('button', { name: 'Cerrar OT' }));

    expect(onSubmit).toHaveBeenCalledWith({
      result: ExecutionOrderResult.EXECUTED,
      closeNotes: 'Trabajo completado con ajuste menor',
      customerSignatureRef: 'SIG-REF-001',
    });
  });
});
