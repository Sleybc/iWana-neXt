import { BusinessHoursWeekday } from '@iwana/shared';
/**
 * Horario base de atención y recaudo a nivel empresa.
 * Una fila por tenant_id + weekday.
 * Si is_open = false, opens_at y closes_at son null.
 * Si is_open = true, opens_at < closes_at.
 *
 * MOD00 — Configuración / Organización — Horario base empresa
 */
export declare class OrganizationCompanyBusinessHours {
    id: string;
    tenantId: string;
    weekday: BusinessHoursWeekday;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=organization-company-business-hours.entity.d.ts.map