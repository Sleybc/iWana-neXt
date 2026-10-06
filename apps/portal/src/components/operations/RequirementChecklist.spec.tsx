import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequirementChecklist, type RequirementChecklistItem } from './RequirementChecklist';

function items(): RequirementChecklistItem[] {
  return [
    {
      key: 'a',
      label: 'Instalación verificada',
      kind: 'ACTIVITY',
      required: true,
      state: 'satisfied',
    },
    {
      key: 'b',
      label: 'Foto de servicio',
      kind: 'EVIDENCE',
      required: true,
      state: 'pending',
      reason: 'Falta la foto publicada.',
    },
    { key: 'c', label: 'Bitácora opcional', kind: 'ACTIVITY', required: false, state: 'pending' },
    { key: 'd', label: 'Prueba evaluada', kind: 'MEASUREMENT', required: true, state: 'unknown' },
  ];
}
describe('RequirementChecklist', () => {
  it('omite captura cuando la evaluación es desconocida aunque reciba permiso y descriptor', () => {
    render(
      <RequirementChecklist
        items={[
          {
            ...items()[3]!,
            action: {
              kind: 'activity',
              requirementKey: 'd',
              activityType: 'INSTALLATION',
              action: 'REGISTER_ACTIVITY',
            },
          },
        ]}
        mode="action"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Estado no disponible')).toBeInTheDocument();
  });
  it('presenta los cuatro estados y conserva el orden del snapshot', () => {
    render(<RequirementChecklist items={items()} mode="readonly" progress={50} />);
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Cumplido'),
      expect.stringContaining('Pendiente'),
      expect.stringContaining('Sin registrar'),
      expect.stringContaining('Estado no disponible'),
    ]);
    expect(screen.getByRole('progressbar')).toHaveValue(50);
    expect(screen.getByText('Falta la foto publicada.')).toBeInTheDocument();
    expect(screen.getAllByText('Opcional')).toHaveLength(1);
  });
  it('no convierte una evaluación opcional en una obligación de cierre', () => {
    render(<RequirementChecklist items={[items()[2]!]} mode="readonly" />);
    expect(screen.getByText('Sin registrar')).toBeInTheDocument();
    expect(screen.getByText(/no bloquea el cierre/)).toBeInTheDocument();
    expect(screen.queryByText(/antes de cerrar/)).toBeNull();
  });
  it('omite acciones en lectura aunque reciba un descriptor', () => {
    render(
      <RequirementChecklist
        items={[
          {
            ...items()[0]!,
            action: {
              kind: 'activity',
              requirementKey: 'a',
              activityType: 'INSTALLATION',
              action: 'REGISTER_ACTIVITY',
            },
          },
        ]}
        mode="readonly"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('mantiene razón e historial al abrir la acción del requisito', async () => {
    const onSelect = jest.fn();
    render(
      <RequirementChecklist
        items={[
          {
            ...items()[1]!,
            history: <p>Registro de esta foto</p>,
            action: {
              kind: 'evidence',
              requirementKey: 'b',
              evidenceType: 'PHOTO',
              action: 'REGISTER_EVIDENCE',
            },
          },
        ]}
        mode="action"
        onSelectRequirement={onSelect}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button'));
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-controls');
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.getByText('Falta la foto publicada.')).toBeInTheDocument();
    expect(screen.getByText('Registro de esta foto')).toBeInTheDocument();
  });
  it('bloquea realmente las acciones offline', () => {
    render(
      <RequirementChecklist
        items={[
          {
            ...items()[0]!,
            action: {
              kind: 'activity',
              requirementKey: 'a',
              activityType: 'INSTALLATION',
              action: 'REGISTER_ACTIVITY',
            },
          },
        ]}
        mode="action"
        offline
      />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('carga y error conservan la estructura sin inventar requisitos', () => {
    const { rerender } = render(<RequirementChecklist items={[]} mode="readonly" loading />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    rerender(
      <RequirementChecklist
        items={items()}
        mode="readonly"
        error={{ message: 'Error de lectura', onRetry: jest.fn() }}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(4);
  });
});
