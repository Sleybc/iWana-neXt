/**
 * Tratamiento IVA colombiano para servicios de Internet.
 *
 * Regla (Ley 1819/2016, Estatuto Tributario Arts. 476-477):
 * - EXEMPT: Estratos 1-2 (gravado tarifa 0%, se declara en IVA)
 * - EXCLUDED: Estrato 3 (fuera del régimen IVA, no se declara)
 * - STANDARD: Estratos 4-6 y personas jurídicas (IVA 19%)
 *
 * El segmento de negocio (customerSegment) NO afecta el IVA.
 * Las entidades gubernamentales pagan IVA al 19% (STANDARD).
 */
export enum VatTreatment {
  EXEMPT = 'EXEMPT',
  EXCLUDED = 'EXCLUDED',
  STANDARD = 'STANDARD',
}
