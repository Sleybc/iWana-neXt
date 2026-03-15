/**
 * Tests unitarios del MailerService y los templates de correo.
 *
 * Estrategia TDD:
 * - Los tests se escriben antes de verificar que pasan.
 * - Se mockea nodemailer.createTransport para aislar el comportamiento del transporter.
 * - Se verifica el comportamiento del modo dev (sin SMTP) y modo produccion (con SMTP).
 *
 * SEGURIDAD:
 * - Ningun dato PII real en los tests — solo datos ficticios de prueba.
 * - Se verifica que el Logger.debug NUNCA loguee 'to' ni 'html'.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { forgotPasswordTemplate } from './templates/forgot-password.template';
import { welcomeTenantAdminTemplate } from './templates/welcome-tenant-admin.template';
import { emailVerificationTemplate } from './templates/email-verification.template';
import { passwordResetConfirmTemplate } from './templates/password-reset-confirm.template';

// ---------------------------------------------------------------------------
// Mock de nodemailer — evitar conexiones SMTP reales en tests
// ---------------------------------------------------------------------------

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
});

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

// ---------------------------------------------------------------------------
// Suite: MailerService
// ---------------------------------------------------------------------------

describe('MailerService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // MODO DEV (sin SMTP_HOST)
  // -------------------------------------------------------------------------

  describe('modo dev (sin SMTP_HOST)', () => {
    let service: MailerService;
    let loggerDebugSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailerService,
          {
            provide: ConfigService,
            // Todas las variables retornan undefined para simular entorno sin SMTP
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      service = module.get<MailerService>(MailerService);
      // Espiar el logger privado sin exponer PII en los asserts
      loggerDebugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    });

    it('sendMail no lanza error y no llama a transporter.sendMail', async () => {
      await expect(
        service.sendMail({
          to: 'destinatario-ficticio@prueba.co',
          subject: 'Asunto de prueba',
          html: '<p>Contenido HTML de prueba</p>',
          text: 'Contenido de texto de prueba',
        }),
      ).resolves.not.toThrow();

      // El transporter real nunca debe haberse creado en modo dev
      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('loguea el asunto via Logger.debug en modo dev', async () => {
      await service.sendMail({
        to: 'destinatario-ficticio@prueba.co',
        subject: 'Correo de prueba TDD',
        html: '<p>HTML</p>',
        text: 'Texto plano de prueba',
      });

      // Debe haber llamado debug al menos una vez con el asunto
      const debugCalls = loggerDebugSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const contieneAsunto = debugCalls.some((msg) => msg.includes('Correo de prueba TDD'));
      expect(contieneAsunto).toBe(true);
    });

    it('NUNCA loguea el campo "to" (PII) en modo dev', async () => {
      const destinatario = 'email-pii-ficticio@prueba.co';

      await service.sendMail({
        to: destinatario,
        subject: 'Test seguridad PII',
        html: '<p>HTML</p>',
        text: 'Texto',
      });

      // Ninguna llamada a debug debe contener el email del destinatario
      const debugCalls = loggerDebugSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const exponePii = debugCalls.some((msg) => msg.includes(destinatario));
      expect(exponePii).toBe(false);
    });

    it('NUNCA loguea el contenido HTML en modo dev', async () => {
      const htmlSensible = '<p>Contenido-HTML-sensible-unico-12345</p>';

      await service.sendMail({
        to: 'cualquiera@prueba.co',
        subject: 'Test HTML',
        html: htmlSensible,
        text: 'Texto plano',
      });

      const debugCalls = loggerDebugSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const exponeHtml = debugCalls.some((msg) => msg.includes(htmlSensible));
      expect(exponeHtml).toBe(false);
    });

    it('sendMail funciona sin campo text (texto plano opcional)', async () => {
      await expect(
        service.sendMail({
          to: 'destinatario@prueba.co',
          subject: 'Sin texto plano',
          html: '<p>Solo HTML</p>',
          // text omitido intencionalmente
        }),
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // MODO PRODUCCION (con SMTP_HOST)
  // -------------------------------------------------------------------------

  describe('modo produccion (con SMTP_HOST)', () => {
    let service: MailerService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailerService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string, def?: unknown) => {
                const config: Record<string, unknown> = {
                  SMTP_HOST: 'smtp.prueba.local',
                  SMTP_PORT: 587,
                  SMTP_USER: 'usuario-ficticio',
                  SMTP_PASS: 'password-ficticio',
                  SMTP_FROM: 'noreply@iwana.local',
                  SMTP_SECURE: false,
                };
                return config[key] ?? def;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<MailerService>(MailerService);
    });

    it('llama a transporter.sendMail con los datos correctos', async () => {
      await service.sendMail({
        to: 'destinatario-ficticio@prueba.co',
        subject: 'Asunto de test produccion',
        html: '<p>HTML de prueba</p>',
        text: 'Texto de prueba',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@iwana.local',
          to: 'destinatario-ficticio@prueba.co',
          subject: 'Asunto de test produccion',
        }),
      );
    });

    it('crea el transporter con la configuracion SMTP correcta', () => {
      // createTransport fue llamado al construir el servicio
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.prueba.local',
          port: 587,
        }),
      );
    });

    it('propaga errores del transporter como excepciones', async () => {
      // Simular fallo del servidor SMTP
      mockSendMail.mockRejectedValueOnce(new Error('Error de conexion SMTP simulado'));

      await expect(
        service.sendMail({
          to: 'destinatario@prueba.co',
          subject: 'Test error',
          html: '<p>HTML</p>',
        }),
      ).rejects.toThrow('Error de conexion SMTP simulado');
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: Templates de correo
// ---------------------------------------------------------------------------

describe('forgotPasswordTemplate', () => {
  it('retorna subject, html y text con el resetLink incluido', () => {
    const result = forgotPasswordTemplate({
      resetLink: 'https://app.prueba.co/auth/reset-password?token=tok-ficticio-123',
      expiresInMinutes: 60,
    });

    expect(result.subject).toBe('Restablece tu contraseña — iWana neXt');
    expect(result.html).toContain(
      'https://app.prueba.co/auth/reset-password?token=tok-ficticio-123',
    );
    expect(result.html).toContain('60 minutos');
    expect(result.text).toContain(
      'https://app.prueba.co/auth/reset-password?token=tok-ficticio-123',
    );
    expect(result.text).toContain('60 minutos');
  });

  it('refleja correctamente el tiempo de expiracion en el mensaje', () => {
    const result = forgotPasswordTemplate({
      resetLink: 'https://app.prueba.co/reset',
      expiresInMinutes: 30,
    });

    expect(result.html).toContain('30 minutos');
    expect(result.text).toContain('30 minutos');
  });
});

describe('welcomeTenantAdminTemplate', () => {
  it('retorna subject, html y text con el nombre del tenant y URL de login', () => {
    const result = welcomeTenantAdminTemplate({
      tenantName: 'ISP Prueba S.A.S',
      loginUrl: 'https://app.prueba.co/auth/login',
      temporaryPassword: 'IwN!a9-abcdef01',
      expiresInHours: 24,
    });

    expect(result.subject).toBe('Bienvenido a iWana neXt — Credenciales de acceso');
    expect(result.html).toContain('ISP Prueba S.A.S');
    expect(result.html).toContain('https://app.prueba.co/auth/login');
    // La contraseña temporal SI aparece en el html (correo real entregado al destinatario)
    expect(result.html).toContain('IwN!a9-abcdef01');
    expect(result.html).toContain('24 horas');
    // El campo text NO debe contener la contraseña — es el que se loguea en modo dev (CRITICO-2)
    expect(result.text).toContain('ISP Prueba S.A.S');
    expect(result.text).not.toContain('IwN!a9-abcdef01');
    expect(result.text).toContain('solo se muestra en el correo HTML');
  });
});

describe('emailVerificationTemplate', () => {
  it('retorna subject, html y text con el enlace de verificacion', () => {
    const result = emailVerificationTemplate({
      verifyLink: 'https://app.prueba.co/auth/verify?token=verify-ficticio-456',
    });

    expect(result.subject).toBe('Verifica tu correo electrónico — iWana neXt');
    expect(result.html).toContain('https://app.prueba.co/auth/verify?token=verify-ficticio-456');
    expect(result.text).toContain('https://app.prueba.co/auth/verify?token=verify-ficticio-456');
  });
});

describe('passwordResetConfirmTemplate', () => {
  it('retorna subject, html y text de confirmacion sin parametros', () => {
    const result = passwordResetConfirmTemplate();

    expect(result.subject).toBe('Tu contraseña ha sido actualizada — iWana neXt');
    expect(result.html).toBeTruthy();
    expect(result.text).toBeTruthy();
    // No debe contener datos de usuario — solo mensaje de confirmacion
    expect(result.html).not.toContain('{{');
    expect(result.text).not.toContain('{{');
  });
});
