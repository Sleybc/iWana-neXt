import type { ExpedienteStatus } from '../../enums/crm/expediente-status.enum';
import type { ContractAutoCreationIssue, ContractResponse } from '../../schemas/contract.schema';
import type { PrivacyMark } from '../../schemas/privacy/marks';
import type { DataAuthorizationView } from '../../schemas/privacy/authorizations';
import type { RequestSummary } from '../../schemas/privacy/requests';
import type { SubscriberDetail } from '../../schemas/subscriber.schema';

/** Estados que el resumen comercial de la ficha 360° puede publicar. */
export const SUBSCRIBER_360_QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;

export type Subscriber360QuoteStatus = (typeof SUBSCRIBER_360_QUOTE_STATUSES)[number];

/** Resumen comercial de una cotización; nunca incluye el snapshot del plan. */
export interface Subscriber360Quote {
  id: string;
  expedienteId: string | null;
  status: Subscriber360QuoteStatus;
  planId: string;
  monthlyAmount: number;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Registro serializado de detalle y ficha 360°.
 * Reutiliza SubscriberDetail; agrega los campos propios del endpoint de detalle
 * y retira las proyecciones de lista que no viajan en estos dos JSON.
 */
export type SubscriberRecord = Omit<
  SubscriberDetail,
  | 'address'
  | 'altContactPhone'
  | 'documentNumber'
  | 'hasLiveContracts'
  | 'nit'
  | 'nitVerificationDigit'
  | 'otherLiveServicesCount'
  | 'phone'
  | 'primaryService'
  | 'privacyMarks'
  | 'rutResponsibilities'
> & {
  address: string | null;
  altContactName: string | null;
  altContactPhone?: string | null | undefined;
  /** Fecha solo-día en `YYYY-MM-DD`; no es un instante ISO. */
  birthDate: string | null;
  coverageNodeId: string | null;
  /**
   * Aviso del contrato automático que no se pudo crear (fase 2, D-F2). Opcional: lo emiten el
   * detalle, la ficha 360° y las respuestas de escritura cuando la API lo conoce.
   */
  contractAutoCreationIssue?: ContractAutoCreationIssue | null;
  createdBy: string | null;
  deletedAt: string | null;
  documentNumber?: string | null | undefined;
  email?: string | null | undefined;
  externalId: string | null;
  hasLiveContracts?: boolean;
  manualOverrideReason: string | null;
  nit: string | null;
  nitVerificationDigit: string | null;
  phone?: string | null | undefined;
  postalCode: string | null;
  privacyMarks: PrivacyMark[];
  rutResponsibilities: string[];
};

/**
 * Summary tal como viaja en el JSON de la ficha 360°.
 * En titulares bloqueados, el controller conserva id, status, source y fechas;
 * fullName, paymentMethod, billingCycle, fiscalName, interés, add-ons y notas
 * llegan como null (incluidos los arreglos de add-ons).
 */
export interface Subscriber360ExpedienteSummary {
  id: string;
  fullName: string | null;
  status: ExpedienteStatus;
  source: string | null;
  createdAt: string;
  statusChangedAt: string | null;
  paymentMethod: string | null;
  billingCycle: string | null;
  fiscalName: string | null;
  interestedPlanId: string | null;
  additionalProductIds: string[] | null;
  additionalServiceIds: string[] | null;
  commercialNotes: string | null;
}

/** Eventos iniciales que la API entrega a la línea de tiempo de la 360°. */
export interface Subscriber360TimelineSeedItem {
  type: 'SUBSCRIBER_CONVERTED' | 'SUBSCRIBER_ACTIVATED';
  occurredAt: string;
  expedienteId: string | null;
}

/** Resumen de aprovisionamiento publicado junto con la ficha 360°. */
export interface ProvisioningReadinessSummary {
  status:
    | 'PENDIENTE_DE_DATOS'
    | 'LISTO_PARA_APROVISIONAR'
    | 'BLOQUEADO'
    | 'ERROR_REINTENTABLE'
    | 'APROVISIONADO';
  title: string;
  message: string;
  canProvision: boolean;
  retryable: boolean;
  missingRequirements: string[];
}

/** Contrato JSON de la ficha 360° del suscriptor. */
export interface Subscriber360Response {
  subscriber: SubscriberRecord;
  /** Siempre vacío: el contacto canónico es party_contact (ADR-030, D-CONT). */
  contacts: [];
  contracts: ContractResponse[];
  quotes: Subscriber360Quote[];
  /** El actor no puede consultar autorizaciones ni solicitudes de privacidad. */
  privacyDetailsRestricted: boolean;
  habeasData: DataAuthorizationView[];
  arcoRequests: RequestSummary[];
  privacyMarks: PrivacyMark[];
  expedienteSummary: Subscriber360ExpedienteSummary | null;
  timelineSeed: Subscriber360TimelineSeedItem[];
  provisioningReadiness: ProvisioningReadinessSummary;
}
