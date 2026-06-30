/** Puerto de lectura de configuracion operativa del tenant requerida por WFM. */
export abstract class WfmTenantSettingsReadPort {
  /** Retorna la timezone IANA efectiva del tenant. */
  abstract getTimezone(tenantId: string): Promise<string>;
}
