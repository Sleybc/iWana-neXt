import { HttpException, HttpStatus, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES } from '@iwana/shared';
import { TicketAttachmentsUploadSizeInterceptor } from '../ticket-attachments-upload-size.interceptor';

function context(contentLength?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: contentLength === undefined ? {} : { 'content-length': contentLength },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('TicketAttachmentsUploadSizeInterceptor', () => {
  const interceptor = new TicketAttachmentsUploadSizeInterceptor();
  const next: CallHandler = { handle: jest.fn(() => of('ok')) };

  beforeEach(() => jest.clearAllMocks());

  function status(contentLength?: string): number | 'next' {
    try {
      interceptor.intercept(context(contentLength), next);
      return 'next';
    } catch (error: unknown) {
      return (error as HttpException).getStatus();
    }
  }

  it('deja pasar hasta 110 MB exactos', () => {
    expect(status(String(TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES))).toBe('next');
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('responde 413 por encima de 110 MB sin llamar a multer', () => {
    expect(status(String(TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES + 1))).toBe(
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('responde 411 sin Content-Length o con un valor que no es entero', () => {
    expect(status(undefined)).toBe(HttpStatus.LENGTH_REQUIRED);
    expect(status('1e9')).toBe(HttpStatus.LENGTH_REQUIRED);
    expect(status('-1')).toBe(HttpStatus.LENGTH_REQUIRED);
    expect(next.handle).not.toHaveBeenCalled();
  });
});
