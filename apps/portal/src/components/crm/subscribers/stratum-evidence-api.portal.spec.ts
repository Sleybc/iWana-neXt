import { contractsApi } from '@/lib/api-client';
import type { Contract } from '@/lib/api-client';

function apiResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ data }),
  } as Response;
}

const contractResponse = { id: 'contract-1' } as Contract;

describe('contratosApi — soporte de estrato acotado al contrato', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('envía el archivo como multipart al POST anidado y devuelve el contrato', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      apiResponse(contractResponse),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const file = new File(['receipt'], 'receipt.png', { type: 'image/png' });

    const response = await contractsApi.uploadStratumEvidence('contract-1', file, 'isp-demo');

    expect(response).toBe(contractResponse);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/crm/contracts/contract-1/stratum-evidence');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toBeInstanceOf(Headers);
    expect((init?.headers as Headers).get('X-Tenant-Slug')).toBe('isp-demo');
    expect((init?.headers as Headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    expect((init?.headers as Headers).has('Content-Type')).toBe(false);
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('file')).toBe(file);
    expect((init?.body as FormData).get('stratumEvidenceMediaId')).toBeNull();
  });

  it('quita el soporte por DELETE del mismo contrato', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      apiResponse(contractResponse),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await contractsApi.deleteStratumEvidence('contract-1', 'isp-demo');

    expect(response).toBe(contractResponse);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/crm/contracts/contract-1/stratum-evidence');
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
  });
});
