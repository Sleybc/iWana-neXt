import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 016: añade contacto alternativo en subscribers.
 * - alt_contact_name: nombre de contacto alternativo
 * - alt_contact_phone_encrypted: teléfono alternativo cifrado
 */
export declare class AddSubscriberAlternateContactFields1700000000016 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=016_add_subscriber_alternate_contact_fields.d.ts.map