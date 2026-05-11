export enum PqrDeadlineType {
  /** Plazo inicial de respuesta regulatoria (CRC: 15 días hábiles) */
  INITIAL_RESPONSE = 'INITIAL_RESPONSE',
  /** Plazo de resolución definitiva (CRC: 15 días hábiles adicionales si recurre) */
  FINAL_RESOLUTION = 'FINAL_RESOLUTION',
  /** Plazo de subsanación requerido por el regulador */
  CORRECTION = 'CORRECTION',
}
