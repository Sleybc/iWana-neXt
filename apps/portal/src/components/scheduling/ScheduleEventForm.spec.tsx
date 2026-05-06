import type { ChangeEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEventForm } from './ScheduleEventForm';

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');

  return {
    ...actual,
    Select: ({
      id,
      label,
      value,
      onChange,
      options = [],
      placeholder,
      error,
      disabled,
    }: {
      id?: string;
      label?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
      placeholder?: string;
      error?: string;
      disabled?: boolean;
    }) => (
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <select id={id} value={value} onChange={onChange} disabled={disabled}>
          <option value="">{placeholder ?? 'Selecciona'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <span>{error}</span>}
      </div>
    ),
  };
});

function buildTechnician() {
  return {
    id: 'tech-1',
    email: 'tecnico@demo.co',
    role: 'TECHNICIAN',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Luisa',
    lastName: 'Campos',
    phone: null,
    jobTitle: 'Técnica de campo',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
}

describe('ScheduleEventForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('valida campos requeridos antes de enviar', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByText('El título es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('Selecciona un técnico válido.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('bloquea franjas menores a 15 minutos', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título operativo'), {
      target: { value: 'Visita técnica centro' },
    });
    fireEvent.change(screen.getByLabelText('Técnico responsable'), {
      target: { value: 'tech-1' },
    });
    fireEvent.change(screen.getByLabelText('Inicio programado'), {
      target: { value: '2026-06-01T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Fin programado'), {
      target: { value: '2026-06-01T08:10' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(
      await screen.findByText('La duración mínima del evento es de 15 minutos.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('exige resumen cuando se habilita work order embebida', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título operativo'), {
      target: { value: 'Instalación rural' },
    });
    fireEvent.change(screen.getByLabelText('Técnico responsable'), {
      target: { value: 'tech-1' },
    });
    fireEvent.change(screen.getByLabelText('Inicio programado'), {
      target: { value: '2026-06-01T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Fin programado'), {
      target: { value: '2026-06-01T09:00' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Crear work order embebida/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByText('Resume la work order embebida.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rechaza coordenadas inválidas antes de enviar', async () => {
    const onSubmit = jest.fn();

    render(
      <ScheduleEventForm
        technicians={[buildTechnician()]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título operativo'), {
      target: { value: 'Instalación urbana' },
    });
    fireEvent.change(screen.getByLabelText('Técnico responsable'), {
      target: { value: 'tech-1' },
    });
    fireEvent.change(screen.getByLabelText('Inicio programado'), {
      target: { value: '2026-06-01T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Fin programado'), {
      target: { value: '2026-06-01T09:00' },
    });
    fireEvent.change(screen.getByLabelText('Latitud'), {
      target: { value: 'abc' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByText('La latitud debe ser un número válido.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
