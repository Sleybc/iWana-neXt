import type { ChangeEvent } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketType,
} from '@iwana/shared';
import { AssuranceCreateTicketForm } from './AssuranceCreateTicketForm';

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

describe('AssuranceCreateTicketForm', () => {
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

  it('envía el payload base sin opcionales vacíos', async () => {
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

    fireEvent.change(screen.getByLabelText('Asunto operativo'), {
      target: { value: 'Sin conectividad en bodega principal' },
    });
    fireEvent.change(screen.getByLabelText('Referencia del solicitante'), {
      target: { value: 'subscriber-001' },
    });
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
          requesterRefId: 'subscriber-001',
          fieldDecision: TicketFieldDecision.NOT_REQUIRED,
          assignedUserId: '11111111-1111-4111-8111-111111111111',
          queueName: 'SUPPORT',
        },
        followUpAction: 'ticket-only',
      });
    });
  });
});
