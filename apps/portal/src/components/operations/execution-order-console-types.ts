import {
  ExecutionOrderResult,
  ExecutionOrderStatus,
  ExecutionOrderItemAction,
  InventoryDisposition,
  SerializedAssetStatus,
} from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderTemplateVersion,
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  ExecutionOrderTemplateRequirement,
  RegisterActivityCommand,
  ReverseItemUsageCommand,
  ListMeta,
} from '@iwana/shared';
import type {
  CloseExecutionOrderDto,
  ExecutionOrderDetailResponse,
  RegisterExecutionOrderItemUsageDto,
  NonRealizationCause,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import type { RequirementActionDescriptor } from './execution-order-actions';
import type { ExecutionOrderMissingRequirement } from './execution-order-requirements';
import type { ExecutionOrderEvidenceUploadHandler } from './use-execution-order-evidence';

/**
 * Contrato público del drawer: lo que `ExecutionOrdersClient` entrega al shell y
 * lo que los slots de requisito leen vía `context` (ver `execution-order-slots.ts`).
 */
export interface ExecutionOrderDrawerProps {
  open: boolean;
  order: ExecutionOrderDetailResponse | null;
  activities: ExecutionOrderActivity[];
  activitiesMeta?: ListMeta;
  itemUsage: ExecutionOrderItemUsage[];
  itemUsageMeta?: ListMeta;
  /** Error de lectura de la colección global de consumos; no es error de mutación. */
  itemUsageError?: string | null;
  /** Reintenta solo la lectura global paginada de consumos de esta OT. */
  onRetryItemUsage?: () => void | Promise<void>;
  evidence?: ExecutionOrderEvidence[] | null;
  evidenceMeta?: ListMeta;
  evidenceState?: 'loading' | 'available' | 'unavailable';
  /** Estado de carga del inventario autorizado (ítems y custodias). */
  itemsState?: 'loading' | 'available' | 'unavailable';
  /** Estado de la custodia del ejecutor; solo se muestra dentro del acto de consumo (UX §6). */
  executorCustodyState?: 'loading' | 'available' | 'unavailable';
  /** Nombre de la ubicación móvil en custodia; null si no hay custodia activa. */
  executorCustodyName?: string | null;
  /** Equipos serializados en custodia (páginas acumuladas). */
  executorCustodyAssets?: SerializedAssetRecord[];
  executorCustodyAssetsMeta?: ListMeta;
  /** Materiales con stock en custodia (páginas acumuladas). */
  executorCustodyBalances?: StockBalanceRecord[];
  executorCustodyBalancesMeta?: ListMeta;
  isLoadingMoreExecutorCustody: boolean;
  onLoadMoreExecutorCustody: () => void | Promise<void>;
  template: ExecutionOrderTemplateVersion | null;
  missingRequirements?: ExecutionOrderMissingRequirement[];
  isLoading: boolean;
  isSubmitting: boolean;
  isAnalyzingEvidence?: boolean;
  error: string | null;
  successMessage?: string | null;
  offline: boolean;
  onClose: () => void;
  onOpenRequirementAction?: (action: RequirementActionDescriptor | null) => void;
  onRefreshDetail?: () => Promise<void>;
  isLoadingMoreActivities: boolean;
  isLoadingMoreItemUsage: boolean;
  isLoadingMoreEvidence: boolean;
  onLoadMoreActivities: () => void | Promise<void>;
  onLoadMoreItemUsage: () => void | Promise<void>;
  onLoadMoreEvidence: () => void | Promise<void>;
  onStart: (notes?: string | null) => Promise<void>;
  onRegisterActivity: (payload: RegisterActivityCommand) => Promise<void | boolean>;
  onUpdateActivity?: (
    activityId: string,
    payload: Partial<RegisterActivityCommand>,
  ) => Promise<void | boolean>;
  onDeleteActivity?: (activityId: string) => Promise<void | boolean>;
  onRegisterItemUsage: (payload: RegisterExecutionOrderItemUsageDto) => Promise<void | boolean>;
  onReverseItemUsage?: (
    usageId: string,
    payload: ReverseItemUsageCommand,
  ) => Promise<void | boolean>;
  onUploadEvidence: ExecutionOrderEvidenceUploadHandler;
  onBlock?: (payload: { reasonCode: string; note?: string }) => Promise<void>;
  onUnblock?: (payload: { resolutionCode: string; note?: string }) => Promise<void>;
  onCloseOrder: (payload: CloseExecutionOrderDto) => Promise<void>;
  /** Opciones entregadas por el boundary de asignacion; no admite texto libre. */
  custodyOptions?: ExecutionOrderCustodyOption[];
  /** Opciones de inventario autorizadas; el formulario no acepta IDs escritos a mano. */
  itemOptions?: Array<{ value: string; label: string }>;
  /** ADR-077 — causas de no realización del catálogo. */
  nonRealizationCauses?: NonRealizationCause[] | null;
  /** ADR-077 — callback de subida de evidencia para intento fallido. */
  onUploadNonRealizationEvidence?: (file: File) => Promise<void | boolean>;
}

export interface ExecutionOrderCustodyOption {
  type: 'TECHNICIAN' | 'CREW';
  id: string;
  label: string;
}
