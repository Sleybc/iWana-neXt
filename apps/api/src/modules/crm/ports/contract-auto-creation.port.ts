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
}
