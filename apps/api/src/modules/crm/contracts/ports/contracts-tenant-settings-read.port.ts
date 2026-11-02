/** Puerto de lectura de settings del tenant que el CRM necesita para fechas locales. */
export abstract class ContractsTenantSettingsReadPort {
  abstract getTimezone(tenantId: string): Promise<string>;
}
