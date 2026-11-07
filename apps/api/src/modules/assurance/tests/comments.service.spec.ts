import { titularAnonymizedConflict } from '../../crm/subscribers/guards/titular-anonymized-conflict';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { TicketTimelineEventType, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CommentsService } from '../services/comments.service';
import { TimelineService } from '../services/timeline.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  SupportTicket: class SupportTicket {},
  TicketComment: class TicketComment {},
}));

describe('CommentsService', () => {
  let service: CommentsService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;
  let timelineService: jest.Mocked<TimelineService>;

  const technicianActor: JwtPayload = {
    sub: 'tech-001',
    email: 'tech@example.test',
    role: UserRole.TECHNICIAN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-tech',
    type: 'tenant',
  };

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

    timelineService = {
      recordWithManager: jest.fn().mockResolvedValue(undefined),
      listTimeline: jest.fn(),
    } as unknown as jest.Mocked<TimelineService>;

    service = new CommentsService({} as DataSource, timelineService, {
      assertWritableReferences: jest.fn().mockResolvedValue(undefined),
    } as never);
  });

  it('hides internal comments from restricted roles', async () => {
    const andWhereMock = jest.fn().mockReturnThis();

    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-001',
            tenantId: 'tenant-001',
            assignedUserId: technicianActor.sub,
          }),
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: andWhereMock,
            orderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
          }),
        },
      };
      return fn(mockQr as any);
    });

    await service.listComments('ticket-001', technicianActor);

    expect(andWhereMock).toHaveBeenCalledWith('c.is_internal = FALSE');
  });

  it('rejects comments on tickets assigned to another technician', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-002',
            tenantId: 'tenant-001',
            assignedUserId: 'tech-999',
          }),
        },
      };
      return fn(mockQr as any);
    });

    await expect(
      service.addComment(
        'ticket-002',
        { body: 'Necesito acceso', isInternal: true },
        technicianActor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('records a timeline event when adding a comment', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) => {
      const mockQr = {
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket-003',
            tenantId: 'tenant-001',
            assignedUserId: technicianActor.sub,
          }),
          create: jest.fn((_entity, payload) => payload),
          save: jest.fn().mockResolvedValue({
            id: 'comment-001',
            ticketId: 'ticket-003',
            tenantId: 'tenant-001',
            body: 'Comentario de avance',
            isInternal: false,
            authorUserId: technicianActor.sub,
          }),
        },
      };
      return fn(mockQr as any);
    });

    await service.addComment('ticket-003', { body: 'Comentario de avance' }, technicianActor);

    expect(timelineService.recordWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ticketId: 'ticket-003',
        tenantId: 'tenant-001',
        eventType: TicketTimelineEventType.COMMENT_ADDED,
        payload: expect.objectContaining({
          commentId: 'comment-001',
          isInternal: false,
        }),
      }),
    );
  });
  it('D-BT-7 el comentario propaga el 409 de CRM sin guardar texto', async () => {
    const guard = {
      assertWritableReferences: jest.fn().mockRejectedValue(titularAnonymizedConflict()),
    };
    const guarded = new CommentsService({} as DataSource, timelineService, guard as never);
    const save = jest.fn();
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'ticket',
            assignedUserId: technicianActor.sub,
            requesterType: 'SUBSCRIBER',
            requesterRefId: 'subscriber',
          }),
          save,
        },
      } as never),
    );
    await expect(
      guarded.addComment('ticket', { body: 'Sonda' }, technicianActor),
    ).rejects.toMatchObject({ status: 409, response: { code: 'PRIVACY_TITULAR_ANONYMIZED' } });
    expect(save).not.toHaveBeenCalled();
  });
});
