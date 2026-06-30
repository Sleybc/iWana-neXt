import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * Modulo global de correo electronico de iWana neXt.
 *
 * Decorado con @Global para que MailerService este disponible en todos
 * los modulos sin necesidad de importar MailerModule explicitamente.
 *
 * Depende de ConfigModule (global) para leer las variables SMTP_*.
 */
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
