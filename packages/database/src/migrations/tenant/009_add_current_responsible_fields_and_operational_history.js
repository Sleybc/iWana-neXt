'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddCurrentResponsibleFieldsAndOperationalHistory1700000000009 = void 0;
class AddCurrentResponsibleFieldsAndOperationalHistory1700000000009 {
  name = 'AddCurrentResponsibleFieldsAndOperationalHistory1700000000009';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS current_responsible_user_id uuid NULL,
      ADD COLUMN IF NOT EXISTS current_responsible_assigned_at timestamptz NULL;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS operational_responsibility_history (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        expediente_id uuid NOT NULL,
        previous_responsible_user_id uuid NULL,
        new_responsible_user_id uuid NOT NULL,
        changed_by uuid NOT NULL,
        changed_at timestamptz NOT NULL DEFAULT now(),
        notes varchar(255) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_operational_responsibility_history PRIMARY KEY (id),
        CONSTRAINT fk_operational_resp_hist_expediente
          FOREIGN KEY (expediente_id)
          REFERENCES expediente_records(id)
          ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_resp_hist_tenant_expediente_changed_at
        ON operational_responsibility_history (tenant_id, expediente_id, changed_at DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_resp_hist_tenant_new_responsible
        ON operational_responsibility_history (tenant_id, new_responsible_user_id);
    `);
    await queryRunner.query(`
      UPDATE expediente_records
      SET
        current_responsible_user_id = assigned_to,
        current_responsible_assigned_at = updated_at
      WHERE assigned_to IS NOT NULL;
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_op_resp_hist_tenant_new_responsible`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_op_resp_hist_tenant_expediente_changed_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS operational_responsibility_history`);
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS current_responsible_user_id,
      DROP COLUMN IF EXISTS current_responsible_assigned_at;
    `);
  }
}
exports.AddCurrentResponsibleFieldsAndOperationalHistory1700000000009 =
  AddCurrentResponsibleFieldsAndOperationalHistory1700000000009;
//# sourceMappingURL=009_add_current_responsible_fields_and_operational_history.js.map
