import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '@iwana/ui';
import { RequirementActionSheet } from './RequirementActionSheet';
import type { RequirementActionDescriptor } from './execution-order-actions';

const action: RequirementActionDescriptor = {
  kind: 'activity',
  requirementKey: 'a',
  activityType: 'INSTALLATION',
  action: 'REGISTER_ACTIVITY',
};
describe('RequirementActionSheet', () => {
  it('compone un único submit nativo: click, Enter y Constraint Validation', async () => {
    const onSubmit = jest.fn();
    render(
      <RequirementActionSheet
        open
        action={action}
        status="idle"
        body={
          <form data-requirement-submit>
            <input aria-label="Dato obligatorio" required />
            <button type="submit">Registrar actividad</button>
          </form>
        }
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Guardar registro' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Registrar actividad' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Dato obligatorio'), 'Avance');
    await user.click(screen.getByRole('button', { name: 'Registrar actividad' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText('Dato obligatorio'));
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
  it('consume Escape durante guardado sin cancelar ni cerrar el overlay', async () => {
    const onCancel = jest.fn();
    const onEscapeOuter = jest.fn();
    render(
      <div onKeyDown={onEscapeOuter}>
        <RequirementActionSheet
          open
          action={action}
          status="loading"
          body={<input />}
          onCancel={onCancel}
          onSubmit={jest.fn()}
        />
      </div>,
    );
    await userEvent.setup().keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(onEscapeOuter).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });
  it('monta inline sin overlay y ofrece submit efectivo', async () => {
    const onSubmit = jest.fn();
    render(
      <RequirementActionSheet
        open
        action={action}
        status="idle"
        body={<input aria-label="Detalle" />}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading')).toHaveFocus();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar registro' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('consume Escape y devuelve foco al disparador', async () => {
    const onCancel = jest.fn();
    const onEscapeOuter = jest.fn();
    const trigger = document.createElement('button');
    trigger.id = 'requirement-trigger-a';
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(
      <div onKeyDown={onEscapeOuter}>
        <RequirementActionSheet
          open
          action={action}
          status="idle"
          body={<input aria-label="Detalle" />}
          onCancel={onCancel}
          onSubmit={jest.fn()}
        />
      </div>,
    );
    await userEvent.setup().keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEscapeOuter).not.toHaveBeenCalled();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
  it('deja que Escape cierre primero el selector y la siguiente pulsación cierre la hoja', async () => {
    const onCancel = jest.fn();
    const user = userEvent.setup();
    render(
      <RequirementActionSheet
        open
        action={action}
        status="idle"
        body={
          <Select
            label="Destino"
            options={[
              { value: 'one', label: 'Destino uno' },
              { value: 'two', label: 'Destino dos' },
            ]}
          />
        }
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Destino' });
    await user.click(select);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Registrar actividad' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  it.each(['loading', 'offline'] as const)('bloquea escritura y anuncia %s', (status) => {
    render(
      <RequirementActionSheet
        open
        action={action}
        status={status}
        body={<input aria-label="Detalle" />}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Detalle')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar registro' })).toBeDisabled();
    expect(screen.getAllByRole('status').some((node) => node.textContent)).toBe(true);
  });
  it('conserva captura ante error y anuncia éxito sin cumplimiento optimista', () => {
    const { rerender } = render(
      <RequirementActionSheet
        open
        action={action}
        status="error"
        errorMessage="No se guardó"
        body={<input aria-label="Detalle" defaultValue="Avance" />}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No se guardó');
    expect(screen.getByLabelText('Detalle')).toHaveValue('Avance');
    rerender(
      <RequirementActionSheet
        open
        action={action}
        status="success"
        body={<input aria-label="Detalle" defaultValue="Avance" />}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Registro guardado');
    expect(screen.queryByText('Cumplido')).toBeNull();
  });
  it('desmonta en lectura y reenfoca al cambiar de requisito', () => {
    const { rerender } = render(
      <RequirementActionSheet
        open={false}
        action={action}
        status="idle"
        body={<input />}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    rerender(
      <RequirementActionSheet
        open
        action={{ ...action, requirementKey: 'b' }}
        status="idle"
        body={<input />}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByRole('heading')).toHaveFocus();
  });
});
