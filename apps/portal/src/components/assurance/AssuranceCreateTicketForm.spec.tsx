import type { ChangeEvent } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketType,
  PersonType,
} from '@iwana/shared';
import { subscribersApi } from '@/lib/api-client';
import { AssuranceCreateTicketForm } from './AssuranceCreateTicketForm';

jest.mock('@/lib/api-client', () => ({
  subscribersApi: { list: jest.fn() },
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

function buildAssignee() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'soporte@demo.co',
    role: 'SUPPORT',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    isOperationalResource: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Laura',
    lastName: 'Ruiz',
    phone: null,
    jobTitle: 'Soporte',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
}

const SUBSCRIBER_ID = '22222222-2222-4222-8222-222222222222';

function buildSubscriberListResponse() {
  return {
    data: [
      {
        id: SUBSCRIBER_ID,
        personType: PersonType.JURIDICA,
        commercialName: 'Acme Colombia',
        businessName: 'Acme Colombia SAS',
        firstName: null,
        lastName: null,
        city: 'Bogotá',
        email: 'soporte@acme.example',
        documentNumber: '900123456',
      },
    ],
    total: 1,
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  };
}

async function chooseSubscriber() {
  const picker = screen.getByRole('combobox', { name: 'Suscriptor' });
  fireEvent.change(picker, { target: { value: 'Acme' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Acme Colombia — Bogotá' }));
}

function fillSubject() {
  fireEvent.change(screen.getByLabelText('Asunto operativo'), {
    target: { value: 'Sin conectividad en bodega principal' },
  });
}

describe('AssuranceCreateTicketForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (subscribersApi.list as jest.Mock).mockResolvedValue(buildSubscriberListResponse());
  });

  it('valida el asunto antes de enviar', async () => {
    const onSubmit = jest.fn();

    render(
      <AssuranceCreateTicketForm
        assignees={[buildAssignee()]}
        slaPolicies={[]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));

    expect(await screen.findByText('El asunto es obligatorio.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('CA-SO-05 busca el suscriptor existente y envía su id seleccionado', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <AssuranceCreateTicketForm
        assignees={[buildAssignee()]}
        slaPolicies={[
          {
            id: 'policy-1',
            tenantId: 'tenant-1',
            name: 'Default',
            appliesToType: null,
            appliesToPriority: null,
            firstResponseMinutes: 60,
            resolutionMinutes: 240,
            isActive: true,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        ]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    expect(screen.queryByLabelText('Referencia del solicitante')).not.toBeInTheDocument();
    expect(
      screen.getByText('Busca y selecciona el suscriptor al que quedará vinculado este ticket'),
    ).toBeInTheDocument();
    await chooseSubscriber();
    fillSubject();
    fireEvent.change(screen.getByLabelText('Responsable'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.change(screen.getByLabelText('Cola funcional'), {
      target: { value: 'SUPPORT' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        ticket: {
          type: TicketType.CUSTOMER_INCIDENT,
          priority: TicketPriority.NORMAL,
          source: TicketSource.PORTAL,
          subject: 'Sin conectividad en bodega principal',
          requesterType: TicketRequesterType.SUBSCRIBER,
          requesterRefId: SUBSCRIBER_ID,
          fieldDecision: TicketFieldDecision.NOT_REQUIRED,
          assignedUserId: '11111111-1111-4111-8111-111111111111',
          queueName: 'SUPPORT',
        },
        followUpAction: 'ticket-only',
      });
    });

    expect(subscribersApi.list).toHaveBeenCalledWith(
      { search: 'Acme', limit: 20, page: 1 },
      undefined,
      { signal: expect.any(AbortSignal) },
    );
  });

  it('exige seleccionar un suscriptor antes de crear el ticket', async () => {
    const onSubmit = jest.fn();

    render(
      <AssuranceCreateTicketForm
        assignees={[]}
        slaPolicies={[]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    fillSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));

    expect(await screen.findByText('Selecciona un suscriptor')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('limpia la selección al cambiar el tipo y conserva la referencia libre para los demás tipos', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <AssuranceCreateTicketForm
        assignees={[]}
        slaPolicies={[]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
      />,
    );

    await chooseSubscriber();
    fireEvent.change(screen.getByLabelText('Tipo de solicitante'), {
      target: { value: TicketRequesterType.INTERNAL_USER },
    });

    const reference = screen.getByLabelText('Referencia del solicitante');
    expect(reference).toHaveValue('');
    fireEvent.change(reference, { target: { value: 'user-123' } });
    fillSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        ticket: expect.objectContaining({
          requesterType: TicketRequesterType.INTERNAL_USER,
          requesterRefId: 'user-123',
        }),
        followUpAction: 'ticket-only',
      });
    });
  });

  it('fija tipo e identidad recibidos desde la ficha como solo lectura', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <AssuranceCreateTicketForm
        assignees={[]}
        slaPolicies={[]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isSubmitting={false}
        error={null}
        subscriber={{ id: SUBSCRIBER_ID, label: 'Acme Colombia SAS', sublabel: 'Bogotá' }}
      />,
    );

    const subscriber = screen.getByLabelText('Suscriptor');
    expect(subscriber).toHaveAttribute('readonly');
    expect(subscriber).toHaveValue('Acme Colombia SAS');
    expect(screen.queryByRole('combobox', { name: 'Suscriptor' })).not.toBeInTheDocument();

    const requesterType = screen.getByLabelText('Tipo de solicitante');
    expect(requesterType).toBeDisabled();
    await userEvent.setup().selectOptions(requesterType, TicketRequesterType.INTERNAL_USER);
    expect(requesterType).toHaveValue(TicketRequesterType.SUBSCRIBER);

    fillSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        ticket: expect.objectContaining({
          requesterType: TicketRequesterType.SUBSCRIBER,
          requesterRefId: SUBSCRIBER_ID,
        }),
        followUpAction: 'ticket-only',
      });
    });
  });
});
