import { runInTenantSchema, TenantContext } from '@iwana/db';
import { AccessPermissionKey } from '@iwana/shared';
import { UnrecoverableError } from 'bullmq';
import {
  CONTRACT_PENDING_SIGNATURE_REPEATABLE_JOB_ID,
  CONTRACT_PENDING_SIGNATURE_SWEEP_JOB,
  CONTRACT_PENDING_SIGNATURE_TENANT_JOB,
} from './contract-pending-signature.constants';
import {
  bogotaCivilDate,
  ContractPendingSignatureAlertsProcessor,
  makeContractPendingSignatureTenantJobId,
  parseContractPendingSignatureTenantPayload,
} from './contract-pending-signature-alerts.processor';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
}));

const payload = {
  tenantId: '11111111-1111-4111-8111-1111111111ee',
  tenantSlug: 'f-alerts',
  schemaName: 'tenant_f_alerts',
  date: '2026-11-11',
};
const C1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const C2 = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';

describe('ContractPendingSignatureAlertsProcessor', () => {
  const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  let dataSource: { query: jest.Mock };
  let queue: { add: jest.Mock };
  let service: { listDueForAlert: jest.Mock; recordAlerts: jest.Mock };
  let holders: { holders: jest.Mock };
  let mailer: { sendMail: jest.Mock };
  let processor: ContractPendingSignatureAlertsProcessor;
  const manager = { marker: 'manager' };

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource = { query: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = {
      listDueForAlert: jest.fn().mockResolvedValue([C1, C2]),
      recordAlerts: jest.fn().mockResolvedValue([C1, C2]),
    };
    holders = {
      holders: jest.fn().mockResolvedValue([
        { userId: 'u1', email: 'contable@example.test' },
        { userId: 'u2', email: 'noc@example.test' },
      ]),
    };
    mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
    runInTenant.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
    processor = new ContractPendingSignatureAlertsProcessor(
      dataSource as never,
      queue as never,
      service as never,
      holders as never,
      mailer as never,
      { get: () => 'https://portal.example.test' } as never,
    );
  });

  it('registra el job repetible diario', async () => {
    await processor.onApplicationBootstrap();
    expect(queue.add).toHaveBeenCalledWith(
      CONTRACT_PENDING_SIGNATURE_SWEEP_JOB,
      {},
      expect.objectContaining({ jobId: CONTRACT_PENDING_SIGNATURE_REPEATABLE_JOB_ID }),
    );
  });

  it('el barrido encola un job por tenant válido con jobId determinista y sin PII', async () => {
    dataSource.query.mockResolvedValue([
      { id: payload.tenantId, slug: payload.tenantSlug, schema_name: payload.schemaName },
      { id: 'malo', slug: 'x', schema_name: 'public' },
    ]);

    await processor.process({ name: CONTRACT_PENDING_SIGNATURE_SWEEP_JOB, data: {} } as never);

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, options] = queue.add.mock.calls[0] as [string, object, { jobId: string }];
    expect(name).toBe(CONTRACT_PENDING_SIGNATURE_TENANT_JOB);
    expect(Object.keys(data).sort()).toEqual(['date', 'schemaName', 'tenantId', 'tenantSlug']);
    expect(options.jobId).toBe(
      makeContractPendingSignatureTenantJobId(payload.schemaName, bogotaCivilDate(new Date())),
    );
  });

  it('el barrido falla si no pudo encolar algún tenant', async () => {
    dataSource.query.mockResolvedValue([
      { id: payload.tenantId, slug: payload.tenantSlug, schema_name: payload.schemaName },
    ]);
    queue.add.mockRejectedValue(new Error('redis'));
    await expect(
      processor.process({ name: CONTRACT_PENDING_SIGNATURE_SWEEP_JOB, data: {} } as never),
    ).rejects.toThrow('class=Error');
  });

  it('el job de tenant avisa a quienes tienen el permiso con conteo y enlace', async () => {
    const run = jest.spyOn(TenantContext, 'run');

    await processor.process({
      name: CONTRACT_PENDING_SIGNATURE_TENANT_JOB,
      data: payload,
    } as never);

    expect(run).toHaveBeenCalledWith(
      {
        tenantId: payload.tenantId,
        schemaName: payload.schemaName,
        tenantSlug: payload.tenantSlug,
      },
      expect.any(Function),
    );
    expect(service.listDueForAlert).toHaveBeenCalledWith(48, expect.any(Date));
    expect(holders.holders).toHaveBeenCalledWith(
      AccessPermissionKey.CRM_CONTRACTS_PENDING_SIGNATURE_NOTIFY,
      manager,
    );
    expect(service.recordAlerts).toHaveBeenCalledWith(manager, [C1, C2], 48, 2);
    const mail = mailer.sendMail.mock.calls[0]?.[0] as { to: string; text: string; html: string };
    expect(mail.to).toBe('contable@example.test, noc@example.test');
    expect(mail.text).toContain('Hay 2 contratos');
    expect(mail.text).toContain('https://portal.example.test/dashboard/crm/subscribers');
    expect(`${mail.text}${mail.html}`).not.toContain(C1);
    run.mockRestore();
  });

  it('un solo contrato usa el singular', async () => {
    service.recordAlerts.mockResolvedValue([C1]);
    await processor.processTenant(payload, new Date());
    const mail = mailer.sendMail.mock.calls[0]?.[0] as { text: string };
    expect(mail.text).toContain('Hay 1 contrato ');
  });

  it('sin vencidos no busca destinatarios', async () => {
    service.listDueForAlert.mockResolvedValue([]);
    await processor.processTenant(payload, new Date());
    expect(holders.holders).not.toHaveBeenCalled();
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('sin destinatarios no registra ni envía', async () => {
    holders.holders.mockResolvedValue([]);
    await processor.processTenant(payload, new Date());
    expect(service.recordAlerts).not.toHaveBeenCalled();
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('ya avisados (idempotencia): no envía', async () => {
    service.recordAlerts.mockResolvedValue([]);
    await processor.processTenant(payload, new Date());
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('payload inválido es irrecuperable y un job desconocido se omite', async () => {
    await expect(
      processor.process({
        name: CONTRACT_PENDING_SIGNATURE_TENANT_JOB,
        data: { ...payload, schemaName: 'public' },
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(() => parseContractPendingSignatureTenantPayload(null)).toThrow(UnrecoverableError);
    await expect(processor.process({ name: 'otro', data: {} } as never)).resolves.toBeUndefined();
  });
});
