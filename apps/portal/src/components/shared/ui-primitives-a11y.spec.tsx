import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Button,
  CheckboxCard,
  DatePicker,
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
  FormField,
  Input,
  MultiSelect,
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

  it('should render input error messages with the AA error token instead of the raw base token', () => {
    render(<Input id="brand-url" label="URL" error="Ingresa una URL válida." />);

    const alert = screen.getByRole('alert');

    expect(alert).toHaveClass('text-iwana-error-700');
    expect(alert).toHaveClass('dark:text-red-300');
    expect(alert.className.split(/\s+/)).not.toContain('text-iwana-error');
  });

  it('should render select error messages with the AA error token while keeping the base token on the border', () => {
    render(
      <Select
        label="Área"
        error="Selecciona un área."
        options={[{ value: 'ops', label: 'Operaciones' }]}
      />,
    );

    const message = screen.getByText('Selecciona un área.');
    const trigger = screen.getByRole('combobox', { name: 'Área' });

    expect(message).toHaveClass('text-iwana-error-700');
    expect(message).toHaveClass('dark:text-red-300');
    expect(message.className.split(/\s+/)).not.toContain('text-iwana-error');
    expect(trigger).toHaveClass('border-iwana-error');
  });

  it('should render multi-select error messages with the AA error token', () => {
    render(
      <MultiSelect
        label="Áreas"
        error="Selecciona al menos un área."
        value={[]}
        onChange={() => undefined}
        options={[{ value: 'ops', label: 'Operaciones' }]}
      />,
    );

    const message = screen.getByText('Selecciona al menos un área.');
    const trigger = screen.getByRole('combobox', { name: 'Áreas' });

    expect(message).toHaveClass('text-iwana-error-700');
    expect(message).toHaveClass('dark:text-red-300');
    expect(message.className.split(/\s+/)).not.toContain('text-iwana-error');
    expect(trigger).toHaveClass('border-red-400');
  });

  it('should render date picker error messages with the AA error token', () => {
    render(<DatePicker label="Fecha" error="Selecciona una fecha." />);

    const message = screen.getByRole('alert');
    const trigger = screen.getByRole('button', { name: 'Fecha' });

    expect(message).toHaveClass('text-iwana-error-700');
    expect(message).toHaveClass('dark:text-red-300');
    expect(message.className.split(/\s+/)).not.toContain('text-iwana-error');
    expect(trigger).toHaveClass('border-red-500');
  });

  it('should render form field error messages with the AA error token while keeping the base token on the required marker', () => {
    const { container } = render(
      <FormField label="Nombre" error="El nombre es obligatorio." required>
        <input />
      </FormField>,
    );

    const message = screen.getByRole('alert');
    const requiredMarker = container.querySelector('label span');

    expect(message).toHaveClass('text-iwana-error-700');
    expect(message).toHaveClass('dark:text-red-300');
    expect(message.className.split(/\s+/)).not.toContain('text-iwana-error');
    expect(requiredMarker).not.toBeNull();
    expect(requiredMarker).toHaveClass('text-iwana-error');
  });

  it('should render otp digit text in error state with the AA error token while keeping the base token on the border', () => {
    render(<OtpInput value="123" onChange={() => undefined} error />);

    const fields = screen.getAllByRole('textbox');

    expect(fields).toHaveLength(6);
    for (const field of fields) {
      expect(field).toHaveClass('text-iwana-error-700');
      expect(field).toHaveClass('dark:text-red-300');
      expect(field.className.split(/\s+/)).not.toContain('text-iwana-error');
      expect(field).toHaveClass('border-iwana-error');
      expect(field).toHaveClass('focus:ring-iwana-error');
    }
  });

  it('should merge consumer aria-describedby with internal error ids without duplicates', () => {
    render(
      <Input
        id="brand-url"
        label="URL"
        error="Ingresa una URL válida."
        aria-describedby="brand-url-error guidance-a guidance-a"
      />,
    );

    const input = screen.getByLabelText('URL');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);

    expect(ids).toEqual(['brand-url-error', 'guidance-a']);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'brand-url-error');
  });

  it('should merge consumer aria-describedby with the helper id when there is no error', () => {
    render(
      <Input
        id="brand-url"
        label="URL"
        helperText="Escribe una URL HTTPS."
        aria-describedby="guidance-b"
      />,
    );

    const input = screen.getByLabelText('URL');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);

    expect(ids).toEqual(['brand-url-helper', 'guidance-b']);
    expect(document.getElementById('brand-url-helper')).toBeInTheDocument();
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

  it('should render the checkbox card label with light surface tokens and intact dark classes', () => {
    render(<CheckboxCard label="Notificaciones" description="Recibe alertas por correo" />);

    const label = screen.getByRole('checkbox').closest('label');

    expect(label).not.toBeNull();
    expect(label).toHaveClass('bg-iwana-surface-soft/60');
    expect(label).toHaveClass('hover:bg-iwana-surface-soft');
    expect(label).toHaveClass('border-gray-200');
    expect(label).not.toHaveClass('bg-gray-50');
    expect(label).toHaveClass('dark:border-dark-border');
    expect(label).toHaveClass('dark:bg-dark-surface-3/60');
    expect(label).toHaveClass('dark:hover:bg-dark-surface-3');
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
