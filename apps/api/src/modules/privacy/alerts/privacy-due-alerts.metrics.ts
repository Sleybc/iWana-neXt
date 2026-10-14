import { Injectable, Logger } from '@nestjs/common';

/** Emite una señal contable en los logs del API, sin etiquetas personales. */
@Injectable()
export class PrivacyDueAlertsMetrics {
  private readonly logger = new Logger(PrivacyDueAlertsMetrics.name);

  recordNoRecipients(schemaName: string): void {
    this.logger.warn(
      JSON.stringify({
        event: 'privacy_due_alerts_no_recipients',
        metric: 'privacy_due_alerts_no_recipients_total',
        value: 1,
        schemaName,
      }),
    );
  }
}
