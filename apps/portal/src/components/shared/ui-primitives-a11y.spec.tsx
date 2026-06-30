import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  OtpInput,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@iwana/ui';

function DialogHarness() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agenda operativa</DialogTitle>
          <DialogDescription>
            Registra una actividad y confirma su contexto antes de guardarla.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="dialog-input">Nombre</label>
        <Input id="dialog-input" />
        <DialogClose asChild>
          <Button type="button">Cerrar</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

describe('shared ui primitives', () => {
  it('should render disabled buttons without the global opacity utility', () => {
    render(
      <Button type="button" variant="primary" disabled={true}>
        Guardar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Guardar' });

    expect(button).toHaveClass('disabled:cursor-not-allowed');
    expect(button.className).not.toContain('disabled:opacity-50');
    expect(button).toHaveClass('disabled:bg-gray-200');
  });

  it('should render disabled password inputs with explicit disabled styles and an inactive toggle', () => {
    render(<Input type="password" label="Clave" disabled={true} placeholder="Temporal" />);

    const input = screen.getByLabelText('Clave');
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });

    expect(input).toHaveClass('disabled:pointer-events-none');
    expect(input.className).not.toContain('disabled:opacity-50');
    expect(input).toHaveClass('disabled:bg-gray-50');
    expect(input).toHaveClass('disabled:text-gray-500');
    expect(toggle).toBeDisabled();
  });

  it('should render disabled select triggers without the global opacity utility', () => {
    render(
      <Select
        label="Área"
        disabled={true}
        placeholder="Selecciona una opción"
        options={[{ value: 'ops', label: 'Operaciones' }]}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Área' });

    expect(trigger).toHaveClass('disabled:pointer-events-none');
    expect(trigger.className).not.toContain('disabled:opacity-50');
    expect(trigger).toHaveClass('disabled:bg-gray-50');
  });

  it('should render disabled select options with explicit text styles', () => {
    render(
      <Select label="Equipo" placeholder="Selecciona una opción">
        <option value="noc">NOC</option>
        <option value="audit" disabled>
          Auditoría
        </option>
      </Select>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Equipo' }));

    const disabledOption = screen.getByRole('option', { name: 'Auditoría' });

    expect(disabledOption).toBeDisabled();
    expect(disabledOption.className).not.toContain('opacity-50');
    expect(disabledOption).toHaveClass('text-gray-400');
  });

  it('should render disabled tabs without the global opacity utility', () => {
    render(
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" disabled={true}>
            General
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const tab = screen.getByRole('tab', { name: 'General' });

    expect(tab).toHaveClass('disabled:pointer-events-none');
    expect(tab.className).not.toContain('disabled:opacity-50');
    expect(tab).toHaveClass('disabled:text-gray-400');
  });

  it('should render disabled dropdown items without the global opacity utility', () => {
    render(
      <DropdownMenu defaultOpen={true}>
        <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled={true}>Eliminar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const item = screen.getByRole('menuitem', { name: 'Eliminar' });

    expect(item).toBeDisabled();
    expect(item).toHaveClass('disabled:pointer-events-none');
    expect(item.className).not.toContain('disabled:opacity-50');
    expect(item).toHaveClass('disabled:text-gray-400');
  });

  it('should render disabled otp inputs with explicit disabled styles', () => {
    render(<OtpInput value="" onChange={() => undefined} disabled={true} />);

    const fields = screen.getAllByRole('textbox');

    expect(fields).toHaveLength(6);
    for (const field of fields) {
      expect(field).toBeDisabled();
      expect(field).toHaveClass('disabled:pointer-events-none');
      expect(field.className).not.toContain('disabled:opacity-50');
      expect(field).toHaveClass('disabled:bg-gray-50');
    }
  });

  it('should move focus into the dialog and restore it to the trigger when closed', async () => {
    const requestAnimationFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = jest
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    render(<DialogHarness />);

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre')).toHaveFocus();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it('should expose dialog title and description through aria metadata', async () => {
    render(<DialogHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    const dialog = await screen.findByRole('dialog', { name: 'Agenda operativa' });
    const title = screen.getByText('Agenda operativa');
    const description = screen.getByText(
      'Registra una actividad y confirma su contexto antes de guardarla.',
    );

    expect(title).toHaveAttribute('id');
    expect(description).toHaveAttribute('id');
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    expect(dialog).toHaveAttribute('aria-describedby', description.id);
  });
});
