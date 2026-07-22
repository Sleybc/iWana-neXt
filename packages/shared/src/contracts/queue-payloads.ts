/**
 * Contratos de payload de las colas BullMQ, compartidos entre API (productor)
 * y Worker (consumidor).
 *
 * Por qué viven aquí: `ProvisioningJobPayload` estaba **declarado dos veces**,
 * una en cada app, como interfaces estructurales independientes. TypeScript no
 * relaciona ambas, así que añadir un campo en el productor y olvidarlo en el
 * consumidor compila sin error y el job llega con `undefined` en tiempo de
 * ejecución. Un contrato entre procesos necesita una sola declaración.
 *
 * Recordatorio de la restricción que hace esto necesario: `AsyncLocalStorage`
 * **no** propaga a los jobs de BullMQ. Todo lo que el worker necesite debe
 * viajar explícito en el payload — y nada que sea secreto debe hacerlo, porque
 * el payload queda en Redis (la cola de provisioning usa `removeOnFail: false`,
 * de modo que un job fallido conserva su contenido indefinidamente).
 */

export type {
  UsersBulkCreateJobPayload,
  UsersBulkCreateJobUserItem,
} from './users-bulk-create.contract';

/** Payload del job de provisioning de un tenant nuevo. */
export interface ProvisioningJobPayload {
  tenantId: string;
  schemaName: string;
  tenantSlug: string;
  /**
   * Email del administrador inicial del tenant, indicado al crear la empresa.
   *
   * Sustituye a la constante `admin@iwana.co` que el seed usaba para **todos**
   * los tenants: además de impedir la trazabilidad de quién administra cada
   * empresa, obligaba a cambiarlo a mano después de cada alta. No es un
   * secreto, así que viajar por la cola es correcto.
   */
  adminEmail: string;
}
