import { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_DESCRIPTION = 'Ticket creado automáticamente al programar la visita de instalación.';
const OLD_PREFIX = 'Ticket operativo de instalación generado automáticamente para el expediente ';

/**
 * Migración tenant 217: retira el identificador interno del expediente de la descripción del
 * ticket de instalación automático.
 *
 * El texto antiguo terminaba en el UUID del expediente, que quien atiende no puede leer ni
 * usar: el expediente ya está en «Relacionado con». Solo se reescriben las descripciones que
 * coinciden exactamente con el texto generado; una descripción editada a mano no se toca.
 *
 * Reversa (down): reconstruye el texto antiguo desde `subject_ref_id`, el mismo dato con el
 * que se generó. Alcanza también a los tickets creados después con el texto nuevo, que con el
 * código anterior habrían nacido con ese mismo texto antiguo.
 */
export class RewordInstallationTicketDescription2170000000217 implements MigrationInterface {
  name = 'RewordInstallationTicketDescription2170000000217';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE support_tickets
          SET description = $1
        WHERE type::text = 'OPERATIONAL_TASK'
          AND subject_type::text = 'EXPEDIENTE'
          AND description = $2 || subject_ref_id || '.'`,
      [NEW_DESCRIPTION, OLD_PREFIX],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE support_tickets
          SET description = $2 || subject_ref_id || '.'
        WHERE type::text = 'OPERATIONAL_TASK'
          AND subject_type::text = 'EXPEDIENTE'
          AND subject_ref_id IS NOT NULL
          AND description = $1`,
      [NEW_DESCRIPTION, OLD_PREFIX],
    );
  }
}
