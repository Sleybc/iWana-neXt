/**
 * Textos de error de facturación (informe de cierre MOD05↔MOD14, P-08) y el tope de envíos por
 * correo (429, `BILLING_EMAIL_RATE_LIMITED`) en el flujo de envío.
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { BILLING_ERROR_CODES, type BillingEmailLogEntry } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { BillingEmailSendResult, useBillingEmailSend } from './BillingEmailLog';
import { billingError } from './billing-ui';

const ANONYMIZED =
  'Los datos de este cliente fueron anonimizados: su facturación ya no admite cambios ni envíos por correo.';
const RATE_LIMITED =
  'Se alcanzó el máximo de envíos por correo por hora para este cliente. Intenta más tarde.';

describe('billingError — titular anonimizado (P-08)', () => {
  // El mismo código llega al emitir, pagar, desasociar y enviar por correo.
  it('muestra un texto válido para cualquier operación, sin «registrar pagos» ni «titular»', () => {
    const message = billingError(new ApiError(409, 'PRIVACY_TITULAR_ANONYMIZED', 'x'));
    expect(message).toBe(ANONYMIZED);
    expect(message).not.toMatch(/registrar pagos|titular/iu);
  });
});

describe('billingError — códigos de recibos y correos', () => {
  it('el 429 del tope de envíos dice que se alcanzó el máximo por hora y que intente más tarde', () => {
    expect(
      billingError(new ApiError(429, BILLING_ERROR_CODES.BILLING_EMAIL_RATE_LIMITED, 'x')),
    ).toBe(RATE_LIMITED);
  });

  it.each([
    [BILLING_ERROR_CODES.BILLING_EMAIL_IMPORTED_NOT_SENDABLE, 409, /no se envía por correo/u],
    [
      BILLING_ERROR_CODES.BILLING_EMAIL_QUEUE_UNAVAILABLE,
      503,
      /envío de correos no está disponible/u,
    ],
    [BILLING_ERROR_CODES.BILLING_PRIVACY_UNAVAILABLE, 503, /datos protegidos/u],
    [BILLING_ERROR_CODES.BILLING_PAYMENT_NOT_FOUND, 404, /No se encontró el pago/u],
    [BILLING_ERROR_CODES.BILLING_RECEIPT_UNAVAILABLE, 503, /recibo no está disponible/u],
  ])('%s tiene su propio texto', (code, status, expected) => {
    const message = billingError(new ApiError(status, code, 'mensaje del servidor'));
    expect(message).toMatch(expected);
    expect(message).not.toContain(code);
    expect(message).not.toContain('mensaje del servidor');
  });
});

describe('useBillingEmailSend — tope de envíos (429)', () => {
  const queued: BillingEmailLogEntry = {
    id: 'cccccccc-cccc-4ccc-8ccc-000000000001',
    subscriberId: '55555555-5555-4555-8555-555555555555',
    kind: 'ESTADO_CUENTA',
    documentId: null,
    paymentId: null,
    periodFrom: null,
    periodTo: null,
    recipientMasked: 'j***@d***.co',
    subject: 'Estado de cuenta',
    status: 'EN_COLA',
    reasonCode: null,
    resend: false,
    requestedBy: '77777777-7777-4777-8777-777777777777',
    createdAt: '2026-11-13T15:00:00.000Z',
    processedAt: null,
  };

  // Los tres envíos (factura, recibo y estado de cuenta) comparten este hook.
  it('un envío rechazado por el tope muestra el aviso y permite un envío posterior', async () => {
    const { result } = renderHook(useBillingEmailSend);
    await act(async () => {
      await result.current.send('envio', () =>
        Promise.reject(new ApiError(429, 'BILLING_EMAIL_RATE_LIMITED', 'Too Many Requests')),
      );
    });
    expect(result.current.busy).toBeNull();
    expect(result.current.sent).toBe(1);
    expect(result.current.outcome).toEqual({
      variant: 'error',
      title: 'No se envió el correo',
      description: RATE_LIMITED,
    });

    const { unmount } = render(<BillingEmailSendResult outcome={result.current.outcome} />);
    expect(screen.getByText('No se envió el correo')).toBeInTheDocument();
    expect(screen.getByText(RATE_LIMITED)).toBeInTheDocument();
    expect(screen.queryByText(/Too Many Requests|BILLING_EMAIL/u)).not.toBeInTheDocument();
    unmount();

    await act(async () => {
      await result.current.send('envio', () => Promise.resolve(queued));
    });
    expect(result.current.sent).toBe(2);
    expect(result.current.outcome?.variant).toBe('success');
  });
});
