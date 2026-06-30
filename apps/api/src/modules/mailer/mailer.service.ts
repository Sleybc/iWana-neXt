import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { MailOptions } from './interfaces/mail-options.interface';

/**
 * Servicio de envio de correos electronicos de iWana neXt.
 *
 * Modo de operacion:
 * - Sin SMTP_HOST configurado → modo dev: imprime en consola via Logger.debug.
 * - Con SMTP_HOST configurado → modo produccion: envia via Nodemailer Transporter.
 *
 * SEGURIDAD: En modo dev SOLO se loguea el asunto y el texto plano.
 * NUNCA se loguea `to` (PII) ni `html`. En produccion no se loguea nada del email.
 *
 * Variables de entorno usadas (todas opcionales — no rompen el arranque si faltan):
 * - SMTP_HOST: servidor SMTP; ausente = modo dev
 * - SMTP_PORT: puerto SMTP (por defecto: 587)
 * - SMTP_USER: usuario de autenticacion SMTP
 * - SMTP_PASS: contraseña de autenticacion SMTP
 * - SMTP_FROM: direccion remitente (por defecto: noreply@iwana.local)
 * - SMTP_SECURE: usar TLS directo en lugar de STARTTLS (por defecto: false)
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  /** Transporter de Nodemailer — null en modo dev */
  private readonly transporter: Transporter | null;

  /** Direccion remitente para todos los correos salientes */
  private readonly fromAddress: string;

  /** Indica si el servicio opera en modo desarrollo (sin SMTP configurado) */
  private readonly devMode: boolean;

  constructor(private readonly configService: ConfigService) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');

    // Si no hay SMTP_HOST, operar en modo dev sin transporter real
    this.devMode = !smtpHost;
    this.fromAddress = this.configService.get<string>('SMTP_FROM') ?? 'noreply@iwana.local';

    if (!this.devMode) {
      // Modo produccion: inicializar transporter con configuracion SMTP
      this.transporter = createTransport({
        host: smtpHost,
        port: this.configService.get<number>('SMTP_PORT') ?? 587,
        secure: this.configService.get<boolean>('SMTP_SECURE') ?? false,
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
    } else {
      // Modo dev: sin transporter real
      this.transporter = null;
    }
  }

  /**
   * Envia un correo electronico.
   *
   * En modo dev: imprime el asunto y texto plano en consola para depuracion local.
   * En modo produccion: envia via Nodemailer al servidor SMTP configurado.
   *
   * SEGURIDAD: Nunca loguear options.to (PII) ni options.html en ningun modo.
   */
  async sendMail(options: MailOptions): Promise<void> {
    if (this.devMode) {
      // En desarrollo: loguear el email en consola para depuracion local
      // NUNCA loguear 'to' ni 'html' — solo asunto y texto plano
      this.logger.debug(`[EMAIL DEV] Asunto: ${options.subject}`);
      if (options.text) {
        this.logger.debug(`[EMAIL DEV] Contenido:\n${options.text}`);
      }
      return;
    }

    // Modo produccion: enviar via Nodemailer
    // Guarda explicita en lugar de non-null assertion — el transporter debe existir en este punto
    if (!this.transporter) {
      throw new Error(
        'Transporter SMTP no inicializado — configurar SMTP_HOST en variables de entorno',
      );
    }
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }
}
