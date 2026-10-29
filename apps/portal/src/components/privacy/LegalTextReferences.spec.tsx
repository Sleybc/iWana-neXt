import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LegalText, LegalTextType } from '@iwana/shared';
import { ApiError, privacyApi } from '@/lib/api-client';
import { LegalTextReferences } from './LegalTextReferences';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  privacyApi: { getCurrentLegalText: jest.fn() },
}));

const getCurrentLegalText = privacyApi.getCurrentLegalText as jest.MockedFunction<
  typeof privacyApi.getCurrentLegalText
>;

function makeLegalText(type: LegalTextType): LegalText {
  return {
    id:
      type === 'POLITICA_TRATAMIENTO'
        ? '66666666-6666-4666-8666-666666666666'
        : '77777777-7777-4777-8777-777777777777',
    type,
    version: '1.0-prueba',
    content: '# Texto sintético',
    format: 'MARKDOWN',
    sha256: 'a'.repeat(64),
    publishedAt: '2026-10-29T12:00:00.000Z',
    url: null,
    isCurrent: true,
  };
}

describe('LegalTextReferences', () => {
  beforeEach(() => getCurrentLegalText.mockReset());

  it('oculta referencias inexistentes cuando la API responde 404', async () => {
    getCurrentLegalText.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No hay texto vigente.'));

    render(<LegalTextReferences />);

    await waitFor(() => expect(getCurrentLegalText).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('No fue posible cargar los textos.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Política de tratamiento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aviso de privacidad' })).not.toBeInTheDocument();
  });

  it('ofrece reintento para otros errores y luego oculta los textos que sigan en 404', async () => {
    getCurrentLegalText
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Servicio no disponible.'))
      .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'No hay texto vigente.'))
      .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'No hay texto vigente.'))
      .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'No hay texto vigente.'));

    render(<LegalTextReferences />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(getCurrentLegalText).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(screen.queryByText('No fue posible cargar los textos.')).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Política de tratamiento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aviso de privacidad' })).not.toBeInTheDocument();
  });

  it('abre y cierra los dos textos legales vigentes desde el peek', async () => {
    getCurrentLegalText
      .mockResolvedValueOnce(makeLegalText('POLITICA_TRATAMIENTO'))
      .mockResolvedValueOnce(makeLegalText('AVISO_PRIVACIDAD'));

    render(<LegalTextReferences />);

    fireEvent.click(await screen.findByRole('button', { name: 'Política de tratamiento' }));
    let dialog = screen.getByRole('dialog', { name: 'Política de tratamiento' });
    expect(dialog).toHaveTextContent('Versión 1.0-prueba');
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cerrar' }).at(-1)!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aviso de privacidad' }));
    dialog = screen.getByRole('dialog', { name: 'Aviso de privacidad' });
    expect(dialog).toHaveTextContent('Texto sintético');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('oculta una respuesta vigente de tipo distinto a la referencia solicitada', async () => {
    getCurrentLegalText
      .mockResolvedValueOnce(makeLegalText('AVISO_PRIVACIDAD'))
      .mockResolvedValueOnce(makeLegalText('POLITICA_TRATAMIENTO'));

    render(<LegalTextReferences />);

    await waitFor(() => expect(getCurrentLegalText).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole('button', { name: 'Política de tratamiento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aviso de privacidad' })).not.toBeInTheDocument();
  });
});
