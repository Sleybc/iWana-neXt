/** @jest-environment node */

import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { useAuth } from './AuthProvider';
import { AuthReadyGate } from './AuthReadyGate';

jest.mock('./AuthProvider', () => ({ useAuth: jest.fn() }));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('AuthReadyGate SSR', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: jest.fn(),
      completeMfaLogin: jest.fn(),
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });
  });

  it('cierra el stream mientras valida la sesión sin enviar contenido protegido', async () => {
    const output = new PassThrough();
    let html = '';
    output.setEncoding('utf8');
    output.on('data', (chunk: string) => {
      html += chunk;
    });

    let control: ReturnType<typeof renderToPipeableStream> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const rendered = new Promise<string>((resolve, reject) => {
      output.on('end', () => resolve(html));
      output.on('error', reject);

      control = renderToPipeableStream(
        <AuthReadyGate>
          <p>Contenido protegido</p>
        </AuthReadyGate>,
        {
          onShellReady: () => control?.pipe(output),
          onShellError: reject,
          onError: () => {},
        },
      );
    });
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        control?.abort();
        reject(new Error('El stream SSR no cerró mientras se validaba la sesión'));
      }, 1000);
    });

    try {
      const response = await Promise.race([rendered, timeout]);

      expect(response).toContain('Validando sesión...');
      expect(response).not.toContain('Contenido protegido');
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      control?.abort();
    }
  });
});
