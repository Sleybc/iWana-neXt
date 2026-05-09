import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpedienteToTicketSubjectType1700000000032 implements MigrationInterface {
  name = 'AddExpedienteToTicketSubjectType1700000000032';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Agrega el valor EXPEDIENTE al enum ticket_subject_type para soportar
    // tickets operativos de instalación vinculados a expedientes CRM
    await queryRunner.query(`
      ALTER TYPE ticket_subject_type ADD VALUE IF NOT EXISTS 'EXPEDIENTE'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL no soporta DROP VALUE en enums; se deja el valor para
    // evitar romper datos existentes. El control se hace a nivel de aplicación.
  }
}
