import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccessPermissionKey, AuditAction, SubscriberNoteListResponseSchema } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import type { AuditService } from '../../../audit/audit.service';
import { decryptAes256Gcm, encryptAes256Gcm } from '../../../../common/crypto/aes-gcm.util';
import { SubscriberNotesService } from './subscriber-notes.service';

const mockRunInTenantSchema = jest.fn();
jest.mock('@iwana/db', () => ({
  runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  TenantContext: {
    getOrThrow: () => ({ tenantId: 'tenant-1', schemaName: 'tenant_x', tenantSlug: 'x' }),
  },
}));

const SUBSCRIBER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const PARTY_ID = '33333333-3333-4333-8333-333333333333';
const NOTE_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_AT = new Date('2026-11-10T15:00:00.000Z');
const KEY = Buffer.alloc(32, 7);

describe('SubscriberNotesService', () => {
  let query: jest.Mock;
  let logWithin: jest.Mock;
  let log: jest.Mock;
  let activeMarks: jest.Mock;
  let permissions: string[];
  let service: SubscriberNotesService;
  let subscriberRows: unknown[];

  beforeEach(() => {
    mockRunInTenantSchema.mockReset();
    subscriberRows = [{ id: SUBSCRIBER_ID, party_id: PARTY_ID, anonymized_at: null }];
    permissions = [AccessPermissionKey.CRM_SUBSCRIBERS_READ];
    query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM subscribers')) return subscriberRows;
      if (sql.includes('COUNT(*)')) return [{ total: 3 }];
      if (sql.includes('INSERT INTO subscriber_note') || sql.includes('FROM subscriber_note')) {
        return [
          {
            id: NOTE_ID,
            subscriber_id: SUBSCRIBER_ID,
            body_encrypted: encryptAes256Gcm('Llamar en la tarde', KEY),
            created_by: ACTOR_ID,
            created_at: CREATED_AT,
          },
        ];
      }
      return [];
    });
    const qr = { query, manager: { marker: 'tx' } };
    mockRunInTenantSchema.mockImplementation(
      (_ds: unknown, _schema: string, work: (q: unknown) => unknown) => work(qr),
    );
    logWithin = jest.fn().mockResolvedValue(undefined);
    log = jest.fn().mockResolvedValue(undefined);
    activeMarks = jest.fn().mockResolvedValue({});
    service = new SubscriberNotesService(
      {} as DataSource,
      { logWithin, log } as unknown as AuditService,
      { getEffectivePermissionsForUser: jest.fn(async () => permissions) } as never,
      { activeMarks } as never,
      new ConfigService({
        MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('hex'),
        PII_ENCRYPTION_KEY: KEY.toString('hex'),
      }),
    );
  });

  describe('create', () => {
    it('inserta cifrado, bloquea la fila del titular y audita sin el texto', async () => {
      const note = await service.create(SUBSCRIBER_ID, '  Llamar en la tarde ', ACTOR_ID);

      expect(note).toEqual({
        id: NOTE_ID,
        subscriberId: SUBSCRIBER_ID,
        body: 'Llamar en la tarde',
        createdBy: ACTOR_ID,
        createdAt: CREATED_AT.toISOString(),
      });
      expect(query.mock.calls[0]?.[0]).toContain('FOR SHARE');
      expect(query.mock.calls[0]?.[1]).toEqual([SUBSCRIBER_ID, 'tenant-1']);
      const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT'));
      const params = insert?.[1] as string[];
      expect(params[0]).toBe(SUBSCRIBER_ID);
      expect(params[2]).toBe(ACTOR_ID);
      expect(params[1]).not.toContain('Llamar');
      expect(decryptAes256Gcm(params[1] as string, KEY, null)).toBe('Llamar en la tarde');
      expect(activeMarks).toHaveBeenCalledWith([PARTY_ID], { manager: { marker: 'tx' } });
      expect(logWithin).toHaveBeenCalledWith(
        {
          action: AuditAction.CREATE,
          entityType: 'SubscriberNote',
          entityId: NOTE_ID,
          userId: ACTOR_ID,
          newValue: { subscriberId: SUBSCRIBER_ID, bodyLength: 18 },
        },
        { marker: 'tx' },
      );
      expect(JSON.stringify(logWithin.mock.calls)).not.toContain('Llamar');
    });

    it.each(['   ', 'x'.repeat(2001)])('400 si la nota queda vacía o excede 2000', async (body) => {
      await expect(service.create(SUBSCRIBER_ID, body, ACTOR_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('404 si el suscriptor no existe en el tenant', async () => {
      subscriberRows = [];
      await expect(service.create(SUBSCRIBER_ID, 'x', ACTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(logWithin).not.toHaveBeenCalled();
    });

    it('409 PRIVACY_TITULAR_ANONYMIZED si el titular está anonimizado', async () => {
      subscriberRows = [{ id: SUBSCRIBER_ID, party_id: PARTY_ID, anonymized_at: new Date() }];
      const error = await service.create(SUBSCRIBER_ID, 'x', ACTOR_ID).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'PRIVACY_TITULAR_ANONYMIZED',
      });
      expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
    });

    it('409 PRIVACY_DATA_BLOCKED si el titular tiene datos bloqueados', async () => {
      activeMarks.mockResolvedValue({ [PARTY_ID]: ['DATOS_BLOQUEADOS'] });
      const error = await service.create(SUBSCRIBER_ID, 'x', ACTOR_ID).catch((e: unknown) => e);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'PRIVACY_DATA_BLOCKED',
      });
      expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
    });

    it('propaga el fallo de auditoría (misma transacción)', async () => {
      logWithin.mockRejectedValue(new Error('audit down'));
      await expect(service.create(SUBSCRIBER_ID, 'x', ACTOR_ID)).rejects.toThrow('audit down');
    });
  });

  describe('list', () => {
    it('pagina más reciente primero y registra el acceso', async () => {
      const result = await service.list(
        SUBSCRIBER_ID,
        { id: ACTOR_ID, role: 'ADMIN' },
        { page: 2, limit: 1 },
      );

      const select = query.mock.calls.find(([sql]) => String(sql).includes('ORDER BY'));
      expect(select?.[0]).toContain('ORDER BY created_at DESC, id DESC');
      expect(select?.[1]).toEqual([SUBSCRIBER_ID, 1, 1]);
      expect(result.data).toEqual([expect.objectContaining({ body: 'Llamar en la tarde' })]);
      expect(result.meta).toMatchObject({ total: 3, page: 2, limit: 1, hasMore: true });
      expect(SubscriberNoteListResponseSchema.parse(result)).toEqual(result);
      expect(logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.RECORD_ACCESS,
          entityId: SUBSCRIBER_ID,
          newValue: { role: 'ADMIN', resource: 'SubscriberNote' },
        }),
        { marker: 'tx' },
      );
    });

    it('403 con titular bloqueado sin permiso de lectura de bloqueados', async () => {
      activeMarks.mockResolvedValue({ [PARTY_ID]: ['DATOS_BLOQUEADOS'] });
      await expect(
        service.list(SUBSCRIBER_ID, { id: ACTOR_ID, role: 'SALES' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(log).toHaveBeenCalledWith({
        action: AuditAction.RECORD_ACCESS,
        entityType: 'Subscriber',
        entityId: SUBSCRIBER_ID,
        userId: ACTOR_ID,
        newValue: { role: 'SALES', resource: 'SubscriberNote' },
      });
      expect(logWithin).not.toHaveBeenCalled();
    });

    it('con CRM_BLOCKED_DATA_READ lee el bloqueado y deja la marca en la auditoría', async () => {
      permissions = [AccessPermissionKey.CRM_BLOCKED_DATA_READ];
      activeMarks.mockResolvedValue({ [PARTY_ID]: ['DATOS_BLOQUEADOS'] });
      await service.list(SUBSCRIBER_ID, { id: ACTOR_ID, role: 'ADMIN' });
      expect(logWithin.mock.calls[0]?.[0].newValue).toEqual({
        role: 'ADMIN',
        resource: 'SubscriberNote',
        privacyMark: 'DATOS_BLOQUEADOS',
        grantedBy: 'CRM_BLOCKED_DATA_READ',
      });
    });

    it('un titular anonimizado se lista sin consultar marcas', async () => {
      subscriberRows = [{ id: SUBSCRIBER_ID, party_id: PARTY_ID, anonymized_at: new Date() }];
      await service.list(SUBSCRIBER_ID, { id: ACTOR_ID, role: 'ADMIN' });
      expect(activeMarks).not.toHaveBeenCalled();
    });
  });
});
