'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddExpedienteToTicketSubjectType1700000000032 = void 0;
class AddExpedienteToTicketSubjectType1700000000032 {
  name = 'AddExpedienteToTicketSubjectType1700000000032';
  async up(queryRunner) {
    // Agrega el valor EXPEDIENTE al enum ticket_subject_type para soportar
    // tickets operativos de instalación vinculados a expedientes CRM
    await queryRunner.query(`
      ALTER TYPE ticket_subject_type ADD VALUE IF NOT EXISTS 'EXPEDIENTE'
    `);
  }
  async down(queryRunner) {
    // PostgreSQL no soporta DROP VALUE en enums; se deja el valor para
    // evitar romper datos existentes. El control se hace a nivel de aplicación.
  }
}
exports.AddExpedienteToTicketSubjectType1700000000032 =
  AddExpedienteToTicketSubjectType1700000000032;
//# sourceMappingURL=032_add_expediente_to_ticket_subject_type.js.map
