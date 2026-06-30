import {
  ScheduleEventStatus,
  UserRole,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import type {
  InternalUser,
  ListWfmVisitRequestsResponse,
  WfmScheduleEvent,
  WfmVisitRequest,
} from '@/lib/api-client';
import type { SchedulingFilters } from './scheduling-ui';

const DEMO_TENANT_ID = 'demo-tenant';
const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

interface SchedulingDemoDataset {
  events: WfmScheduleEvent[];
  pendingVisitResponse: ListWfmVisitRequestsResponse;
  technicians: InternalUser[];
}

export interface SchedulingDemoState extends SchedulingDemoDataset {
  infoMessage: string;
}

interface SchedulingDemoEligibilityInput {
  environment?: string | undefined;
  events: WfmScheduleEvent[];
  filters: SchedulingFilters;
  pendingVisitResponse: ListWfmVisitRequestsResponse | null;
  technicians: InternalUser[];
  surface: 'agenda' | 'dashboard';
}

function toIsoAt(dayKey: string, time: string): string {
  return new Date(`${dayKey}T${time}:00`).toISOString();
}

function buildDemoTechnicians(dayKey: string): InternalUser[] {
  const createdAt = toIsoAt(dayKey, '06:00');

  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'luisa.campos.demo@iwana.local',
      role: UserRole.TECHNICIAN,
      status: 'ACTIVE',
      tenantId: DEMO_TENANT_ID,
      mfaEnabled: true,
      mfaRequired: false,
      isOperationalResource: true,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      firstName: 'Luisa',
      lastName: 'Campos',
      phone: null,
      jobTitle: 'Técnica de campo',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'carlos.mejia.demo@iwana.local',
      role: UserRole.TECHNICIAN,
      status: 'ACTIVE',
      tenantId: DEMO_TENANT_ID,
      mfaEnabled: true,
      mfaRequired: false,
      isOperationalResource: true,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      firstName: 'Carlos',
      lastName: 'Mejía',
      phone: null,
      jobTitle: 'Técnico FTTH',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'daniela.pardo.demo@iwana.local',
      role: UserRole.CONTRACTOR,
      status: 'ACTIVE',
      tenantId: DEMO_TENANT_ID,
      mfaEnabled: true,
      mfaRequired: false,
      isOperationalResource: true,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      firstName: 'Daniela',
      lastName: 'Pardo',
      phone: null,
      jobTitle: 'Contratista de soporte',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      email: 'jorge.ruiz.demo@iwana.local',
      role: UserRole.TECHNICIAN,
      status: 'ACTIVE',
      tenantId: DEMO_TENANT_ID,
      mfaEnabled: true,
      mfaRequired: false,
      isOperationalResource: true,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      firstName: 'Jorge',
      lastName: 'Ruiz',
      phone: null,
      jobTitle: 'Técnico de mantenimiento',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
  ];
}

