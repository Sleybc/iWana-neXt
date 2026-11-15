import { HttpStatus, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { MIGRATION_IMPORT_LIMITS } from '@iwana/shared';
import {
  MIGRATION_MULTIPART_OVERHEAD_BYTES,
  MigrationUploadSizeInterceptor,
} from './migration-upload-size.interceptor';

/** Deuda D2: el lote se acota por `Content-Length` antes de que multer lo lea a memoria. */
describe('MigrationUploadSizeInterceptor', () => {
  const interceptor = new MigrationUploadSizeInterceptor();
  const handle = jest.fn(() => of('ok'));
  const next: CallHandler = { handle };
  const context = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => handle.mockClear());

  it('deja pasar un lote dentro del tope', () => {
    interceptor.intercept(context({ 'content-length': String(28 * 1024 * 1024) }), next);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('admite el tope más la holgura del multipart', () => {
    const limit = MIGRATION_IMPORT_LIMITS.maxBatchBytes + MIGRATION_MULTIPART_OVERHEAD_BYTES;
    interceptor.intercept(context({ 'content-length': String(limit) }), next);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('rechaza con 413 sin leer el cuerpo si declara más del tope', () => {
    const limit = MIGRATION_IMPORT_LIMITS.maxBatchBytes + MIGRATION_MULTIPART_OVERHEAD_BYTES;
    expect(() =>
      interceptor.intercept(context({ 'content-length': String(limit + 1) }), next),
    ).toThrow(
      expect.objectContaining({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        response: expect.objectContaining({ code: 'MIGRATION_BATCH_TOO_LARGE' }),
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('rechaza con 411 un cuerpo sin Content-Length', () => {
    expect(() => interceptor.intercept(context({}), next)).toThrow(
      expect.objectContaining({ status: HttpStatus.LENGTH_REQUIRED }),
    );
    expect(handle).not.toHaveBeenCalled();
  });
});
