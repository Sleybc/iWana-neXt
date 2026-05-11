# CRM ticket de instalacion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que `Agendar instalación` desde un expediente CRM siempre cree o reutilice un ticket operativo interno, enlace ese ticket con WFM y persista las referencias de ticket/work order en CRM antes de mover el expediente a `INSTALACION_AGENDADA`.

**Architecture:** El CTA del expediente sigue siendo de un clic y continúa entrando por `/dashboard/scheduling`, pero la orquestación real pasa a ser: validar expediente -> asegurar ticket operativo idempotente en Assurance -> abrir WFM con `ticketId` bloqueado -> crear evento y work order -> vincular work order al ticket -> persistir referencias operativas en CRM -> transicionar estado del expediente. CRM sigue siendo el origen comercial, Assurance pasa a ser la carpeta viva del seguimiento y WFM mantiene ownership de agenda/ejecución.

**Tech Stack:** Next.js App Router, React 19, NestJS, TypeScript estricto, Zod, TypeORM, Jest, pnpm.

---

## Source documents

- `docs/superpowers/specs/2026-05-09-crm-ticket-instalacion-design.md`
- `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- `docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md`
- `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- `docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md`

## File map

### Shared contracts and labels

- Modify: `packages/shared/src/enums/assurance/ticket-subject-type.enum.ts`  
  Agregar `EXPEDIENTE` como subject tipado para tickets operativos nacidos desde CRM.
- Modify: `apps/portal/src/components/assurance/assurance-labels.ts`  
  Exponer label en español y opción usable por formularios/drawers.
- Modify: `apps/portal/src/components/assurance/assurance-labels.spec.ts`  
  Cubrir el nuevo label y evitar regresiones de copy.
- Modify: `apps/portal/src/lib/api-client.ts`  
  Agregar contratos del endpoint idempotente de ticket y del nuevo endpoint CRM para refs operativas.

### Assurance / tickets

- Modify: `apps/api/src/modules/assurance/dto/index.ts`  
  Agregar schema/DTO para `findOrCreateInstallationTicket`.
- Modify: `apps/api/src/modules/assurance/assurance.controller.ts`  
  Exponer endpoint tenant-aware para crear o reutilizar ticket operativo desde expediente.
- Modify: `apps/api/src/modules/assurance/services/tickets.service.ts`  
  Implementar lookup idempotente por `subjectType=EXPEDIENTE` + `subjectRefId`.
- Modify: `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`  
  Cubrir reutilización y creación de ticket operativo.
- Modify: `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts`  
  Cubrir contrato HTTP y RBAC del nuevo endpoint.

### CRM / expediente

- Create: `apps/api/src/modules/crm/expedientes/dto/link-installation-operational-refs.dto.ts`  
  DTO específico para persistir `ticketId`, `workOrderId` y metadatos de reagendamiento.
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`  
  Exponer endpoint explícito para refs operativas de instalación.
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`  
  Persistir refs sin reutilizar a ciegas `updateSection(INSTALLATION)`.
- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`  
  Cubrir guardado y auditoría de refs operativas.
- Modify: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`  
  Cubrir contrato del nuevo endpoint.

### Portal / scheduling + CRM detail

- Create: `apps/portal/src/components/scheduling/installation-ticket-orchestration.ts`  
  Helper puro para construir payloads y labels del flujo expediente -> ticket -> WFM.
- Create: `apps/portal/src/components/scheduling/installation-ticket-orchestration.spec.ts`  
  Unit tests de reglas de payload/contexto.
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteOperationalRefs.tsx`  
  Superficie chica y reutilizable para mostrar ticket/work order/estado operativo en el detalle.
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteOperationalRefs.spec.tsx`  
  Verificar render y navegación segura de refs.
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`  
  Bloquear `ticketId` y `createWorkOrder` cuando el flujo venga de expediente.
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx`  
  Cubrir ticket bloqueado + work order forzada.
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`  
  Asegurar ticket, crear evento, vincular work order y sincronizar CRM.
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`  
  Cubrir flujo feliz y fallos parciales.
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`  
  Mostrar refs operativas y mantener CTA de un clic.

### Documentation

- Modify: `docs/informes/INFORME-MOD05-GESTION-COMERCIAL-OPERATIVA-FASE01-v1.0.md`
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`

---

### Task 1: Formalizar `EXPEDIENTE` como subject type y reflejarlo en el portal

