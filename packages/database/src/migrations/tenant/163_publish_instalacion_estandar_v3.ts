import type { MigrationInterface, QueryRunner } from 'typeorm';

import {
  ensureProvisioningRequirement,
  revertProvisioningRequirement,
} from './ensure-provisioning-requirement.migration';

/** Publica la versión siguiente si aún no exige aprovisionamiento certificado. */
export class PublishInstalacionV3163000000000 implements MigrationInterface {
  name = 'PublishInstalacionV3163000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensureProvisioningRequirement(queryRunner, '163');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revertProvisioningRequirement(queryRunner, '163');
  }
}
