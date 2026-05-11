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

    service = new CommentsService({} as DataSource, timelineService);
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
});
