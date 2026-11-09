import { ConflictException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { TenantStatus } from '@iwana/shared';
import type { ProvisioningJobPayload } from '@iwana/shared';
import { TenantProvisioningService } from './tenant-provisioning.service';
import type { TenantService } from './tenant.service';
import { tenantStatusTransitionConflict } from './tenant-status-transitions';

/**
 * DT-4 v1.1 (spec 2026-11-09-plat-ops-dt4 §8.2): `retry-provisioning` solo opera
 * sobre PROVISIONING y PROVISIONING_FAILED y nunca reencola con el job en curso.
 * Los códigos se comparan contra los literales de la spec.
 */
describe('TenantProvisioningService.retryProvisioning (DT-4 v1.1 §8.2)', () => {
  const tenantId = 'tenant-uuid-1';
  const args = [tenantId, 'tenant_isp_test', 'isp-test', 'admin@isptest.invalid'] as const;

  function build(status: TenantStatus, removeResult: number | Error = 1) {
    const queue = {
      remove:
        removeResult instanceof Error
          ? jest.fn().mockRejectedValue(removeResult)
          : jest.fn().mockResolvedValue(removeResult),
      add: jest.fn().mockResolvedValue(undefined),
    };
    const tenantService = {
      getCurrentStatus: jest.fn().mockResolvedValue(status),
      findOne: jest.fn(),
      // Devuelve el estado que recibe: así A2 discrimina qué se escribió.
      setProvisioningStatus: jest
        .fn()
        .mockImplementation(async (id: string, next: TenantStatus) => ({ id, status: next })),
    };
    const service = new TenantProvisioningService(
      queue as unknown as Queue<ProvisioningJobPayload>,
      tenantService as unknown as TenantService,
    );
    return { service, queue, tenantService };
  }

  it.each([
    TenantStatus.MARKED_FOR_DELETION,
    TenantStatus.INACTIVE,
    TenantStatus.SUSPENDED,
    TenantStatus.ACTIVE,
  ])('A1: %s → 409 TENANT_NOT_RETRYABLE sin tocar la cola ni el estado', async (status) => {
    const { service, queue, tenantService } = build(status);

    const outcome = service.retryProvisioning(...args);
    await expect(outcome).rejects.toBeInstanceOf(ConflictException);
    await expect(outcome).rejects.toMatchObject({ response: { code: 'TENANT_NOT_RETRYABLE' } });

    expect(tenantService.getCurrentStatus).toHaveBeenCalledWith(tenantId);
    // La guarda lee la base, no la proyección cacheada de findOne.
    expect(tenantService.findOne).not.toHaveBeenCalled();
    expect(queue.remove).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(tenantService.setProvisioningStatus).not.toHaveBeenCalled();
  });

  it.each([TenantStatus.PROVISIONING_FAILED, TenantStatus.PROVISIONING])(
    'A2: %s con job en espera o inexistente (remove=1) → retira, pasa a PROVISIONING y reencola',
    async (status) => {
      const { service, queue, tenantService } = build(status, 1);

      const result = await service.retryProvisioning(...args);

      expect(queue.remove).toHaveBeenCalledWith(`provision-${tenantId}`);
      expect(tenantService.setProvisioningStatus).toHaveBeenCalledWith(tenantId, 'PROVISIONING');
      expect(queue.add).toHaveBeenCalledWith(
        'provision-schema',
        {
          tenantId,
          schemaName: 'tenant_isp_test',
          tenantSlug: 'isp-test',
          adminEmail: 'admin@isptest.invalid',
        },
        expect.objectContaining({ jobId: `provision-${tenantId}` }),
      );
      const removeOrder = queue.remove.mock.invocationCallOrder[0] as number;
      const statusOrder = tenantService.setProvisioningStatus.mock.invocationCallOrder[0] as number;
      const addOrder = queue.add.mock.invocationCallOrder[0] as number;
      expect(removeOrder).toBeLessThan(statusOrder);
      expect(statusOrder).toBeLessThan(addOrder);
      // Lo que devuelve es lo que escribió setProvisioningStatus (el doble lo refleja).
      expect(result.status).toBe('PROVISIONING');
    },
  );

  // bullmq 5.71: `Queue.remove` resuelve 0 (no rechaza) si el job tiene lock del
  // worker (script removeJob → isLocked). Ese 0 es «job en curso».
  it('A3: PROVISIONING con el job activo (remove=0) → 409 TENANT_PROVISIONING_IN_PROGRESS', async () => {
    const { service, queue, tenantService } = build(TenantStatus.PROVISIONING, 0);

    const outcome = service.retryProvisioning(...args);
    await expect(outcome).rejects.toBeInstanceOf(ConflictException);
    await expect(outcome).rejects.toMatchObject({
      response: { code: 'TENANT_PROVISIONING_IN_PROGRESS' },
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(tenantService.setProvisioningStatus).not.toHaveBeenCalled();
  });

  it('A3b: un error real de remove se propaga sin reencolar ni cambiar el estado', async () => {
    const { service, queue, tenantService } = build(
      TenantStatus.PROVISIONING_FAILED,
      new Error('redis caído'),
    );

    await expect(service.retryProvisioning(...args)).rejects.toThrow('redis caído');

    expect(queue.add).not.toHaveBeenCalled();
    expect(tenantService.setProvisioningStatus).not.toHaveBeenCalled();
  });

  it('A4: la guarda lee PROVISIONING_FAILED pero el CAS falla (DELETE en medio) → 409 TENANT_NOT_RETRYABLE sin add', async () => {
    const { service, queue, tenantService } = build(TenantStatus.PROVISIONING_FAILED, 1);
    tenantService.setProvisioningStatus.mockRejectedValue(tenantStatusTransitionConflict());

    const outcome = service.retryProvisioning(...args);
    await expect(outcome).rejects.toBeInstanceOf(ConflictException);
    await expect(outcome).rejects.toMatchObject({ response: { code: 'TENANT_NOT_RETRYABLE' } });

    expect(queue.remove).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueue: si la cola falla y el tenant ya no está en PROVISIONING, propaga el error de la cola', async () => {
    const { service, queue, tenantService } = build(TenantStatus.PROVISIONING, 1);
    queue.add.mockRejectedValue(new Error('cola caída'));
    tenantService.setProvisioningStatus.mockRejectedValue(tenantStatusTransitionConflict());

    await expect(
      service.enqueue({
        tenantId,
        schemaName: 'tenant_isp_test',
        tenantSlug: 'isp-test',
        adminEmail: 'admin@isptest.invalid',
      }),
    ).rejects.toThrow('cola caída');
    expect(tenantService.setProvisioningStatus).toHaveBeenCalledWith(
      tenantId,
      'PROVISIONING_FAILED',
    );
  });
});
