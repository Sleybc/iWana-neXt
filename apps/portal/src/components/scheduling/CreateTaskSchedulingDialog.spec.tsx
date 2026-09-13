import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTaskSchedulingDialog } from './CreateTaskSchedulingDialog';
import { TaskExecutionMode, TaskRecipientType, TaskType } from '@iwana/shared';

// F5 (spec de diseño §4.8): el responsable se elige con el typeahead
// `GET /users/search`; el resto del api-client real no se invoca aquí.
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    usersApi: {
      ...actual.usersApi,
      searchForPicker: jest.fn().mockResolvedValue({
        data: [{ id: 'user-123', label: 'Laura Ruiz', sublabel: 'laura@demo.co' }],
        total: 1,
      }),
    },
  };
});

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');
  return {
    ...actual,
    DatePicker: ({ label, value, onChange, id }: any) => (
      <div>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          aria-label={label}
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
        />
      </div>
    ),
    Select: ({ id, label, value, onChange, options = [], placeholder }: any) => (
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <select id={id} aria-label={label} value={value} onChange={onChange}>
          <option value="">{placeholder ?? 'Selecciona'}</option>
          {options.map((option: any) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    ),
  };
});

describe('CreateTaskSchedulingDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    initialValues: null,
    technicians: [],
    internalAreaOptions: [{ value: 'operations-area', label: 'Operaciones' }],
    onSubmit: jest.fn(),
    isSubmitting: false,
    error: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides agenda fields until execution mode requires scheduling', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<CreateTaskSchedulingDialog {...defaultProps} onSubmit={onSubmit} />);

    expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fecha de visita')).not.toBeInTheDocument();

    // Completar Paso 1
    await user.type(screen.getByLabelText('Titulo'), 'Instalacion de servicio');
    await user.type(screen.getByLabelText('Responsable'), 'Lau');
    await user.click(await screen.findByRole('option', { name: /Laura Ruiz/ }));
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');

    // Click Continuar para ir al Paso 2 (Agenda)
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => {
      expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Fecha de visita')).toBeInTheDocument();
  });

  it('skips agenda step when execution mode is immediate', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(
      <CreateTaskSchedulingDialog
        {...defaultProps}
        initialValues={{ executionMode: TaskExecutionMode.IMMEDIATE }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('Paso 1 de 2')).toBeInTheDocument();

    // Completar Paso 1
    await user.type(screen.getByLabelText('Titulo'), 'Tarea Inmediata');
    await user.type(screen.getByLabelText('Responsable'), 'Lau');
    await user.click(await screen.findByRole('option', { name: /Laura Ruiz/ }));
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');

    // Click Continuar para ir al Paso 2 (OT)
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => {
      expect(screen.getByText('Paso 2 de 2')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Fecha de visita')).not.toBeInTheDocument();
    expect(screen.getByText('Continuidad operativa')).toBeInTheDocument();
  });
});