**Files:**
- Modify: `packages/shared/src/enums/assurance/ticket-subject-type.enum.ts`
- Modify: `apps/portal/src/components/assurance/assurance-labels.ts`
- Test: `apps/portal/src/components/assurance/assurance-labels.spec.ts`
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Escribir la prueba roja de labels y opciones**

```ts
import { TicketSubjectType } from '@iwana/shared';
import {
  ASSURANCE_SUBJECT_TYPE_OPTIONS,
  getAssuranceSubjectTypeLabel,
} from './assurance-labels';

it('mapea el subject type EXPEDIENTE con copy visible para operación', () => {
  expect(getAssuranceSubjectTypeLabel(TicketSubjectType.EXPEDIENTE)).toBe('Expediente');
  expect(ASSURANCE_SUBJECT_TYPE_OPTIONS).toEqual(
    expect.arrayContaining([{ value: TicketSubjectType.EXPEDIENTE, label: 'Expediente' }]),
  );
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/assurance-labels.spec.ts`  
Expected: FAIL con error similar a `Property 'EXPEDIENTE' does not exist on type 'typeof TicketSubjectType'`.

- [ ] **Step 3: Implementar enum, labels y contratos portal**

```ts
// packages/shared/src/enums/assurance/ticket-subject-type.enum.ts
export enum TicketSubjectType {
  SUBSCRIBER = 'SUBSCRIBER',
  CONTRACT = 'CONTRACT',
  SERVICE = 'SERVICE',
  NETWORK_NODE = 'NETWORK_NODE',
  DEVICE = 'DEVICE',
  WORK_ORDER = 'WORK_ORDER',
  INTERNAL_AREA = 'INTERNAL_AREA',
  EXPEDIENTE = 'EXPEDIENTE',
  GENERAL = 'GENERAL',
}
```

```ts
// apps/portal/src/components/assurance/assurance-labels.ts
export const ASSURANCE_SUBJECT_TYPE_LABELS: Record<TicketSubjectType, string> = {
  [TicketSubjectType.SUBSCRIBER]: 'Suscriptor',
  [TicketSubjectType.CONTRACT]: 'Contrato',
  [TicketSubjectType.SERVICE]: 'Servicio',
  [TicketSubjectType.NETWORK_NODE]: 'Nodo de red',
  [TicketSubjectType.DEVICE]: 'Dispositivo',
  [TicketSubjectType.WORK_ORDER]: 'Work order',
  [TicketSubjectType.INTERNAL_AREA]: 'Área interna',
  [TicketSubjectType.EXPEDIENTE]: 'Expediente',
  [TicketSubjectType.GENERAL]: 'General',
};
```

```ts
// apps/portal/src/lib/api-client.ts
export interface FindOrCreateInstallationTicketDto {
  expedienteId: string;
  customerName: string;
}

export interface FindOrCreateInstallationTicketResponse {
  ticket: AssuranceTicket;
  created: boolean;
}

export interface LinkExpedienteInstallationRefsDto {
  ticketId: string;
  workOrderId: string;
  lastRescheduleReason?: string | null | undefined;
  lastRescheduleNotes?: string | null | undefined;
}
```

- [ ] **Step 4: Re-ejecutar prueba y typecheck focal**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/assurance-labels.spec.ts`  
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`  
Expected: PASS sin errores por `TicketSubjectType`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums/assurance/ticket-subject-type.enum.ts \
  apps/portal/src/components/assurance/assurance-labels.ts \
  apps/portal/src/components/assurance/assurance-labels.spec.ts \
  apps/portal/src/lib/api-client.ts
git commit -m "feat: add expediente assurance subject type" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Crear endpoint idempotente en Assurance para ticket operativo de instalación

**Files:**
- Modify: `apps/api/src/modules/assurance/dto/index.ts`
- Modify: `apps/api/src/modules/assurance/assurance.controller.ts`
- Modify: `apps/api/src/modules/assurance/services/tickets.service.ts`
- Test: `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`
- Test: `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts`
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Escribir primero la prueba unitaria de reutilización**

