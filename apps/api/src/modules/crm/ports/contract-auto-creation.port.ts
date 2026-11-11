/**
 * Contrato automático tras crear el suscriptor de una oportunidad «lista para instalación»
 * (cierre de venta fase 2, bloque A). Lo implementa Contracts; lo invoca el listener de
 * suscriptores, que no puede importar ContractsModule (dependencia inversa).
 */
export interface ContractAutoCreationRequest {
  subscriberId: string;
  expedienteId: string;
  actorId: string;
}

export abstract class ContractAutoCreationPort {
  abstract createForExpediente(request: ContractAutoCreationRequest): Promise<void>;
  /**
   * Reintento tras completar datos del suscriptor con aviso pendiente: vuelve a intentar el
   * contrato automático (idempotente) y, si lo crea, el aviso se limpia. Si aún falta algo,
   * actualiza el aviso sin volver a avisar por correo.
   */
  abstract retryPendingForSubscriber(
    request: ContractAutoCreationRequest,
  ): Promise<'CREATED' | 'EXISTING' | 'MISSING_DATA' | 'SKIPPED'>;
}
