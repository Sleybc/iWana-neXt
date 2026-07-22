/**
 * Ola E de MOD04 — consumidor BullMQ del alta masiva.
 *
 * El procesador es la frontera donde el contexto de tenant deja de ser ambiente
 * (`AsyncLocalStorage` no propaga a BullMQ) y pasa a viajar en `job.data`. Lo
 * que se fija aqui es que el procesador delega ese payload tal cual, sin
 * reconstruirlo ni completarlo desde ningun contexto de la peticion.
 *
 * SEGURIDAD: sin PII real.
 */

import type { Job } from 'bullmq';
import { USERS_BULK_CREATE_JOB, UserRole, type UsersBulkCreateJobPayload } from '@iwana/shared';
import { UsersBulkCreateProcessor } from '../users-bulk-create.processor';
import { UsersService } from '../users.service';

const PAYLOAD: UsersBulkCreateJobPayload = {
  tenantId: 'ten-00000000-0000-4000-a000-00000000000a',
  schemaName: 'tenant_alfa',
  tenantSlug: 'alfa',
  actorUserId: 'usr-00000000-0000-4000-a000-000000000099',
  ipAddress: '10.0.0.1',
  idempotencyKey: 'lote-2026-07-22-001',
  users: [{ email: 'tecnico.uno@empresa-demo.test', role: UserRole.TECHNICIAN }],
};

function buildJob(name: string, data: UsersBulkCreateJobPayload): Job<UsersBulkCreateJobPayload> {
  return { id: 'users-bulk-1', name, data } as unknown as Job<UsersBulkCreateJobPayload>;
}

describe('UsersBulkCreateProcessor.process', () => {
  let usersService: { executeBulkCreateJob: jest.Mock };
  let processor: UsersBulkCreateProcessor;

  beforeEach(() => {
    usersService = { executeBulkCreateJob: jest.fn().mockResolvedValue(undefined) };
    processor = new UsersBulkCreateProcessor(usersService as unknown as UsersService);
  });

  it('INVARIANTE: delega el tenant del payload, no un contexto ambiente', async () => {
    await processor.process(buildJob(USERS_BULK_CREATE_JOB, PAYLOAD));

    expect(usersService.executeBulkCreateJob).toHaveBeenCalledTimes(1);
    const [payload, jobId] = usersService.executeBulkCreateJob.mock.calls[0]!;
    expect(payload).toBe(PAYLOAD);
    expect(payload.schemaName).toBe('tenant_alfa');
    expect(jobId).toBe('users-bulk-1');
  });

  it('INVARIANTE: un job con otro nombre en la misma cola no ejecuta altas', async () => {
    await processor.process(buildJob('otro.job.desconocido', PAYLOAD));

    expect(usersService.executeBulkCreateJob).not.toHaveBeenCalled();
  });

  it('propaga el fallo del servicio para que BullMQ pueda reintentar', async () => {
    usersService.executeBulkCreateJob.mockRejectedValue(new Error('Redis no disponible'));

    await expect(processor.process(buildJob(USERS_BULK_CREATE_JOB, PAYLOAD))).rejects.toThrow(
      'Redis no disponible',
    );
  });
});