```ts
it('reuses an open operational installation ticket linked to the expediente', async () => {
  mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schemaName, fn) =>
    fn({
      manager: {
        createQueryBuilder: () => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({
            id: '11111111-1111-4111-8111-111111111111',
            ticketNumber: 'TK-20260509-001',
            type: TicketType.OPERATIONAL_TASK,
            status: TicketStatus.OPEN,
            subjectType: TicketSubjectType.EXPEDIENTE,
            subjectRefId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        }),
      },
    } as any),
  );

  const result = await service.findOrCreateInstallationTicket(
    {
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerName: 'Cliente demo',
    },
    actor,
  );

  expect(result).toEqual({
    ticket: expect.objectContaining({
      id: '11111111-1111-4111-8111-111111111111',
      ticketNumber: 'TK-20260509-001',
    }),
    created: false,
  });
});
```

- [ ] **Step 2: Escribir la prueba HTTP del contrato nuevo**

```ts
it('returns 201 when SUPPORT asks assurance to find or create an installation ticket', async () => {
  ticketsServiceMock.findOrCreateInstallationTicket.mockResolvedValue({
    ticket: { id: TICKET_UUID, ticketNumber: 'TK-20260509-001' },
    created: true,
  });

  await request(app.getHttpServer())
    .post('/api/v1/assurance/tickets/find-or-create-installation')
    .set('Authorization', 'Bearer support-token')
    .send({
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
      customerName: 'Cliente demo',
    })
    .expect(201);
});
```

- [ ] **Step 3: Ejecutar backend tests para confirmar rojo**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/assurance/tests/tickets.service.spec.ts src/modules/assurance/tests/assurance.controller.http.spec.ts`  
Expected: FAIL porque `findOrCreateInstallationTicket` y el endpoint aún no existen.

- [ ] **Step 4: Implementar schema, service y controller**

```ts
// apps/api/src/modules/assurance/dto/index.ts
export const FindOrCreateInstallationTicketSchema = z.object({
  expedienteId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(160),
});

export type FindOrCreateInstallationTicketInput = z.input<
  typeof FindOrCreateInstallationTicketSchema
>;

export class FindOrCreateInstallationTicketDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  expedienteId!: string;

  @ApiProperty({ maxLength: 160 })
  @Allow()
  customerName!: string;
}
```

```ts
// apps/api/src/modules/assurance/services/tickets.service.ts
async findOrCreateInstallationTicket(input: FindOrCreateInstallationTicketInput, actor: JwtPayload) {
  const { tenantId, schemaName } = TenantContext.getOrThrow();
  const validated = FindOrCreateInstallationTicketSchema.parse(input);

  const existing = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
    qr.manager
      .createQueryBuilder(SupportTicket, 'st')
      .where('st.tenant_id = :tenantId', { tenantId })
      .andWhere('st.type = :type', { type: TicketType.OPERATIONAL_TASK })
      .andWhere('st.subject_type = :subjectType', { subjectType: TicketSubjectType.EXPEDIENTE })
      .andWhere('st.subject_ref_id = :subjectRefId', { subjectRefId: validated.expedienteId })
      .andWhere('st.queue_name = :queueName', { queueName: TicketQueue.OPERATIONS })
      .orderBy('st.created_at', 'DESC')
      .getOne(),
  );

  if (existing) {
    return { ticket: existing, created: false };
  }

  const ticket = await this.create(
    {
      type: TicketType.OPERATIONAL_TASK,
      priority: TicketPriority.NORMAL,
      source: TicketSource.PORTAL,
      subject: `Instalación - ${validated.customerName}`.slice(0, 200),
      requesterType: TicketRequesterType.INTERNAL_USER,
      requesterRefId: actor.sub,
      subjectType: TicketSubjectType.EXPEDIENTE,
      subjectRefId: validated.expedienteId,
      queueName: TicketQueue.OPERATIONS,
      fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
    },
    actor,
  );

  return { ticket, created: true };
}
```

```ts
// apps/api/src/modules/assurance/assurance.controller.ts
@Post('tickets/find-or-create-installation')
@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
@ApiOperation({ summary: 'Crear o reutilizar ticket operativo de instalación desde expediente CRM' })
findOrCreateInstallationTicket(
  @Body(new ZodValidationPipe(FindOrCreateInstallationTicketSchema))
  dto: FindOrCreateInstallationTicketDto,
  @CurrentUser() actor: JwtPayload,
) {
  return this.ticketsService.findOrCreateInstallationTicket(dto, actor);
}
```

```ts
// apps/portal/src/lib/api-client.ts
findOrCreateInstallation: (dto: FindOrCreateInstallationTicketDto, tenantSlug?: string) =>
  request<FindOrCreateInstallationTicketResponse>(
    '/assurance/tickets/find-or-create-installation',
    { method: 'POST', body: JSON.stringify(dto), returnFullResponse: true },
    tenantSlug,
  ),
