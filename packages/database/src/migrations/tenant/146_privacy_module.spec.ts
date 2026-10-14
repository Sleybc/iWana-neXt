import { PrivacyModule1460000000000 } from './146_privacy_module';

describe('PrivacyModule146', () => {
  afterEach(() => jest.restoreAllMocks());

  it('crea las tablas tenant, triggers append-only y la protección de retención', async () => {
    const query = jest.fn().mockResolvedValue([]);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await new PrivacyModule1460000000000().up({ query } as never);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');

    for (const table of [
      'legal_texts',
      'data_authorizations',
      'data_subject_requests',
      'data_subject_request_events',
      'party_privacy_marks',
      'retention_policies',
      'privacy_incidents',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql.match(/CREATE TRIGGER trg_.*_append_only/gu)).toHaveLength(4);
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
    expect(sql).toContain('privacy_prevent_retention_reduction');
    expect(sql).toContain('NEW.years < minimum_years');
    expect(sql).toContain("'PROSPECTO_SIN_CONTRATO', 2");
    expect(sql).toContain('requester_name_encrypted varchar(500)');
    expect(sql).toContain('requester_evidence_media_id uuid');
    expect(sql).toContain('identity_verified_at timestamptz');
    expect(sql).toContain('impersonation_complaint_due_at date');
    expect(sql).toContain('suspended_contract_ids uuid[] NOT NULL DEFAULT');
    expect(sql).toContain('transferred_to varchar(200)');
    expect(sql).toContain("disputed_contract_ids uuid[] NOT NULL DEFAULT '{}'");
    expect(sql).toContain(
      "CHECK (kind <> 'SUPLANTACION' OR (cardinality(disputed_contract_ids) >= 1 AND party_id IS NOT NULL AND identity_verified_at IS NOT NULL))",
    );
    expect(sql).toContain(
      "CHECK (kind = 'SUPLANTACION' OR cardinality(disputed_contract_ids) = 0)",
    );
    expect(sql).toContain(
      "CONSTRAINT ck_data_subject_requests_verified_before_processing CHECK (status NOT IN ('EN_TRAMITE', 'PRORROGADA', 'RESUELTA') OR identity_verified_at IS NOT NULL)",
    );
    expect(sql).toContain(
      "CONSTRAINT ck_data_subject_requests_non_legitimated_without_identity CHECK (status <> 'NO_PROCEDENTE' OR identity_verified_at IS NOT NULL OR (legal_basis IS NOT NULL AND legal_basis = 'SOLICITANTE_NO_LEGITIMADO'))",
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS data_subject_request_tasks');
    expect(sql).toContain('privacy_prevent_request_task_reopen');
    expect(sql).toContain('NEW.done_at IS DISTINCT FROM OLD.done_at');
    expect(sql).toContain('purpose text');
    expect(sql).toContain('reported_at date');
    expect(sql).toContain('external_reference varchar(100)');
    expect(sql).toContain('CHECK ((reported_at IS NULL) = (external_reference IS NULL))');
    expect(sql).toContain('privacy_prevent_incident_report_rewrite');
    expect(sql).toContain('trg_privacy_incidents_report_once');
    expect(sql).toContain('privacy_prevent_verified_identity_change');
    expect(sql).toContain('trg_data_subject_requests_identity_immutable');
  });

  it('mapea los tres orígenes de forma idempotente, conserva la trazabilidad de canal y usa C-CAL-1', async () => {
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('to_regclass')) return [{ present: true }];
      if (sql.includes('COUNT(*) FILTER (WHERE mapped.purpose')) {
        return [{ total: 2, resolved: 1 }];
      }
      if (sql.includes('COUNT(*) FILTER (WHERE s.party_id IS NOT NULL)')) {
        return [{ total: 1, resolved: 1 }];
      }
      if (sql.includes('SELECT COUNT(*)::int AS unresolved')) return [{ unresolved: 1 }];
      if (sql.includes('FROM arco_requests r')) {
        return [
          {
            id: '00000000-0000-4000-8000-000000000001',
            request_type: 'ACCESS',
            status: 'PENDING',
            created_at: new Date('2026-04-01T04:30:00.000Z'),
            resolved_at: null,
            party_id: '00000000-0000-4000-8000-000000000002',
          },
        ];
      }
      if (sql.includes('FROM data_authorizations WHERE source_ref LIKE')) return [{ total: 1 }];
      return [];
    });
    const reportSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await new PrivacyModule1460000000000().up({ query } as never);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');

    expect(sql).toContain("WHEN 'TRATAMIENTO_DATOS' THEN 'TRATAMIENTO_CONTRACTUAL'");
    expect(sql).toContain("WHEN 'CONTACTO_OPERATIVO' THEN 'TRATAMIENTO_CONTRACTUAL'");
    expect(sql).toContain("WHEN 'CONTACTO_COMERCIAL' THEN 'CONTACTO_COMERCIAL'");
    expect(sql).toContain('INSERT INTO data_subject_requests');
    expect(sql).toContain("'REVOCATION', false");
    expect(sql).toContain("'habeas_data_consents:' || c.id::text");
    expect(sql).toContain('contact_preference');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(reportSpy).toHaveBeenCalledWith(
      expect.stringContaining('las filas fuente se conservaron para reconciliación'),
    );
    const arcoInsert = query.mock.calls.find(([statement]) =>
      statement.includes('INSERT INTO data_subject_requests'),
    );
    expect(arcoInsert?.[1]?.[6]).toBe('2026-04-16');
  });

  it('down retira solo las tablas y funciones del módulo privacy', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new PrivacyModule1460000000000().down({ query } as never);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');

    expect(sql).toContain('DROP TABLE IF EXISTS privacy_incidents');
    expect(sql).toContain('DROP TABLE IF EXISTS retention_policies');
    expect(sql).toContain('DROP TABLE IF EXISTS data_subject_request_tasks');
    expect(sql).toContain('DROP TABLE IF EXISTS data_authorizations');
    expect(sql).toContain('DROP TABLE IF EXISTS legal_texts');
    expect(sql).not.toMatch(
      /DROP TABLE IF EXISTS (consent_records|habeas_data_consents|arco_requests)/u,
    );
  });
});
