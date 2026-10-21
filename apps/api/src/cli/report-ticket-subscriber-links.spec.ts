import {
  analyzeTicketSubscriberLinks,
  parseTicketSubscriberLinksArgs,
} from './report-ticket-subscriber-links';

describe('analyzeTicketSubscriberLinks', () => {
  it('reports only unlinked subscriber ticket ids for the requested tenant', async () => {
    const tenantId = '6c35eec7-510c-4ac4-8e5b-d7f503d37915';
    const schemaName = 'tenant_report';
    const ticketIds = [
      '7d4e5773-f88c-4de8-9d81-171a7347cebb',
      'ec573652-c389-4e82-9a91-030fc871cf0b',
    ];
    const assurancePort = {
      listSubscriberTicketLinks: jest.fn().mockResolvedValue([
        { ticketId: ticketIds[0], requesterRefId: 'legacy-subscriber-reference' },
        { ticketId: ticketIds[1], requesterRefId: null },
        {
          ticketId: '7b991048-6a35-4786-9a9e-75218bb07d33',
          requesterRefId: '6c35eec7-510c-4ac4-8e5b-d7f503d37915',
        },
      ]),
    };
    const crmPort = {
      findExistingSubscriberIds: jest
        .fn()
        .mockResolvedValue(['6c35eec7-510c-4ac4-8e5b-d7f503d37915']),
    };

    const report = await analyzeTicketSubscriberLinks(assurancePort, crmPort, tenantId, schemaName);

    expect(report).toEqual({ ticketCount: 2, ticketIds });
    expect(assurancePort.listSubscriberTicketLinks).toHaveBeenCalledWith(tenantId, schemaName);
    expect(crmPort.findExistingSubscriberIds).toHaveBeenCalledWith(tenantId, schemaName, [
      'legacy-subscriber-reference',
      '6c35eec7-510c-4ac4-8e5b-d7f503d37915',
    ]);
    expect(JSON.stringify(report)).not.toMatch(/subject|description|email|phone|name|address/i);
  });

  it('returns a zero-count report when there are no subscriber tickets', async () => {
    const assurancePort = {
      listSubscriberTicketLinks: jest.fn().mockResolvedValue([]),
    };
    const crmPort = {
      findExistingSubscriberIds: jest.fn().mockResolvedValue([]),
    };

    await expect(
      analyzeTicketSubscriberLinks(
        assurancePort,
        crmPort,
        '6c35eec7-510c-4ac4-8e5b-d7f503d37915',
        'tenant_report',
      ),
    ).resolves.toEqual({ ticketCount: 0, ticketIds: [] });
    expect(crmPort.findExistingSubscriberIds).not.toHaveBeenCalled();
  });

  it('rejects an invalid tenant schema before requesting cross-module projections', async () => {
    const assurancePort = { listSubscriberTicketLinks: jest.fn() };
    const crmPort = { findExistingSubscriberIds: jest.fn() };

    await expect(
      analyzeTicketSubscriberLinks(assurancePort, crmPort, 'tenant-id', 'public; DROP SCHEMA'),
    ).rejects.toThrow('Schema tenant inválido.');
    expect(assurancePort.listSubscriberTicketLinks).not.toHaveBeenCalled();
    expect(crmPort.findExistingSubscriberIds).not.toHaveBeenCalled();
  });
});

describe('parseTicketSubscriberLinksArgs', () => {
  it('requires a tenant and keeps execution permanently in simulation mode', () => {
    expect(parseTicketSubscriberLinksArgs(['--tenant=tenant-demo'])).toEqual({
      tenant: 'tenant-demo',
      help: false,
    });
    expect(() => parseTicketSubscriberLinksArgs(['--tenant=tenant-demo', '--apply'])).toThrow(
      'Argumento desconocido: --apply',
    );
    expect(() => parseTicketSubscriberLinksArgs(['--tenant='])).toThrow(
      '--tenant requiere un id o slug.',
    );
    expect(() =>
      parseTicketSubscriberLinksArgs(['--tenant=tenant-a', '--tenant=tenant-b']),
    ).toThrow('Usa --tenant una sola vez.');
  });
});
