import type { MigrationInterface, QueryRunner } from 'typeorm';

import {
  ensureProvisioningRequirement,
  revertProvisioningRequirement,
} from './ensure-provisioning-requirement.migration';

/** Repara tenants donde la 163 ya figura aplicada sin publicar PROVISIONING. */
export class EnsureProvisioningRequirement1640000000000 implements MigrationInterface {
  name = 'EnsureProvisioningRequirement1640000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensureProvisioningRequirement(queryRunner, '164');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await revertProvisioningRequirement(queryRunner, '164');
  }
}
