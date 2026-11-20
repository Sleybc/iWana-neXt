import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketStatus,
  UserRole,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CommentsService } from '../services/comments.service';
import { TicketAttachmentsService } from '../services/ticket-attachments.service';
import { TicketsService } from '../services/tickets.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
  summarizeErrorForLog: jest.fn().mockReturnValue('error'),
  SupportTicket: class SupportTicket {},
  TicketComment: class TicketComment {},
  TicketCommentAttachment: class TicketCommentAttachment {},
  TicketSlaPolicy: class TicketSlaPolicy {},
  TicketWorkOrderLink: class TicketWorkOrderLink {},
}));

const TICKET = '11111111-1111-4111-8111-111111111111';
const ORDER = '55555555-5555-4555-8555-555555555555';
const USER = '44444444-4444-4444-8444-444444444444';
const support: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti',
  type: 'tenant',
};
const run = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

function managerFor(status: TicketStatus) {
  const ticket = { id: TICKET, tenantId: 'tenant-001', status, assignedUserId: null };
  return {
    findOne: jest.fn().mockResolvedValue(ticket),
    findOneByOrFail: jest.fn().mockResolvedValue(ticket),
    create: jest.fn((_e: unknown, value: object) => value),
    save: jest.fn(async (_e: unknown, value: object) => ({ id: 'row', ...value })),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

function setup(status: TicketStatus) {
  const manager = managerFor(status);
  run.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as unknown as QueryRunner));
  const timeline = { recordWithManager: jest.fn().mockResolvedValue(undefined) };
  const crm = {
    assertWritableReferences: jest.fn().mockResolvedValue(undefined),
    listContractIds: jest.fn().mockResolvedValue([]),
    findExpedienteId: jest.fn().mockResolvedValue(null),
  };
  const media = {
    inspect: jest.fn((file: { originalName: string; buffer: Buffer }) => ({
      ok: true,
      contentType: 'image/png',
      sizeBytes: file.buffer.length,
      filename: file.originalName,
    })),
    store: jest.fn().mockResolvedValue({ mediaAssetId: 'asset-1' }),
    startAnalysis: jest.fn().mockResolvedValue(undefined),
    removeObjects: jest.fn().mockResolvedValue(0),
  };
  const sla = {
    findApplicablePolicy: jest.fn().mockResolvedValue(null),
    calculateDeadlines: jest.fn().mockReturnValue({}),
    deriveBreachStatus: jest.fn().mockReturnValue('OK'),
  };
  const executionOrders = {
    linkTicketWithManager: jest.fn().mockResolvedValue({
      order: {
        id: ORDER,
        executionOrderNumber: 'OT-1',
        status: 'OPEN',
        result: null,
        closedAt: null,
      },
      outcome: 'LINKED',
    }),
  };
  const fieldService = { requestFieldService: jest.fn().mockResolvedValue(undefined) };
  return {
    manager,
    executionOrders,
    fieldService,
    comments: new CommentsService({} as DataSource, timeline as never, crm as never),
    attachments: new TicketAttachmentsService(
      {} as DataSource,
      timeline as never,
      crm as never,
      media as never,
    ),
    tickets: new TicketsService(
      {} as DataSource,
      sla as never,
      {} as never,
      timeline as never,
      fieldService as never,
      crm as never,
      undefined,
      executionOrders as never,
    ),
  };
}

type Ctx = ReturnType<typeof setup>;
const operations: Array<[string, (ctx: Ctx) => Promise<unknown>]> = [
  ['comentar', (c) => c.comments.addComment(TICKET, { body: 'Hola' }, support)],
  [
    'comentar con nota interna',
    (c) => c.comments.addComment(TICKET, { body: 'Nota', isInternal: true }, support),
  ],
  [
    'comentar con adjuntos',
    (c) =>
      c.attachments.createCommentWithAttachments(
        TICKET,
        { body: 'Evidencia', isInternal: false },
        [{ buffer: Buffer.from('png'), mimetype: 'image/png', originalname: 'a.png' }],
        support,
      ),
  ],
  ['reasignar', (c) => c.tickets.assign(TICKET, { assignedUserId: USER }, support)],
  [
    'cambiar área (assign)',
    (c) => c.tickets.assign(TICKET, { queueName: TicketQueue.NOC }, support),
  ],
  [
    'reasignar por actualización',
    (c) => c.tickets.update(TICKET, { assignedUserId: USER }, support),
  ],
  [
    'cambiar área por actualización',
    (c) => c.tickets.update(TICKET, { queueName: TicketQueue.NOC }, support),
  ],
  ['corregir asunto', (c) => c.tickets.update(TICKET, { subject: 'Asunto corregido' }, support)],
  ['corregir descripción', (c) => c.tickets.update(TICKET, { description: 'Detalle' }, support)],
  [
    'cambiar prioridad',
    (c) => c.tickets.update(TICKET, { priority: TicketPriority.HIGH }, support),
  ],
  [
    'cambiar decisión de campo',
    (c) => c.tickets.update(TICKET, { fieldDecision: TicketFieldDecision.NOT_REQUIRED }, support),
  ],
  [
    'vincular orden de trabajo',
    (c) => c.tickets.linkWorkOrder(TICKET, { workOrderId: ORDER }, support),
  ],
  [
    'vincular orden de ejecución',
    (c) => c.tickets.linkExecutionOrder(TICKET, { executionOrderId: ORDER }, support),
  ],
];

/** Solicitar visita: en terminales 409; en el resto conserva su propia validación de estado. */
const requestField = (c: Ctx) => c.tickets.requestFieldService(TICKET, { notes: null }, support);

describe('Ticket cerrado en solo lectura (spec 2026-11-20, CA-1/CA-2)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])('estado %s', (status) => {
    it.each(operations)(
      'rechaza %s con 409 TICKET_CLOSED_READ_ONLY sin escribir',
      async (_n, op) => {
        const ctx = setup(status);
        const error = await op(ctx).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: 'TICKET_CLOSED_READ_ONLY',
          message: 'Este ticket está cerrado. Si el caso continúa, crea uno nuevo.',
        });
        expect(ctx.manager.save).not.toHaveBeenCalled();
        expect(ctx.executionOrders.linkTicketWithManager).not.toHaveBeenCalled();
        expect(ctx.manager.update).not.toHaveBeenCalled();
        // La comprobación usa la fila leída con bloqueo dentro de la transacción.
        expect(ctx.manager.findOne).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
        );
      },
    );
  });

  it.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])(
    'en %s solicitar visita responde 409 antes de la validación de estado, con bloqueo',
    async (status) => {
      const ctx = setup(status);
      await expect(requestField(ctx)).rejects.toMatchObject({
        response: { code: 'TICKET_CLOSED_READ_ONLY' },
      });
      expect(ctx.fieldService.requestFieldService).not.toHaveBeenCalled();
      expect(ctx.manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    },
  );

  it('en RESOLVED solicitar visita no se bloquea: mantiene su 400 de estado', async () => {
    await expect(requestField(setup(TicketStatus.RESOLVED))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each(operations)('sobre RESOLVED permite %s', async (_n, op) => {
    const ctx = setup(TicketStatus.RESOLVED);
    await expect(op(ctx)).resolves.toBeDefined();
  });
});