```

- [ ] **Step 5: Re-ejecutar tests de backend y commit**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/assurance/tests/tickets.service.spec.ts src/modules/assurance/tests/assurance.controller.http.spec.ts`  
Expected: PASS.

```bash
git add apps/api/src/modules/assurance/dto/index.ts \
  apps/api/src/modules/assurance/assurance.controller.ts \
  apps/api/src/modules/assurance/services/tickets.service.ts \
  apps/api/src/modules/assurance/tests/tickets.service.spec.ts \
  apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts \
  apps/portal/src/lib/api-client.ts
git commit -m "feat: add idempotent installation assurance ticket endpoint" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Persistir refs operativas en CRM con endpoint explícito

**Files:**
- Create: `apps/api/src/modules/crm/expedientes/dto/link-installation-operational-refs.dto.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Escribir la prueba de servicio para guardar ticket y work order**

```ts
it('persiste referencias operativas de instalación y audita el cambio', async () => {
  const expediente = buildExpediente({
    id: 'exp-1',
    ticketId: null,
    workOrderId: null,
    lastRescheduleReason: null,
    lastRescheduleNotes: null,
  });

  const saveMock = jest.fn().mockImplementation(async (_entity, payload) => payload);

  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
    callback({
      manager: {
        findOne: async () => expediente,
        save: saveMock,
      },
    }),
  );

  const result = await service.linkInstallationOperationalRefs(
    'exp-1',
    {
      ticketId: '11111111-1111-4111-8111-111111111111',
      workOrderId: '22222222-2222-4222-8222-222222222222',
      lastRescheduleReason: 'CLIENTE_SOLICITA_CAMBIO',
      lastRescheduleNotes: 'Mover a la tarde',
    },
    'user-1',
  );

  expect(result.ticketId).toBe('11111111-1111-4111-8111-111111111111');
  expect(result.workOrderId).toBe('22222222-2222-4222-8222-222222222222');
  expect(auditServiceMock.log).toHaveBeenCalledWith(
    expect.objectContaining({
      action: AuditAction.UPDATE,
      entityId: 'exp-1',
      userId: 'user-1',
    }),
  );
});
```

- [ ] **Step 2: Escribir la prueba de controller**

```ts
it('propaga refs operativas al servicio desde el endpoint dedicado', async () => {
  expedienteServiceMock.linkInstallationOperationalRefs.mockResolvedValue({
    id: 'exp-1',
    ticketId: '11111111-1111-4111-8111-111111111111',
    workOrderId: '22222222-2222-4222-8222-222222222222',
  });

  const result = await controller.linkInstallationOperationalRefs(
    '00000000-0000-4000-a000-000000000001',
    {
      ticketId: '11111111-1111-4111-8111-111111111111',
      workOrderId: '22222222-2222-4222-8222-222222222222',
      lastRescheduleReason: 'CLIENTE_SOLICITA_CAMBIO',
      lastRescheduleNotes: 'Mover a la tarde',
    },
    {
      sub: 'user-1',
      email: 'hash',
      role: 'ADMIN',
      tenantId: 'tenant-1',
      schemaName: 'tenant_1',
      jti: 'jti-1',
      type: 'tenant',
    },
  );

  expect(expedienteServiceMock.linkInstallationOperationalRefs).toHaveBeenCalledWith(
    '00000000-0000-4000-a000-000000000001',
    expect.objectContaining({
      ticketId: '11111111-1111-4111-8111-111111111111',
      workOrderId: '22222222-2222-4222-8222-222222222222',
    }),
    'user-1',
  );
  expect(result.data.ticketId).toBe('11111111-1111-4111-8111-111111111111');
});
```

- [ ] **Step 3: Ejecutar tests CRM para confirmar rojo**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`  
Expected: FAIL porque el DTO, el endpoint y el método aún no existen.

- [ ] **Step 4: Implementar DTO, servicio, controller y cliente portal**

```ts
// apps/api/src/modules/crm/expedientes/dto/link-installation-operational-refs.dto.ts
export const LinkInstallationOperationalRefsSchema = z.object({
  ticketId: z.string().uuid(),
  workOrderId: z.string().uuid(),
  lastRescheduleReason: z.string().trim().max(64).optional().nullable(),
  lastRescheduleNotes: z.string().trim().max(500).optional().nullable(),
});