function buildDemoEvents(dayKey: string): WfmScheduleEvent[] {
  const createdAt = toIsoAt(dayKey, '06:00');

  return [
    {
      id: 'demo-evt-1',
      tenantId: DEMO_TENANT_ID,
      workOrderId: 'demo-wo-1',
      type: WfmWorkType.INSTALLATION,
      status: ScheduleEventStatus.SCHEDULED,
      title: 'Instalación GPON barrio norte',
      description: 'Instalación con ventana confirmada en la mañana.',
      scheduledStartAt: toIsoAt(dayKey, '07:00'),
      scheduledEndAt: toIsoAt(dayKey, '08:30'),
      assignedUserId: '11111111-1111-4111-8111-111111111111',
      assignedTeamId: null,
      address: 'Cra 10 # 94-25',
      municipality: 'Bogotá',
      sector: 'Chapinero',
      latitude: null,
      longitude: null,
      expedienteId: '550e8400-e29b-41d4-a716-446655440010',
      subscriberId: null,
      organizationSiteId: null,
      ticketId: 'TK-DEMO-001',
      contractId: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-evt-2',
      tenantId: DEMO_TENANT_ID,
      workOrderId: 'demo-wo-2',
      type: WfmWorkType.SUPPORT,
      status: ScheduleEventStatus.EN_ROUTE,
      title: 'Soporte ONU sin sincronía',
      description: 'Cliente reporta caída total del servicio.',
      scheduledStartAt: toIsoAt(dayKey, '09:00'),
      scheduledEndAt: toIsoAt(dayKey, '10:30'),
      assignedUserId: '11111111-1111-4111-8111-111111111111',
      assignedTeamId: null,
      address: 'Cll 73 # 15-11',
      municipality: 'Bogotá',
      sector: 'Barrios Unidos',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: '660e8400-e29b-41d4-a716-446655440010',
      organizationSiteId: null,
      ticketId: 'TK-DEMO-002',
      contractId: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-evt-3',
      tenantId: DEMO_TENANT_ID,
      workOrderId: 'demo-wo-3',
      type: WfmWorkType.TECHNICAL_VISIT,
      status: ScheduleEventStatus.SCHEDULED,
      title: 'Visita técnica empresarial',
      description: 'Validación de potencia y ruta interna.',
      scheduledStartAt: toIsoAt(dayKey, '08:00'),
      scheduledEndAt: toIsoAt(dayKey, '10:00'),
      assignedUserId: '22222222-2222-4222-8222-222222222222',
      assignedTeamId: null,
      address: 'Av. El Dorado # 68-20',
      municipality: 'Bogotá',
      sector: 'Engativá',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      organizationSiteId: null,
      ticketId: 'TK-DEMO-003',
      contractId: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-evt-4',
      tenantId: DEMO_TENANT_ID,
      workOrderId: 'demo-wo-4',
      type: WfmWorkType.SUPPORT,
      status: ScheduleEventStatus.IN_PROGRESS,
      title: 'Ajuste de router extensor',
      description: 'Cruce operativo para mostrar solapes en la agenda.',
      scheduledStartAt: toIsoAt(dayKey, '09:30'),
      scheduledEndAt: toIsoAt(dayKey, '11:00'),
      assignedUserId: '22222222-2222-4222-8222-222222222222',
      assignedTeamId: null,
      address: 'Cra 68 # 80-30',
      municipality: 'Bogotá',
      sector: 'Engativá',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: '660e8400-e29b-41d4-a716-446655440011',
      organizationSiteId: null,
      ticketId: 'TK-DEMO-004',
      contractId: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-evt-5',
      tenantId: DEMO_TENANT_ID,
      workOrderId: 'demo-wo-5',
      type: WfmWorkType.MAINTENANCE,
      status: ScheduleEventStatus.SCHEDULED,
      title: 'Mantenimiento nodo occidente',
      description: 'Ventana preventiva coordinada con operaciones.',
      scheduledStartAt: toIsoAt(dayKey, '11:30'),
      scheduledEndAt: toIsoAt(dayKey, '13:30'),
      assignedUserId: '33333333-3333-4333-8333-333333333333',
      assignedTeamId: null,
      address: 'Zona industrial occidente',
      municipality: 'Bogotá',
      sector: 'Fontibón',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      organizationSiteId: null,
      ticketId: 'TK-DEMO-005',
      contractId: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-evt-6',
      tenantId: DEMO_TENANT_ID,
      workOrderId: 'demo-wo-6',
      type: WfmWorkType.RETIREMENT,
      status: ScheduleEventStatus.SCHEDULED,
      title: 'Retiro CPE sector industrial',
      description: 'Recuperación de equipos y cierre de contrato.',
      scheduledStartAt: toIsoAt(dayKey, '14:00'),
      scheduledEndAt: toIsoAt(dayKey, '15:30'),
      assignedUserId: '44444444-4444-4444-8444-444444444444',
      assignedTeamId: null,
      address: 'Cll 13 # 37-18',
      municipality: 'Bogotá',
      sector: 'Puente Aranda',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: '660e8400-e29b-41d4-a716-446655440012',
      organizationSiteId: null,
      ticketId: 'TK-DEMO-006',
      contractId: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-evt-7',
      tenantId: DEMO_TENANT_ID,
      workOrderId: 'demo-wo-7',
      type: WfmWorkType.TECHNICAL_VISIT,
      status: ScheduleEventStatus.SCHEDULED,
      title: 'Levantamiento técnico para expansión',
      description: 'Visita de factibilidad en edificio corporativo.',
      scheduledStartAt: toIsoAt(dayKey, '16:00'),
      scheduledEndAt: toIsoAt(dayKey, '17:30'),
      assignedUserId: '44444444-4444-4444-8444-444444444444',
      assignedTeamId: null,
      address: 'Cra 7 # 127-48',
      municipality: 'Bogotá',
      sector: 'Usaquén',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      organizationSiteId: null,
      ticketId: 'TK-DEMO-007',
      contractId: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
  ];
}

function buildDemoPendingVisitResponse(dayKey: string): ListWfmVisitRequestsResponse {
  const createdAt = toIsoAt(dayKey, '06:15');

  const items: WfmVisitRequest[] = [
    {
      id: 'demo-vr-1',
      tenantId: DEMO_TENANT_ID,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'EXP-DEMO-101',
      originLabel: 'Oportunidad residencial norte',
      customerDisplayName: 'Ana María León',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.HIGH,
      title: 'Instalación FTTH torre 4',
      description: 'Cliente disponible entre 14:00 y 18:00.',
      requestedWindowStartAt: toIsoAt(dayKey, '14:00'),
      requestedWindowEndAt: toIsoAt(dayKey, '18:00'),
      slaDueAt: toIsoAt(dayKey, '18:30'),
      address: 'Cra 19 # 103-44',
      municipality: 'Bogotá',
      sector: 'Cedritos',
      latitude: null,
      longitude: null,
      organizationSiteId: null,
      expedienteId: '550e8400-e29b-41d4-a716-446655440101',
      subscriberId: null,
      ticketId: 'TK-PEND-001',
      contractId: null,
      scheduleEventId: null,
      workOrderId: null,
      requestedByUserId: DEMO_USER_ID,
      scheduledByUserId: null,
      scheduledAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-vr-2',
      tenantId: DEMO_TENANT_ID,
      status: VisitRequestStatus.NEEDS_CONTEXT,
      originContext: WorkOrderSourceContext.ASSURANCE,
      originRef: 'TK-33492',
      originLabel: 'Incidencia de intermitencia',
      customerDisplayName: 'Conjunto El Retiro',
      workType: WfmWorkType.SUPPORT,
      priority: WorkOrderPriority.URGENT,
      title: 'Validar caída recurrente de enlace',
      description: 'Falta confirmar acceso al cuarto técnico.',
      requestedWindowStartAt: toIsoAt(dayKey, '10:00'),
      requestedWindowEndAt: toIsoAt(dayKey, '12:00'),
      slaDueAt: toIsoAt(dayKey, '13:00'),
      address: 'Cll 95 # 11A-30',
      municipality: 'Bogotá',
      sector: 'Chicó',
      latitude: null,
      longitude: null,
      organizationSiteId: null,
      expedienteId: null,
      subscriberId: '660e8400-e29b-41d4-a716-446655440120',
      ticketId: 'TK-PEND-002',
      contractId: null,
      scheduleEventId: null,
      workOrderId: null,
      requestedByUserId: DEMO_USER_ID,
      scheduledByUserId: null,
      scheduledAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      rejectReason: 'Pendiente acceso de seguridad',
    },
    {
      id: 'demo-vr-3',
      tenantId: DEMO_TENANT_ID,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.MANUAL,
      originRef: 'MAN-OPS-88',
      originLabel: 'Levantamiento manual',
      customerDisplayName: 'Bodega San Carlos',
      workType: WfmWorkType.TECHNICAL_VISIT,
      priority: WorkOrderPriority.NORMAL,
      title: 'Visita de factibilidad logística',
      description: 'Confirmar ductería y potencia disponible.',
      requestedWindowStartAt: toIsoAt(dayKey, '15:00'),
      requestedWindowEndAt: toIsoAt(dayKey, '17:00'),
      slaDueAt: toIsoAt(dayKey, '19:00'),
      address: 'Autopista sur km 7',
      municipality: 'Soacha',
      sector: 'Zona industrial',
      latitude: null,
      longitude: null,
      organizationSiteId: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      scheduleEventId: null,
      workOrderId: null,
      requestedByUserId: DEMO_USER_ID,
      scheduledByUserId: null,
      scheduledAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    {
      id: 'demo-vr-4',
      tenantId: DEMO_TENANT_ID,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.PROVISIONING,
      originRef: 'PV-2204',
      originLabel: 'Normalización operativa',
      customerDisplayName: 'Laura Sánchez',
      workType: WfmWorkType.MAINTENANCE,
      priority: WorkOrderPriority.HIGH,
      title: 'Normalizar acometida y herraje',
      description: 'Cliente validó atención después de las 08:00.',
      requestedWindowStartAt: toIsoAt(dayKey, '08:00'),
      requestedWindowEndAt: toIsoAt(dayKey, '11:00'),
      slaDueAt: toIsoAt(dayKey, '16:00'),
      address: 'Cra 52 # 4-18',
      municipality: 'Bogotá',
      sector: 'Kennedy',
      latitude: null,
      longitude: null,
      organizationSiteId: null,
      expedienteId: null,
      subscriberId: '660e8400-e29b-41d4-a716-446655440121',
      ticketId: 'TK-PEND-004',
      contractId: null,
      scheduleEventId: null,
      workOrderId: null,
      requestedByUserId: DEMO_USER_ID,
      scheduledByUserId: null,
      scheduledAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
  ];

  return {
    items,
    meta: {
      total: items.length,
      page: 1,
      limit: items.length,
      totalPages: 1,
    },
  };
}

function buildSchedulingDemoDataset(dayKey: string): SchedulingDemoDataset {
  return {
    technicians: buildDemoTechnicians(dayKey),
    events: buildDemoEvents(dayKey),
    pendingVisitResponse: buildDemoPendingVisitResponse(dayKey),
  };
}

export function shouldUseSchedulingDemoState({
  environment = process.env.NODE_ENV,
  events,
  filters,
  pendingVisitResponse,
  technicians,
  surface,
}: SchedulingDemoEligibilityInput): boolean {
  if (environment !== 'development') {
    return false;
  }

  if (surface !== 'agenda' || filters.view !== 'day') {
    return false;
  }

  return (
    events.length === 0 &&
    technicians.length === 0 &&
    (pendingVisitResponse?.items.length ?? 0) === 0
  );
}

export function buildSchedulingDemoState(filters: SchedulingFilters): SchedulingDemoState {
  const dayKey = filters.fromDate;
  const dataset = buildSchedulingDemoDataset(dayKey);

  return {
    technicians: filters.technicianId
      ? dataset.technicians.filter((technician) => technician.id === filters.technicianId)
      : dataset.technicians,
    events: dataset.events
      .filter((event) => !filters.technicianId || event.assignedUserId === filters.technicianId)
      .filter((event) => !filters.type || event.type === filters.type)
      .filter((event) => !filters.status || event.status === filters.status)
      .sort(
        (left, right) =>
          new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
      ),
    pendingVisitResponse: {
      ...dataset.pendingVisitResponse,
      items: dataset.pendingVisitResponse.items.filter(
        (visitRequest) => !filters.type || visitRequest.workType === filters.type,
      ),
      meta: {
        ...dataset.pendingVisitResponse.meta,
        total: dataset.pendingVisitResponse.items.filter(
          (visitRequest) => !filters.type || visitRequest.workType === filters.type,
        ).length,
      },
    },
    infoMessage:
      'Mostrando un dataset demo local porque esta agenda todavía no tiene recursos operativos, eventos ni decisiones pendientes.',
  };
}
