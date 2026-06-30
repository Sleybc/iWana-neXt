export enum SlaBreachStatus {
  /** Sin incumplimiento — dentro de los tiempos */
  OK = 'OK',
  /** En riesgo — menos del 20% del tiempo SLA restante */
  AT_RISK = 'AT_RISK',
  /** SLA de primera respuesta vencido */
  FIRST_RESPONSE_BREACHED = 'FIRST_RESPONSE_BREACHED',
  /** SLA de resolución vencido */
  RESOLUTION_BREACHED = 'RESOLUTION_BREACHED',
}