export type LinkInstallationOperationalRefsDto = z.infer<
  typeof LinkInstallationOperationalRefsSchema
>;
```

```ts
// apps/api/src/modules/crm/expedientes/expediente.service.ts
async linkInstallationOperationalRefs(
  id: string,
  input: LinkInstallationOperationalRefsDto,
  actorUserId: string,
): Promise<ExpedienteRecord> {
  const { schemaName } = TenantContext.getOrThrow();

  return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
    const expediente = await qr.manager.findOne(ExpedienteRecord, { where: { id } });
    if (!expediente) {
      throw new NotFoundException(`Expediente ${id} no encontrado.`);
    }

    const oldValue = {
      ticketId: expediente.ticketId,
      workOrderId: expediente.workOrderId,
      lastRescheduleReason: expediente.lastRescheduleReason,
      lastRescheduleNotes: expediente.lastRescheduleNotes,
    };

    expediente.ticketId = input.ticketId;
    expediente.workOrderId = input.workOrderId;
    if (input.lastRescheduleReason !== undefined) {
      expediente.lastRescheduleReason = input.lastRescheduleReason?.trim() || null;
    }
    if (input.lastRescheduleNotes !== undefined) {
      expediente.lastRescheduleNotes = input.lastRescheduleNotes?.trim() || null;
    }

    const saved = await qr.manager.save(ExpedienteRecord, expediente);
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: saved.id,
      userId: actorUserId,
      oldValue,
      newValue: {
        ticketId: saved.ticketId,
        workOrderId: saved.workOrderId,
        lastRescheduleReason: saved.lastRescheduleReason,
        lastRescheduleNotes: saved.lastRescheduleNotes,
      },
    });

    return saved;
  });
}
```

```ts
// apps/api/src/modules/crm/expedientes/expedientes.controller.ts
@Patch(':id/installation-operational-refs')
@Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
@ApiOperation({ summary: 'Persistir refs operativas de instalación en el expediente' })
linkInstallationOperationalRefs(
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ZodBodyValidationPipe(LinkInstallationOperationalRefsSchema))
  dto: LinkInstallationOperationalRefsDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.expedienteService
    .linkInstallationOperationalRefs(id, dto, user.sub)
    .then((data) => ({ data }));
}
```

```ts
// apps/portal/src/lib/api-client.ts
linkInstallationOperationalRefs: (
  id: string,
  dto: LinkExpedienteInstallationRefsDto,
  tenantSlug?: string,
) =>
  request<{ data: ExpedienteRecord }>(
    `/crm/expedientes/${id}/installation-operational-refs`,
    { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
    tenantSlug,
  ),
```

- [ ] **Step 5: Re-ejecutar tests CRM y commit**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`  
Expected: PASS.

```bash
git add apps/api/src/modules/crm/expedientes/dto/link-installation-operational-refs.dto.ts \
  apps/api/src/modules/crm/expedientes/expedientes.controller.ts \
  apps/api/src/modules/crm/expedientes/expediente.service.ts \
  apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts \
  apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts \
  apps/portal/src/lib/api-client.ts
git commit -m "feat: link installation operational refs to expediente" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Orquestar portal para ticket automático, work order obligatoria y visibilidad en expediente

**Files:**
- Create: `apps/portal/src/components/scheduling/installation-ticket-orchestration.ts`
- Test: `apps/portal/src/components/scheduling/installation-ticket-orchestration.spec.ts`
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteOperationalRefs.tsx`
- Test: `apps/portal/src/components/crm/expedientes/ExpedienteOperationalRefs.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- Test: `apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

- [ ] **Step 1: Escribir pruebas puras del helper de orquestación**

```ts
import { WorkOrderSourceContext } from '@iwana/shared';
import {
  buildInstallationTicketRequest,
  buildInstallationSchedulingInitialValues,
} from './installation-ticket-orchestration';

it('builds assurance request and scheduling defaults from expediente + ticket', () => {
  const ticket = {
    id: '11111111-1111-4111-8111-111111111111',
    ticketNumber: 'TK-20260509-001',
  };

  expect(
    buildInstallationTicketRequest({
      id: '550e8400-e29b-41d4-a716-446655440000',
      fullName: 'Cliente demo',
    }),
  ).toEqual({
    expedienteId: '550e8400-e29b-41d4-a716-446655440000',
    customerName: 'Cliente demo',
  });

  expect(
    buildInstallationSchedulingInitialValues(buildExpedienteResponse(), ticket as any),
  ).toEqual(
    expect.objectContaining({
      ticketId: '11111111-1111-4111-8111-111111111111',
      createWorkOrder: true,
      workOrderSourceContext: WorkOrderSourceContext.ASSURANCE,
      workOrderSourceRef: '11111111-1111-4111-8111-111111111111',
    }),
  );
});
```

- [ ] **Step 2: Endurecer el formulario con prueba roja**

```ts
it('bloquea ticket y work order cuando el contexto viene de expediente', async () => {
  render(
    <ScheduleEventForm
      technicians={[technician]}
      onSubmit={jest.fn()}
      onCancel={jest.fn()}
      isSubmitting={false}
      error={null}
      initialValues={{
        expedienteId: 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9',
        ticketId: '11111111-1111-4111-8111-111111111111',
        createWorkOrder: true,
        workOrderSourceContext: WorkOrderSourceContext.ASSURANCE,
        workOrderSourceRef: '11111111-1111-4111-8111-111111111111',
      }}
      lockOperationalFlow
    />,
  );

  expect(screen.getByLabelText('Ticket')).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /Crear work order embebida/i })).toBeDisabled();
});
```

- [ ] **Step 3: Escribir la prueba roja del flujo completo en SchedulingClient**

```ts
it('creates or reuses installation ticket, creates the event and syncs CRM refs', async () => {
  mockSearchParams = `open=create&type=INSTALLATION&expedienteId=${EXPEDIENTE_ID}`;
  assuranceApiMock.tickets.findOrCreateInstallation.mockResolvedValue({
    ticket: {
      id: '11111111-1111-4111-8111-111111111111',
      ticketNumber: 'TK-20260509-001',
    },
    created: true,
  });
  wfmApiMock.events.create.mockResolvedValue({
    ...buildEvent(),
    id: 'evt-install-1',
    expedienteId: EXPEDIENTE_ID,
    ticketId: '11111111-1111-4111-8111-111111111111',
    workOrderId: '22222222-2222-4222-8222-222222222222',
  });
  assuranceApiMock.tickets.linkWorkOrder.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    workOrderId: '22222222-2222-4222-8222-222222222222',
  });
  crmApiMock.linkInstallationOperationalRefs.mockResolvedValue({
    data: { id: EXPEDIENTE_ID, ticketId: '11111111-1111-4111-8111-111111111111' },
  });

  render(<SchedulingClient />);

  await waitFor(() => {
    expect(assuranceApiMock.tickets.findOrCreateInstallation).toHaveBeenCalledWith({
      expedienteId: EXPEDIENTE_ID,
      customerName: 'Cliente demo',
    });
  });

  fireEvent.click(await screen.findByRole('button', { name: 'Crear evento' }));

  await waitFor(() => {
    expect(assuranceApiMock.tickets.linkWorkOrder).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ workOrderId: '22222222-2222-4222-8222-222222222222' }),
    );
    expect(crmApiMock.linkInstallationOperationalRefs).toHaveBeenCalledWith(
      EXPEDIENTE_ID,
      expect.objectContaining({
        ticketId: '11111111-1111-4111-8111-111111111111',
        workOrderId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    expect(crmApiMock.transitionExpedienteStatus).toHaveBeenCalledWith(
      EXPEDIENTE_ID,
      expect.objectContaining({ targetStatus: 'INSTALACION_AGENDADA' }),
    );
  });
});
```

- [ ] **Step 4: Implementar helper, form, client y refs visuales**

```ts
// apps/portal/src/components/scheduling/installation-ticket-orchestration.ts
import { WorkOrderSourceContext, WfmWorkType } from '@iwana/shared';
import type {
  AssuranceTicket,
  FindOrCreateInstallationTicketDto,
} from '@/lib/api-client';
import { crmApi } from '@/lib/api-client';
import { formatSchedulingExpedienteLabel } from './scheduling-ui';
import type { ScheduleEventFormInitialValues } from './ScheduleEventForm';

export function buildInstallationTicketRequest(expediente: {
  id: string;
  fullName: string;
}): FindOrCreateInstallationTicketDto {
  return {
    expedienteId: expediente.id,
    customerName: expediente.fullName,
  };
}

export function buildInstallationSchedulingInitialValues(
  response: Awaited<ReturnType<typeof crmApi.getExpediente>>,
  ticket: Pick<AssuranceTicket, 'id' | 'ticketNumber'>,
): ScheduleEventFormInitialValues {
  return {
    type: WfmWorkType.INSTALLATION,
    title: `Instalación - ${response.data.fullName}`.slice(0, 160),
    description: `Evento originado desde CRM para la oportunidad ${formatSchedulingExpedienteLabel(response.data.id)}.`,
    address: response.data.address ?? '',
    municipality: response.data.municipality ?? '',
    expedienteId: response.data.id,
    ticketId: ticket.id,
    createWorkOrder: true,
    workOrderType: WfmWorkType.INSTALLATION,
    workOrderSourceContext: WorkOrderSourceContext.ASSURANCE,
    workOrderSourceRef: ticket.id,
    workOrderSummary: `Instalación asociada al ticket ${ticket.ticketNumber}`.slice(0, 200),
  };
}
```

```ts
// apps/portal/src/components/scheduling/ScheduleEventForm.tsx
interface ScheduleEventFormProps {
  // ...
  lockOperationalFlow?: boolean | undefined;
}

useEffect(() => {
  if (lockOperationalFlow) {
    reset({
      ...defaultValues,
      createWorkOrder: true,
    });
  }
}, [defaultValues, lockOperationalFlow, reset]);
```

```ts
// apps/portal/src/components/scheduling/SchedulingClient.tsx
const [installationTicketContext, setInstallationTicketContext] = useState<{
  id: string;
  ticketNumber: string;
} | null>(null);

const hydrateCreateFromExpediente = useCallback(async (expedienteId: string, options?: { clearQueryOnFinish?: boolean }) => {
  try {
    const response = await crmApi.getExpediente(expedienteId);
    // ...validación existente...
    const ensuredTicket = await assuranceApi.tickets.findOrCreateInstallation(
      buildInstallationTicketRequest(response.data),
    );

    setInstallationTicketContext({
      id: ensuredTicket.ticket.id,
      ticketNumber: ensuredTicket.ticket.ticketNumber,
    });
    setCreateInitialValues(
      buildInstallationSchedulingInitialValues(response, ensuredTicket.ticket),
    );
    setCreateContextLabel(
      `Agendando instalación para ${response.data.fullName} · ticket ${ensuredTicket.ticket.ticketNumber}.`,
    );
    setExpedienteContextId(response.data.id);
    setIsCreateOpen(true);
    return true;
  } catch (prefillError) {
    setInfoMessage(mapSchedulingError(prefillError));
    return false;
  } finally {
    if (options?.clearQueryOnFinish) clearCreateQueryParams();
  }
}, [clearCreateQueryParams]);

const handleCreateEvent = async (payload: CreateWfmScheduleEventDto) => {
  const createdEvent = await wfmApi.events.create(payload);

  if (installationTicketContext?.id && createdEvent.workOrderId && expedienteContextId) {
    await assuranceApi.tickets.linkWorkOrder(installationTicketContext.id, {
      workOrderId: createdEvent.workOrderId,
      notes: 'Work order creada desde Programación para instalación originada en CRM.',
    });
    await crmApi.linkInstallationOperationalRefs(expedienteContextId, {
      ticketId: installationTicketContext.id,
      workOrderId: createdEvent.workOrderId,
    });
    await crmApi.transitionExpedienteStatus(expedienteContextId, {
      targetStatus: 'INSTALACION_AGENDADA',
      reason: 'Instalación agendada desde ticket operativo',
    });
  }
};
```

```tsx
// apps/portal/src/components/crm/expedientes/ExpedienteOperationalRefs.tsx
export function ExpedienteOperationalRefs({
  ticketId,
  workOrderId,
}: {
  ticketId: string | null;
  workOrderId: string | null;
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2">
      <div>
        <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
          Ticket operativo
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
          {ticketId ? ticketId.slice(0, 8).toUpperCase() : 'No vinculado'}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
          Work order
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
          {workOrderId ? workOrderId.slice(0, 8).toUpperCase() : 'No vinculada'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Ejecutar pruebas portal focalizadas, typecheck y commit**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/assurance-labels.spec.ts src/components/scheduling/installation-ticket-orchestration.spec.ts src/components/scheduling/ScheduleEventForm.spec.tsx src/components/scheduling/SchedulingClient.spec.tsx src/components/crm/expedientes/ExpedienteOperationalRefs.spec.tsx`  
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`  
Expected: PASS.

```bash
git add apps/portal/src/components/scheduling/installation-ticket-orchestration.ts \
  apps/portal/src/components/scheduling/installation-ticket-orchestration.spec.ts \
  apps/portal/src/components/scheduling/ScheduleEventForm.tsx \
  apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx \
  apps/portal/src/components/scheduling/SchedulingClient.tsx \
  apps/portal/src/components/scheduling/SchedulingClient.spec.tsx \
  apps/portal/src/components/crm/expedientes/ExpedienteOperationalRefs.tsx \
  apps/portal/src/components/crm/expedientes/ExpedienteOperationalRefs.spec.tsx \
  apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx
git commit -m "feat: orchestrate installation tickets from crm scheduling" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Actualizar documentación viva y ejecutar validación de extremo a extremo

**Files:**
- Modify: `docs/informes/INFORME-MOD05-GESTION-COMERCIAL-OPERATIVA-FASE01-v1.0.md`
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`

- [ ] **Step 1: Documentar el cambio CRM**

```md
## Actualización 2026-05-09 — ticket operativo obligatorio para agendamiento

- El CTA `Agendar instalación` desde expediente ya no abre WFM sin contexto.
- El portal asegura ticket operativo interno por `subjectType = EXPEDIENTE`.
- El expediente persiste `ticketId` y `workOrderId` antes de cerrar el paso a `INSTALACION_AGENDADA`.
```

- [ ] **Step 2: Documentar el cambio WFM**

```md
## Actualización 2026-05-09 — programación ligada a ticket operativo

- Scheduling recibe `ticketId` obligatorio cuando el flujo nace desde CRM.
- La work order embebida se fuerza para instalaciones originadas por expediente.
- El enlace ticket -> work order queda registrado al crear el evento.
```

- [ ] **Step 3: Documentar el cambio Assurance**

```md
## Actualización 2026-05-09 — instalación CRM como ticket interno operativo

- Se agregó `TicketSubjectType.EXPEDIENTE`.
- Nuevo endpoint idempotente para crear o reutilizar ticket operativo desde expediente.
- La cola por defecto del flujo es `OPERATIONS`.
```

- [ ] **Step 4: Ejecutar validación final del feature**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/assurance/tests/tickets.service.spec.ts src/modules/assurance/tests/assurance.controller.http.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts && pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/assurance-labels.spec.ts src/components/scheduling/installation-ticket-orchestration.spec.ts src/components/scheduling/ScheduleEventForm.spec.tsx src/components/scheduling/SchedulingClient.spec.tsx src/components/crm/expedientes/ExpedienteOperationalRefs.spec.tsx && pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal typecheck`  
Expected: PASS en tests y typecheck de los workspaces tocados.

- [ ] **Step 5: Commit**

```bash
git add docs/informes/INFORME-MOD05-GESTION-COMERCIAL-OPERATIVA-FASE01-v1.0.md \
  docs/informes/INFORME-MOD09-FASE-02-v1.0.md \
  docs/informes/INFORME-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md
git commit -m "docs: record crm installation ticket flow" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-review

### Spec coverage

- **Ticket obligatorio antes de programar:** Task 2 + Task 4.
- **Ticket interno operativo con `subjectType = EXPEDIENTE`:** Task 1 + Task 2.
- **Un solo ticket por instalación con reutilización:** Task 2.
- **Persistencia expediente -> ticket/work order:** Task 3 + Task 4.
- **Visibilidad en CRM / trazabilidad transversal:** Task 4.
- **Documentación viva:** Task 5.

### Placeholder scan

- No hay `TODO`, `TBD` ni referencias circulares a "hacer como la tarea anterior".
- Todas las rutas, tipos y métodos usados en tareas posteriores están definidos en tareas previas.

### Type consistency

- `TicketSubjectType.EXPEDIENTE` se define en Task 1 y luego se usa de forma consistente.
- `findOrCreateInstallationTicket` se nombra igual en tests, service, controller y api-client.
- `linkInstallationOperationalRefs` se nombra igual en controller, service y api-client.
