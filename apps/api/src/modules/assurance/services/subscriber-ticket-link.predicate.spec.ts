import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { subscriberTicketLinkPredicate } from './subscriber-ticket-link.predicate';

type Clause = { sql: string; params: Record<string, unknown> };

function collect(contractIds: string[], expedienteId: string | null = null): Clause[] {
  const clauses: Clause[] = [];
  const builder = {
    where: (sql: string, params: Record<string, unknown>) => (
      clauses.push({ sql, params }),
      builder
    ),
    orWhere: (sql: string, params: Record<string, unknown>) => (
      clauses.push({ sql, params }),
      builder
    ),
  };
  subscriberTicketLinkPredicate('s-1', contractIds, expedienteId).whereFactory(builder as never);
  return clauses;
}

describe('subscriberTicketLinkPredicate (regla única ticket → suscriptor)', () => {
  it('cubre solicitante, asunto suscriptor y asunto contrato', () => {
    const clauses = collect(['c-1']);
    expect(clauses.map((clause) => clause.sql)).toEqual([
      expect.stringContaining('st.requester_ref_id = :subscriberId'),
      expect.stringContaining('st.subject_ref_id = :subscriberId'),
      expect.stringContaining('st.subject_ref_id IN (:...subscriberContractIds)'),
    ]);
    expect(clauses[2]?.params['subscriberContractIds']).toEqual(['c-1']);
  });

  it('sin contratos omite la rama de contrato', () => {
    expect(collect([])).toHaveLength(2);
  });

  it('cubre el ticket cuyo asunto es el expediente del suscriptor (instalación automática)', () => {
    const clauses = collect([], 'e-1');
    expect(clauses).toHaveLength(3);
    expect(clauses[2]?.sql).toContain('st.subject_ref_id = :subscriberExpedienteId');
    expect(clauses[2]?.params).toEqual({
      expedienteSubjectType: 'EXPEDIENTE',
      subscriberExpedienteId: 'e-1',
    });
  });

  it('sin expediente omite la rama de expediente', () => {
    expect(collect(['c-1'], null)).toHaveLength(3);
  });

  it('paridad: el listado de tickets y el puerto de visitas usan la misma regla', () => {
    const read = (file: string) => readFileSync(join(__dirname, file), 'utf-8');
    expect(read('tickets.service.ts')).toMatch(
      /subscriberTicketLinkPredicate\(\s*validated\.subscriberId,\s*subscriberContractIds,\s*subscriberExpedienteId,?\s*\)/,
    );
    expect(read('../ports/assurance-subscriber-tickets-read.adapter.ts')).toMatch(
      /subscriberTicketLinkPredicate\(\s*subscriberId,\s*contractIds,\s*expedienteId,?\s*\)/,
    );
  });
});
