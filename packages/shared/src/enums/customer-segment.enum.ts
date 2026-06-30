/**
 * Segmento de negocio del ISP para el suscriptor.
 * Dimensión ortogonal a personType: determina tipo de plan, SLA y provisioning.
 * NO afecta el cálculo de IVA — solo personType + stratum lo hacen.
 */
export enum CustomerSegment {
  RESIDENTIAL = 'RESIDENTIAL', // Hogares — B2C, alta sensibilidad al precio
  SOHO = 'SOHO', // Small Office/Home Office — micro-negocios
  PYME = 'PYME', // Pequeñas y medianas empresas — B2B
  CORPORATE = 'CORPORATE', // Enterprise — Dedicado 1:1, redundancia, SLA premium
  GOVERNMENT = 'GOVERNMENT', // Gobierno e instituciones públicas — licitaciones
  WHOLESALE = 'WHOLESALE', // Mayoristas/carriers — tránsito IP, capacidad
}
