# MOD10 hallazgos finales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los hallazgos abiertos de MOD10 Fase 01 en validación, reglas PQR/RESOLVED, dashboard, evidencia OpenAPI y explicitación operativa de WFM.

**Architecture:** La corrección se concentra en el backend de `apps/api/src/modules/assurance` y su evidencia documental. La validación semántica debe moverse al boundary HTTP con Zod, la lógica de negocio de PQR debe quedar encapsulada en `TicketsService` + `SlaService`, y la evidencia de salida debe cerrarse con pruebas focalizadas, verificación OpenAPI y actualización de informe/checklist.

**Tech Stack:** NestJS, Zod, class-validator, TypeORM, PostgreSQL multi-tenant por schema, Jest, OpenAPI Swagger, pnpm.

---

### Task 1: Validación Zod en el boundary HTTP

**Files:**
- Create: `apps/api/src/common/pipes/zod-validation.pipe.ts`
- Modify: `apps/api/src/modules/assurance/assurance.controller.ts`
- Modify: `apps/api/src/modules/assurance/dto/index.ts`
- Test: `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts`

- [ ] **Step 1: Escribir la prueba HTTP que debe fallar**

```ts
it('should reject assign when assignedUserId and queueName are both missing', async () => {
  const response = await request(app.getHttpServer())
    .post(`/api/v1/assurance/tickets/${ticketId}/assign`)
    .set('Authorization', `Bearer ${supportToken}`)
    .set('X-Tenant-Slug', tenant.slug)
    .send({});

  expect(response.status).toBe(400);
  expect(response.body.message).toContain('assignedUserId o queueName');
});
```

- [ ] **Step 2: Ejecutar solo la prueba para confirmar el fallo**

Run: `cd apps/api && npx jest src/modules/assurance/tests/assurance.controller.http.spec.ts --runInBand --testNamePattern="assignedUserId and queueName"`  
Expected: FAIL porque el refine de Zod no se aplica en el controller boundary actual.

- [ ] **Step 3: Implementar el pipe Zod reutilizable**

```ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: error.issues.map((issue) => issue.message).join('; '),
          details: error.issues,
        });
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Aplicar el pipe en `AssuranceController`**

```ts
assignTicket(
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ZodValidationPipe(AssignTicketSchema)) dto: AssignTicketDto,
  @CurrentUser() actor: JwtPayload,
) {
  return this.ticketsService.assign(id, dto, actor);
}
```

```ts
listTickets(
  @Query(new ZodValidationPipe(ListTicketsQuerySchema)) query: ListTicketsQueryDto,
  @CurrentUser() actor: JwtPayload,
) {
  return this.ticketsService.list(query, actor);
}
```

- [ ] **Step 5: Repetir el patrón en los demás endpoints Assurance**

```ts
@Body(new ZodValidationPipe(CreateTicketSchema)) dto: CreateTicketDto
@Body(new ZodValidationPipe(TransitionTicketSchema)) dto: TransitionTicketDto
@Body(new ZodValidationPipe(AddCommentSchema)) dto: AddCommentDto
@Body(new ZodValidationPipe(RequestFieldServiceSchema)) dto: RequestFieldServiceDto
@Body(new ZodValidationPipe(LinkWorkOrderSchema)) dto: LinkWorkOrderDto
@Body(new ZodValidationPipe(UpdateTicketSchema)) dto: UpdateTicketDto
@Body(new ZodValidationPipe(CreateSlaPolicySchema)) dto: CreateSlaPolicyDto
```

- [ ] **Step 6: Ejecutar la prueba del controller y ajustar mensajes si hace falta**

Run: `cd apps/api && npx jest src/modules/assurance/tests/assurance.controller.http.spec.ts --runInBand`  
Expected: PASS y errores 400 semánticos desde el boundary.


### Task 2: Reglas RESOLVED/PQR y deadline hábil

**Files:**
- Modify: `apps/api/src/modules/assurance/dto/index.ts`
- Modify: `apps/api/src/modules/assurance/services/tickets.service.ts`
- Modify: `apps/api/src/modules/assurance/services/sla.service.ts`
- Test: `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`

- [ ] **Step 1: Escribir las pruebas que deben fallar**

```ts
it('should reject RESOLVED transition without notes', async () => {
  await expect(
    service.transitionStatus(ticket.id, { status: TicketStatus.RESOLVED }, supportActor),
  ).rejects.toThrow('nota operativa');
});

