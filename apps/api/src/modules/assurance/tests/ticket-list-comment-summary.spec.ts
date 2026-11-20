import type { DataSource, QueryRunner } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { UserRole } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import type { TicketAttachmentMediaPort } from '../ports/ticket-attachment-media.port';
import { canSeeInternal } from '../services/comment-visibility';
import { TicketAttachmentsService } from '../services/ticket-attachments.service';
import type { TimelineService } from '../services/timeline.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
  summarizeErrorForLog: jest.fn().mockReturnValue('error'),
  SupportTicket: class SupportTicket {},
  TicketComment: class TicketComment {},
  TicketCommentAttachment: class TicketCommentAttachment {},
}));

/** Resumen de comentarios del listado (spec MOD05 Soporte vista dividida §4, CA-9, CA-10). */
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const base: JwtPayload = {
  sub: 'user-001',
  email: 'resumen@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti',
  type: 'tenant',
};
const as = (role: UserRole): JwtPayload => ({ ...base, role });
const run = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

function build(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue(rows);
  run.mockImplementation(async (_ds, _schema, op) => op({ query } as unknown as QueryRunner));
  const service = new TicketAttachmentsService(
    {} as DataSource,
    {} as TimelineService,
    {} as CrmSubscriberReadPort,
    {} as TicketAttachmentMediaPort,
  );
  return { service, query };
}

describe('Resumen de comentarios del listado', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    [UserRole.ADMIN, true],
    [UserRole.NOC, true],
    [UserRole.SUPPORT, true],
    [UserRole.TECHNICIAN, false],
    [UserRole.CONTRACTOR, false],
  ])('regla única de internos: %s ve internos = %s', (role, expected) => {
    expect(canSeeInternal({ role })).toBe(expected);
  });

  it.each([
    [UserRole.SUPPORT, true],
    [UserRole.TECHNICIAN, false],
    [UserRole.CONTRACTOR, false],
  ])(
    '%s: una sola consulta para la página, con la bandera de internos = %s',
    async (role, flag) => {
      const { service, query } = build([]);
      await service.decorateTicketList({ data: [{ id: A }, { id: B }] }, as(role));
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(['tenant-001', [A, B], flag, 200]);
      // Las tres agregaciones usan la misma condición de visibilidad.
      expect(sql.match(/\(\$3::boolean OR c\.is_internal = FALSE\)/g)).toHaveLength(3);
      expect(sql).toContain('LATERAL');
    },
  );

  it('extracto solo con descripción vacía; ceros y nulos sin filas', async () => {
    const { service } = build([
      { ticket_id: A, attachment_count: 1, comment_count: 2, first_excerpt: 'Primer relato' },
      { ticket_id: B, attachment_count: 0, comment_count: 1, first_excerpt: 'Otro relato' },
    ]);
    const result = await service.decorateTicketList(
      {
        data: [
          { id: A, description: '   ' },
          { id: B, description: 'Ya tiene descripción' },
          { id: 'sin-filas', description: null },
        ],
      },
      as(UserRole.SUPPORT),
    );
    expect(result.data).toEqual([
      {
        id: A,
        description: '   ',
        attachmentCount: 1,
        commentCount: 2,
        firstCommentExcerpt: 'Primer relato',
      },
      {
        id: B,
        description: 'Ya tiene descripción',
        attachmentCount: 0,
        commentCount: 1,
        firstCommentExcerpt: null,
      },
      {
        id: 'sin-filas',
        description: null,
        attachmentCount: 0,
        commentCount: 0,
        firstCommentExcerpt: null,
      },
    ]);
  });

  it('página vacía: no consulta', async () => {
    const { service, query } = build([]);
    await expect(service.decorateTicketList({ data: [] }, base)).resolves.toEqual({ data: [] });
    expect(query).not.toHaveBeenCalled();
  });
});
