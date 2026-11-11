// MOD05 Cierre de venta fase 2 · bloque A (D3, D-F2; CA-1, CA-3): orquestación del contrato
// automático tras el suscriptor. La persistencia real la cubre la integración con PostgreSQL.
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type { ContractAutoCreationIssue } from '@iwana/shared';
import {
  ContractAutoCreationService,
  describeContractAutoCreationIssue,
} from '../contract-auto-creation.service';
import type { ContractsService } from '../contracts.service';
import type { AuditService } from '../../../audit/audit.service';
import type { MailerService } from '../../../mailer/mailer.service';
import type { IActiveUserEmailReadPort } from '../../../access-control/ports/active-user-email-read.port';

const TENANT = { tenantId: 'ten-auto', schemaName: 'tenant_auto' };
let expedienteRows: Array<{ owner_id: string | null }> = [];

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: () => TENANT },
    runInTenantSchema: async (
      _ds: unknown,
      _schema: string,
      callback: (qr: unknown) => Promise<unknown>,
    ) => callback({ query: async () => expedienteRows, manager: { marker: 'manager' } }),
  };
});

const ISSUE: ContractAutoCreationIssue = {
  reason: 'MISSING_DATA',
  missing: ['PLAN', 'VAT_RESPONSIBILITY'],
  detectedAt: '2026-11-11T12:00:00.000Z',
};
const REQUEST = { subscriberId: 'sub-1', expedienteId: 'exp-1', actorId: 'actor-1' };

describe('ContractAutoCreationService', () => {
  const contracts = { createAutomaticFromExpediente: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const userEmails = { emailOf: jest.fn() };
  const config = { get: (_key: string, fallback?: unknown) => fallback };
  let service: ContractAutoCreationService;

  beforeEach(() => {
    jest.clearAllMocks();
    expedienteRows = [{ owner_id: 'owner-1' }];
    userEmails.emailOf.mockResolvedValue('responsable@example.test');
    service = new ContractAutoCreationService(
      {} as DataSource,
      contracts as unknown as ContractsService,
      audit as unknown as AuditService,
      mailer as unknown as MailerService,
      config as unknown as ConfigService,
      userEmails as unknown as IActiveUserEmailReadPort,
    );
  });

  it('crea el contrato con el actor del evento y no avisa a nadie', async () => {
    contracts.createAutomaticFromExpediente.mockResolvedValue({
      outcome: 'CREATED',
      contract: { id: 'ctr-1' },
    });

    await service.createForExpediente(REQUEST);

    expect(contracts.createAutomaticFromExpediente).toHaveBeenCalledWith(
      'sub-1',
      'exp-1',
      'actor-1',
    );
    expect(audit.log).not.toHaveBeenCalled();
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('si el expediente ya tiene contrato no hace nada más (idempotencia)', async () => {
    contracts.createAutomaticFromExpediente.mockResolvedValue({
      outcome: 'EXISTING',
      contract: null,
    });

    await service.createForExpediente(REQUEST);

    expect(audit.log).not.toHaveBeenCalled();
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('dato faltante: audita el aviso (solo códigos) y avisa al responsable comercial', async () => {
    contracts.createAutomaticFromExpediente.mockResolvedValue({
      outcome: 'MISSING_DATA',
      contract: null,
      issue: ISSUE,
    });

    await service.createForExpediente(REQUEST);

    expect(audit.log).toHaveBeenCalledWith({
      action: 'UPDATE',
      entityType: 'Subscriber',
      entityId: 'sub-1',
      userId: 'actor-1',
      newValue: {
        contractAutoCreationIssue: { missing: ['PLAN', 'VAT_RESPONSIBILITY'] },
        expedienteId: 'exp-1',
      },
    });
    expect(userEmails.emailOf).toHaveBeenCalledWith('owner-1', { marker: 'manager' });
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'responsable@example.test',
        subject: 'No se pudo crear el contrato de una venta',
        text: expect.stringContaining(
          'No se pudo crear el contrato: falta plan de la oportunidad, responsabilidad de IVA.',
        ),
      }),
    );
    const mail = mailer.sendMail.mock.calls[0]![0] as { text: string; html: string };
    expect(mail.text).toContain('http://localhost:3002/dashboard/crm/subscribers/sub-1');
    expect(mail.html).toContain('href="http://localhost:3002/dashboard/crm/subscribers/sub-1"');
  });

  it('sin responsable o sin correo el aviso queda solo en la ficha', async () => {
    contracts.createAutomaticFromExpediente.mockResolvedValue({
      outcome: 'MISSING_DATA',
      contract: null,
      issue: ISSUE,
    });
    expedienteRows = [{ owner_id: null }];
    await service.createForExpediente(REQUEST);
    expect(userEmails.emailOf).not.toHaveBeenCalled();

    expedienteRows = [{ owner_id: 'owner-1' }];
    userEmails.emailOf.mockResolvedValue(null);
    await service.createForExpediente(REQUEST);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('un fallo del correo no se propaga: el aviso ya quedó persistido', async () => {
    contracts.createAutomaticFromExpediente.mockResolvedValue({
      outcome: 'MISSING_DATA',
      contract: null,
      issue: ISSUE,
    });
    mailer.sendMail.mockRejectedValueOnce(new Error('smtp caído'));

    await expect(service.createForExpediente(REQUEST)).resolves.toBeUndefined();
  });

  it('un rechazo de negocio (titular bloqueado, cancelado) se registra y no tumba la conversión', async () => {
    contracts.createAutomaticFromExpediente.mockRejectedValueOnce(
      new ConflictException({ code: 'SUBSCRIBER_CANCELLED' }),
    );
    await expect(service.createForExpediente(REQUEST)).resolves.toBeUndefined();

    contracts.createAutomaticFromExpediente.mockRejectedValueOnce(
      new UnprocessableEntityException('sin código'),
    );
    await expect(service.createForExpediente(REQUEST)).resolves.toBeUndefined();
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('un error inesperado se propaga para que el pipeline lo registre y reintente', async () => {
    contracts.createAutomaticFromExpediente.mockRejectedValueOnce(new Error('conexión perdida'));
    await expect(service.createForExpediente(REQUEST)).rejects.toThrow('conexión perdida');
  });

  it('describe todos los códigos con etiquetas visibles', () => {
    expect(
      describeContractAutoCreationIssue({
        ...ISSUE,
        missing: [
          'PLAN',
          'INSTALLATION_ADDRESS',
          'CONTRACTUAL_AUTHORIZATION',
          'VAT_RESPONSIBILITY',
          'RUT_RESPONSIBILITIES',
          'NIT_VERIFICATION_DIGIT',
          'LEGAL_REPRESENTATIVE',
        ],
      }),
    ).toBe(
      'No se pudo crear el contrato: falta plan de la oportunidad, dirección del punto de ' +
        'servicio, autorización de tratamiento contractual, responsabilidad de IVA, ' +
        'responsabilidades del RUT, dígito de verificación del NIT, representante legal.',
    );
  });
});
