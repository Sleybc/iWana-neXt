import { MinioStorageAdapter } from '@iwana/storage';

/**
 * D2 (informe MOD09 adjuntos): los enlaces firmados deben llevar el origen público. La firma
 * SigV4 incluye el host, así que no basta con reescribir la URL después de firmar. Firmar no
 * hace llamadas de red: la prueba no necesita MinIO.
 */
function adapter(signingEndpoint?: string) {
  return new MinioStorageAdapter({
    endpoint: 'http://minio:9000',
    region: 'us-east-1',
    accessKeyId: 'synthetic-access',
    secretAccessKey: 'synthetic-secret',
    bucket: 'iwana-media',
    forcePathStyle: true,
    ...(signingEndpoint ? { signingEndpoint } : {}),
  });
}

describe('MinioStorageAdapter — origen de los enlaces firmados', () => {
  it('firma con S3_PUBLIC_ENDPOINT cuando está configurado', async () => {
    const url = new URL(
      await adapter('https://archivos.example.test').getSignedUrl('tenant_x/a.pdf', 300, {
        responseContentDisposition: 'inline; filename="acta.pdf"',
      }),
    );
    expect(url.origin).toBe('https://archivos.example.test');
    expect(url.pathname).toBe('/iwana-media/tenant_x/a.pdf');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'inline; filename="acta.pdf"',
    );
  });

  it('sin origen público firma con el endpoint interno (desarrollo)', async () => {
    const url = new URL(await adapter().getSignedUrl('tenant_x/a.pdf', 300));
    expect(url.origin).toBe('http://minio:9000');
  });
});
