import { PublishInstalacionEstandarV2131000000000 } from './131_publish_instalacion_estandar_v2';

describe('PublishInstalacionEstandarV2131', () => {
  it('publica la v2 con los 5 requisitos de spec §4.2 y copy B4 literal', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new PublishInstalacionEstandarV2131000000000();

    await migration.up({ query } as never);

    const upSql = String(query.mock.calls[0]?.[0]);
    // Plantilla canónica y versión 2 publicada.
    expect(upSql).toContain('INSTALACION_ESTANDAR');
    expect(upSql).toContain("'PUBLISHED'");
    expect(upSql).toContain('Instalación estándar v2');
    // Los 5 requisitos con copy B4 literal.
    expect(upSql).toContain('installed-equipment');
    expect(upSql).toContain('Equipos instalados en el sitio del cliente');
    expect(upSql).toContain('service-test');
    expect(upSql).toContain('Prueba de servicio en el sitio');
    expect(upSql).toContain('work-photo');
    expect(upSql).toContain('Fotos del trabajo realizado');
    expect(upSql).toContain('CUSTOMER_SIGNATURE');
    expect(upSql).toContain('Acta de conformidad firmada por el cliente');
    expect(upSql).toContain('installation-activity');
    expect(upSql).toContain('Registro de la actividad en bitácora (NO requerido)');
    // Contrato v1.2 de B1: MATERIAL con disposición declarada (contrato v1.2).
    expect(upSql).toContain('"itemCategory":"CPE"');
    expect(upSql).toContain('"finalDisposition":"INSTALLED_AT_CUSTOMER"');
    // Sin MEASUREMENT (ADR-088 R4: sin vía de captura → OT incerrable).
    expect(upSql).not.toMatch(/'MEASUREMENT'|"MEASUREMENT"/);
    // Sin contrato legal (ADR-088 §D1/R5: fuera de alcance).
    expect(upSql).not.toMatch(/COMPLIANCE|contrato legal/i);
  });

  it('up nunca re-snapshotea OT: no toca execution_orders', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new PublishInstalacionEstandarV2131000000000();

    await migration.up({ query } as never);

    const upSql = String(query.mock.calls[0]?.[0]);
    expect(upSql).not.toMatch(/UPDATE\s+execution_orders/i);
    expect(upSql).not.toMatch(/DELETE\s+FROM\s+execution_orders/i);
    expect(upSql).not.toContain('template_requirements_snapshot');
  });

  it('up es conservador: omite sin clobberar cuando ya hay v2 o no hay canónica', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new PublishInstalacionEstandarV2131000000000();

    await migration.up({ query } as never);

    const upSql = String(query.mock.calls[0]?.[0]);
    // Ya evolucionada → NOTICE y RETURN, sin tocar la definición vigente.
    expect(upSql).toContain('max_version >= 2');
    // Sin plantilla canónica → NOTICE y RETURN, la definición propia se conserva.
    expect(upSql).toContain('sin plantilla canonica');
    // La v1 nunca se retira ni se modifica en el up.
    expect(upSql).not.toMatch(/SET\s+status\s*=\s*'RETIRED'/i);
  });

  it('down revierte solo la v2 y falla cerrado con OT abiertas dependientes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new PublishInstalacionEstandarV2131000000000();

    await migration.down({ query } as never);

    const downSql = String(query.mock.calls[0]?.[0]);
    expect(downSql).toContain('dependent_orders > 0');
    expect(downSql).toContain('OT abiertas referencian la v2');
    expect(downSql).toContain('AND version = 2');
    // Sin v2 presente es no-op con NOTICE: down() ejercitable sin throw incondicional.
    expect(downSql).toContain('nada que revertir');
    expect(downSql).not.toMatch(/RAISE EXCEPTION 'No implementado/i);
  });
});