it('should calculate PQR deadline in business days', () => {
  const createdAt = new Date('2026-05-08T15:00:00.000Z'); // viernes
  const deadline = service.calculatePqrDeadline(createdAt);
  expect(deadline.toISOString()).toBe('2026-05-29T15:00:00.000Z');
});
```

- [ ] **Step 2: Ejecutar el archivo de pruebas para confirmar el fallo**

Run: `cd apps/api && npx jest src/modules/assurance/tests/tickets.service.spec.ts --runInBand`  
Expected: FAIL por falta de nota obligatoria y por deadline PQR en minutos corridos.

- [ ] **Step 3: Endurecer el contrato de transición**

```ts
export const TransitionTicketSchema = z.object({
  status: z.nativeEnum(TicketStatus),
  notes: z.string().trim().optional().nullable(),
});
```

```ts
if (validated.status === TicketStatus.RESOLVED && !validated.notes?.trim()) {
  throw new BadRequestException('El estado RESOLVED exige una nota operativa.');
}
```

- [ ] **Step 4: Validar cierre regulatorio de PQR antes de resolver/cerrar**

```ts
if (
  ticket.type === TicketType.PQR &&
  [TicketStatus.RESOLVED, TicketStatus.CLOSED].includes(validated.status)
) {
  const pqrRecord = await qr.manager.findOne(TicketPqrRecord, {
    where: { ticketId: id, tenantId },
  });

  if (!pqrRecord || !this.pqrService.isRegulatoryRecordComplete(pqrRecord)) {
    throw new BadRequestException(
      'No es posible cerrar la PQR sin completar la trazabilidad regulatoria.',
    );
  }
}
```

- [ ] **Step 5: Cambiar `calculatePqrDeadline()` a días hábiles L-V**

```ts
calculatePqrDeadline(createdAt: Date): Date {
  const deadline = new Date(createdAt);
  let remainingBusinessDays = 15;

  while (remainingBusinessDays > 0) {
    deadline.setDate(deadline.getDate() + 1);
    const day = deadline.getDay();
    if (day !== 0 && day !== 6) {
      remainingBusinessDays -= 1;
    }
  }

  return deadline;
}
```

- [ ] **Step 6: Ejecutar las pruebas focalizadas de servicio**

Run: `cd apps/api && npx jest src/modules/assurance/tests/tickets.service.spec.ts --runInBand`  
Expected: PASS para resolución con nota, bloqueo PQR y deadline hábil.


### Task 3: Dashboard por cola, OpenAPI y WFM degradado

**Files:**
- Modify: `apps/api/src/modules/assurance/services/assurance-dashboard.service.ts`
- Modify: `apps/api/src/modules/assurance/assurance.controller.ts`
- Modify: `apps/api/src/modules/assurance/ports/assurance-field-service.adapter.ts`
- Modify: `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts`
- Modify: `docs/informes/INFORME-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`
- Modify: `docs/quality/CHECKLIST-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`
- Create or Modify: `apps/api/test/openapi/assurance-openapi.spec.ts`

- [ ] **Step 1: Escribir la prueba del dashboard/OpenAPI**

```ts
it('should expose queue load in dashboard summary', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/v1/assurance/dashboard/summary')
    .set('Authorization', `Bearer ${supportToken}`)
    .set('X-Tenant-Slug', tenant.slug);

  expect(response.status).toBe(200);
  expect(response.body.byQueue).toEqual(
    expect.objectContaining({
      SUPPORT: expect.any(Number),
    }),
  );
});
```

```ts
it('should publish assurance paths in generated OpenAPI document', async () => {
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  expect(document.paths['/api/v1/assurance/tickets']).toBeDefined();
  expect(document.paths['/api/v1/assurance/dashboard/summary']).toBeDefined();
});
```

- [ ] **Step 2: Ejecutar las pruebas para confirmar el fallo**

Run: `cd apps/api && npx jest src/modules/assurance/tests/assurance.controller.http.spec.ts apps/api/test/openapi/assurance-openapi.spec.ts --runInBand`  
Expected: FAIL porque `byQueue` no existe y no hay verificación OpenAPI aún.

- [ ] **Step 3: Extender el summary del dashboard**

```ts
export interface AssuranceDashboardSummary {
  openCount: number;
  assignedCount: number;
  inProgressCount: number;
  atRiskCount: number;
  breachedCount: number;
  resolvedTodayCount: number;
  fieldServicePendingCount: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  byQueue: Record<string, number>;
}
```

```ts
if (![TicketStatus.CLOSED, TicketStatus.CANCELLED].includes(ticket.status)) {
  byPriority[ticket.priority] = (byPriority[ticket.priority] ?? 0) + 1;
  byType[ticket.type] = (byType[ticket.type] ?? 0) + 1;
  if (ticket.queueName) {
    byQueue[ticket.queueName] = (byQueue[ticket.queueName] ?? 0) + 1;
  }
}
```

- [ ] **Step 4: Hacer explícito el modo degradado del adapter WFM**

```ts
if (!this.queue) {
  this.logger.warn(
    `[${ASSURANCE_FIELD_SERVICE_QUEUE}] modo degradado: sin consumidor downstream; ticketId=${req.ticketId} tenant=${req.tenantId}`,
  );
  return;
}
```

- [ ] **Step 5: Agregar la verificación automatizada de OpenAPI**

```ts
describe('Assurance OpenAPI', () => {
  it('should expose assurance endpoints in the generated document', async () => {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    expect(Object.keys(document.paths).some((path) => path.includes('/assurance'))).toBe(true);
  });
});
```

- [ ] **Step 6: Actualizar informe y checklist con la nueva evidencia**

```md
- `dashboard/summary` ya expone `byQueue`.
- OpenAPI queda cubierto por verificación automatizada.
- WFM mantiene boundary correcto, pero el adapter declara modo degradado si no hay consumidor downstream.
```

- [ ] **Step 7: Ejecutar la validación final focalizada**

Run: `pnpm --filter @iwana/api typecheck && cd apps/api && npx jest src/modules/assurance/tests/tickets.service.spec.ts src/modules/assurance/tests/assurance.controller.http.spec.ts apps/api/test/openapi/assurance-openapi.spec.ts --runInBand`  
Expected: PASS sin regresiones en MOD10.

---

## Self-review

- **Cobertura del spec:** el plan cubre boundary Zod, reglas RESOLVED/PQR, deadline hábil, `byQueue`, OpenAPI verificable y WFM degradado.
- **Placeholders:** no quedan `TODO`, `TBD` ni pasos ambiguos.
- **Consistencia:** los nombres `ZodValidationPipe`, `calculatePqrDeadline`, `byQueue` y `assurance-openapi.spec.ts` son consistentes entre tareas.
