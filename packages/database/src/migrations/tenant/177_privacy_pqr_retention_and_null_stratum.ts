import { MigrationInterface, QueryRunner } from 'typeorm';

const NATURAL_DOCUMENT =
  "person_type = 'NATURAL' AND document_type IS NOT NULL AND (document_number_encrypted IS NOT NULL OR anonymized_at IS NOT NULL) AND first_name IS NOT NULL AND last_name IS NOT NULL";
const JURIDICA = "person_type = 'JURIDICA' AND nit IS NOT NULL AND business_name IS NOT NULL";

/** ADR-104: estrato desconocido solo tras anonimizar; relojes de PQR y solicitudes.
 * down restaura los CHECK sin validar las filas ya anonimizadas y sin inventar estratos.
 */
export class PrivacyPqrRetentionAndNullStratum1770000000177 implements MigrationInterface {
  name = 'PrivacyPqrRetentionAndNullStratum1770000000177';
  async up(qr: QueryRunner): Promise<void> {
    await qr.query('ALTER TABLE contracts ADD COLUMN anonymized_at timestamptz NULL');
    await qr.query(`ALTER TABLE contracts DROP CONSTRAINT chk_contract_residential_stratum,
      ADD CONSTRAINT chk_contract_residential_stratum CHECK (service_usage IS DISTINCT FROM 'RESIDENTIAL' OR installation_stratum IS NOT NULL OR anonymized_at IS NOT NULL)`);
    await qr.query(`ALTER TABLE subscribers DROP CONSTRAINT chk_subscriber_person_fields,
      ADD CONSTRAINT chk_subscriber_person_fields CHECK ((${NATURAL_DOCUMENT} AND (stratum IS NOT NULL OR anonymized_at IS NOT NULL)) OR (${JURIDICA}))`);
    await qr.query(`INSERT INTO retention_policies (category,years,start_event,legal_basis,is_legal_minimum)
      VALUES ('PQR_SOPORTES',3,'NOTIFICACION_RESPUESTA_DEFINITIVA','ADR-104 E1',true),
             ('SOLICITUDES_TITULAR',5,'RESOLUCION_SOLICITUD','ADR-104 E2',true)
      ON CONFLICT (category) DO NOTHING`);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE subscribers DROP CONSTRAINT chk_subscriber_person_fields,
      ADD CONSTRAINT chk_subscriber_person_fields CHECK ((${NATURAL_DOCUMENT} AND stratum IS NOT NULL) OR (${JURIDICA})) NOT VALID`);
    await qr.query(`ALTER TABLE contracts DROP CONSTRAINT chk_contract_residential_stratum,
      ADD CONSTRAINT chk_contract_residential_stratum CHECK (service_usage IS DISTINCT FROM 'RESIDENTIAL' OR installation_stratum IS NOT NULL) NOT VALID`);
    await qr.query('ALTER TABLE contracts DROP COLUMN anonymized_at');
    await qr.query(
      "DELETE FROM retention_policies WHERE category IN ('PQR_SOPORTES','SOLICITUDES_TITULAR')",
    );
  }
}
