import type { ChangeEvent, ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskExecutionMode, TaskOriginContext, TaskRecipientType } from '@iwana/shared';
import { crmApi, subscribersApi } from '@/lib/api-client';
import { TaskForm } from './TaskForm';

jest.mock('@/lib/api-client', () => ({
  crmApi: {
    listExpedientes: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'pros-1',
          fullName: 'Acme Prospecto',
          municipality: 'Bogota',
          emailPrimary: 'prospecto@acme.co',
          documentNumber: '123',
        },
      ],
      total: 1,
    }),
  },
  subscribersApi: {
    list: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'sub-1',
          commercialName: 'Suscriptor Demo',
          businessName: null,
          firstName: null,
          lastName: null,
          email: 'suscriptor@demo.co',
          documentNumber: '9001',
          city: 'Medellin',
        },
      ],
      total: 1,
    }),
  },
}));

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
    }: {
      id?: string;
      label?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
      placeholder?: string;
    }) => (
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <select id={id} aria-label={label} value={value} onChange={onChange}>
          <option value="">{placeholder ?? 'Selecciona'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    ),
  };
});

describe('TaskForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits task form with responsible and recipient fields', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <TaskForm
        responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
        internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
      />,
    );

    await user.type(screen.getByLabelText('Titulo'), 'Validar equipo retirado');
    await user.selectOptions(screen.getByLabelText('Responsable'), 'user-123');
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Validar equipo retirado',
          responsibleRefId: 'user-123',
          recipientType: 'INTERNAL_AREA',
          recipientRefId: 'operations-area',
        }),
        undefined,
      );
    });
  });

  it('requires due date when execution mode is due date', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <TaskForm
        responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
        internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
      />,
    );

    await user.type(screen.getByLabelText('Titulo'), 'Programar visita');
    await user.selectOptions(
      screen.getByLabelText('Modo de ejecucion'),
      TaskExecutionMode.DUE_DATE,
    );
    await user.selectOptions(screen.getByLabelText('Responsable'), 'user-123');
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    expect(
      screen.getByText('La fecha objetivo es obligatoria para este modo de ejecución.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('loads prospect recipients from existing crm records', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <TaskForm
        responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
        internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
      />,
    );

    await user.type(screen.getByLabelText('Titulo'), 'Llamar nuevo lead');
    await user.selectOptions(screen.getByLabelText('Responsable'), 'user-123');
    await user.selectOptions(
      screen.getByLabelText('Tipo de destinatario'),
      TaskRecipientType.PROSPECT,
    );
    await user.type(screen.getByLabelText('Buscar prospecto'), 'Ac');

    await waitFor(() => {
      expect(crmApi.listExpedientes).toHaveBeenCalledWith(
        { search: 'Ac', limit: 20, view: 'all' },
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    await user.click(await screen.findByRole('option', { name: /Acme Prospecto/i }));
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Llamar nuevo lead',
          recipientType: TaskRecipientType.PROSPECT,
          recipientRefId: 'pros-1',
          recipientLabel: 'Acme Prospecto',
        }),
        undefined,
      );
    });
  });

  it('loads subscriber recipients from existing records', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <TaskForm
        responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
        internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
      />,
    );

    await user.type(screen.getByLabelText('Titulo'), 'Confirmar visita tecnica');
    await user.selectOptions(screen.getByLabelText('Responsable'), 'user-123');
    await user.selectOptions(
      screen.getByLabelText('Tipo de destinatario'),
      TaskRecipientType.SUBSCRIBER,
    );
    await user.type(screen.getByLabelText('Buscar suscriptor'), 'Su');

    await waitFor(() => {
      expect(subscribersApi.list).toHaveBeenCalledWith(
        { search: 'Su', limit: 20, page: 1 },
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    await user.click(await screen.findByRole('option', { name: /Suscriptor Demo/i }));
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Confirmar visita tecnica',
          recipientType: TaskRecipientType.SUBSCRIBER,
          recipientRefId: 'sub-1',
          recipientLabel: 'Suscriptor Demo',
        }),
        undefined,
      );
    });
  });

  it('offers follow-up scheduling actions for tasks that require a visit', async () => {
    const user = userEvent.setup();

    render(
      <TaskForm
        responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
        internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        onSubmit={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Modo de ejecucion'),
      TaskExecutionMode.FIELD_SERVICE,
    );

    expect(screen.getByRole('button', { name: 'Agendar ahora' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar a pendientes' })).toBeInTheDocument();
  });

  it('shows execution mode before any scheduling fields and keeps responsible and recipient separated', async () => {
    render(
      <TaskForm
        responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
        internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        onSubmit={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText('Modo de ejecucion')).toBeInTheDocument();
    expect(screen.getByLabelText('Responsable')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de destinatario')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fecha de visita')).not.toBeInTheDocument();
  });

  it('submits ticketId and assurance origin when initialized from a ticket', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <TaskForm
        responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
        internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
        initialTicketId="ticket-123"
        initialOriginContext={TaskOriginContext.ASSURANCE}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
      />,
    );

    await user.type(screen.getByLabelText('Titulo'), 'Escalar revisión de avería');
    await user.selectOptions(screen.getByLabelText('Responsable'), 'user-123');
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Escalar revisión de avería',
          ticketId: 'ticket-123',
          originContext: TaskOriginContext.ASSURANCE,
          responsibleRefId: 'user-123',
          recipientRefId: 'operations-area',
        }),
        undefined,
      );
    });
  });
});
