# PROMPT — MOD05 CRM: Subscriber + Pipeline Consolidado — Fase 01 (Backend)

**Version:** 1.0  
**Fecha:** 2026-04-16  
**Generado por:** AI-EM-ARCH (Modo EM)  
**Destinatario:** AI-SR-FULL (Senior Developer Fullstack)  
**Modulo:** MOD05-CRM-SUBSCRIBERS  
**Fase:** 01 — Backend (Entity, Service, Controller, Motor IVA, Pipeline, Migraciones)  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md  
**HLD de referencia:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs aplicables:** ADR-002, ADR-004, ADR-007, ADR-016, ADR-022, ADR-024, ADR-025 (nuevo), ADR-026 (nuevo)  
**Identidad corporativa:** docs/identity/Manual_Implementacion_Identidad_Iwana.md — Obligatorio respetar en todo frontend (Fase 02)
**Baseline del sprint:** Node 24/25, pnpm 10, NestJS 11.1.x, TypeORM 0.3.28, Next.js 16.1.x, PostgreSQL 18, Zod 4

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** Backend completo del módulo Subscriber dentro de CrmModule, incluyendo entity rediseñada, motor IVA, máquina de estados, CRUD REST, integración con Expediente (creación automática en CLIENTE_ACTIVO), consolidación del pipeline de 12 a 8 estados, migraciones de base de datos, y tests unitarios + integración con cobertura ≥ 80%.

**Lo que sí entra:**

- Entity Subscriber con dos dimensiones (personType + customerSegment)
- VatTreatmentService (motor IVA colombiano)
- SubscriberStatusTransitionService (máquina de estados)
- SubscribersService (CRUD + cifrado PII + búsqueda)
- SubscribersController (8 endpoints REST)
- Integración Expediente → Subscriber (evento SubscriberCreated)
- Consolidación de ExpedienteStatus de 12 a 8 estados
- Actualización de StatusTransitionService y CompletenessCalculator
- Migraciones de base de datos (tabla subscribers + migración de estados)
- Enums en packages/shared
- Tests unitarios e integración

**Lo que no entra:**

- Frontend (Fase 02) — que DEBE seguir la identidad corporativa iWana definida en docs/identity/Manual_Implementacion_Identidad_Iwana.md
- Ficha 360° completa con módulos futuros (stubs solo)
- Portal del suscriptor (público)
- Integración real con Billing, Provisioning, Inventory, WFM, Assurance
- ETL de migración desde sistemas origen
- App móvil

---

## 2. Artefactos de entrada obligatorios

| Artefacto                  | Ubicación                                         | Estado          |
| -------------------------- | ------------------------------------------------- | --------------- |
| PRD del módulo             | docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md       | ✅ Aprobado     |
| HLD CRM                    | docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md          | ✅ Aprobado     |
| PRD maestro                | docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md        | ✅ Aprobado     |
| Stack tecnológico          | docs/prds/Stack_Tecnologico.md                    | ✅ Aprobado     |
| Perfil EM-ARCH             | docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md | ✅ Aprobado     |
| Perfil Sr. Dev             | docs/roles/Perfil_IA_Sr_Dev_Fullstack_v1.md       | ✅ Aprobado     |
| ADR-002 (multi-tenant)     | docs/adrs/ADR-002\*                               | ✅ Aprobado     |
| ADR-004 (soft delete)      | docs/adrs/ADR-004\*                               | ✅ Aprobado     |
| ADR-007 (TypeORM)          | docs/adrs/ADR-007\*                               | ✅ Aprobado     |
| ADR-024 (Expediente Único) | docs/adrs/ADR-024\*                               | ✅ Aprobado     |
| Código existente CRM       | apps/api/src/modules/crm/                         | ✅ Implementado |

---

## 3. Instrucciones paso a paso

### Paso 1: Enums en packages/shared

Crear los siguientes enums en `packages/shared/src/enums/`:

**1.1** `person-type.enum.ts`:

```typescript
export enum PersonType {
  NATURAL = 'NATURAL',
  JURIDICA = 'JURIDICA',
}
```

**1.2** `customer-segment.enum.ts`:

```typescript
export enum CustomerSegment {
  RESIDENTIAL = 'RESIDENTIAL',
  SOHO = 'SOHO',
  PYME = 'PYME',
  CORPORATE = 'CORPORATE',
  GOVERNMENT = 'GOVERNMENT',
  WHOLESALE = 'WHOLESALE',
}
```

**1.3** `vat-treatment.enum.ts`:

```typescript
export enum VatTreatment {
  EXEMPT = 'EXEMPT',
  EXCLUDED = 'EXCLUDED',
  STANDARD = 'STANDARD',
}
```

**1.4** `tax-regime.enum.ts`:

```typescript
export enum TaxRegime {
  SIMPLIFIED = 'SIMPLIFIED',
  COMMON = 'COMMON',
}
```

**1.5** `subscriber-status.enum.ts`:

```typescript
export enum SubscriberStatus {
  LEAD = 'LEAD',
  PROSPECT = 'PROSPECT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}
```

**1.6** Extender `document-type.enum.ts` — agregar PEP y PTP:

```typescript
export enum DocumentType {
  CC = 'CC',
  CE = 'CE',
  PASAPORTE = 'PASAPORTE',
  PEP = 'PEP', // Permiso Especial de Permanencia
  PTP = 'PTP', // Permiso Temporal de Permanencia
  NIT_PERSONA = 'NIT_PERSONA',
}
```

**1.7** Actualizar `packages/shared/src/enums/index.ts` para reexportar todos los nuevos enums.

**1.8** Actualizar `ExpedienteStatus` en `packages/shared/src/enums/crm/expediente-status.enum.ts` — eliminar 4 estados:

```typescript
export enum ExpedienteStatus {
  NUEVO_POTENCIAL = 'NUEVO_POTENCIAL',
  PRECALIFICADO = 'PRECALIFICADO',
  VALIDANDO_COBERTURA = 'VALIDANDO_COBERTURA',
  EN_COTIZACION = 'EN_COTIZACION',
  LISTO_PARA_INSTALACION = 'LISTO_PARA_INSTALACION',
  INSTALACION_AGENDADA = 'INSTALACION_AGENDADA',
  CLIENTE_ACTIVO = 'CLIENTE_ACTIVO',
  DESCARTADO = 'DESCARTADO',
}
// Eliminados: CONTACTADO, PENDIENTE_DATOS, VIABLE_COMERCIALMENTE, PENDIENTE_DECISION
```

**1.9** Ejecutar `pnpm build` en packages/shared para verificar que los enums compilan.

---

### Paso 2: Entity Subscriber

**2.1** Eliminar el archivo existente `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts` (entity legacy incompleta).

**2.2** Eliminar el enum existente `apps/api/src/modules/crm/enums/subscriber-type.enum.ts` (reemplazado por PersonType + CustomerSegment en shared).

**2.3** Crear `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts` con el modelo completo según PRD §6.1. Campos obligatorios según personType:

- NATURAL: documentType, documentNumberEncrypted, firstName, lastName, stratum (1-6)
- JURIDICA: nit, nitVerificationDigit, businessName

Campos compartidos obligatorios: emailEncrypted, phoneEncrypted, address, vatTreatment, taxRegime, personType, customerSegment, status, createdBy.

**2.4** Usar los enums importados de `@iwana/shared` (no enums locales).

**2.5** Índices: idx_subscribers_tenant_status, idx_subscribers_tenant_doc, idx_subscribers_tenant_email, idx_subscribers_tenant_stratum, idx_subscribers_tenant_segment, idx_subscribers_user_id (UNIQUE WHERE user_id IS NOT NULL).

**2.6** Constraint CHECK: chk_subscriber_person_fields que valide campos obligatorios según personType.

---

### Paso 3: VatTreatmentService

**3.1** Crear `apps/api/src/modules/crm/subscribers/vat-treatment.service.ts`:

```typescript
@Injectable()
export class VatTreatmentService {
  resolve(personType: PersonType, stratum: number | null, segment?: CustomerSegment): VatTreatment {
    // JURIDICA siempre STANDARD (incluye GOVERNMENT)
    if (personType === PersonType.JURIDICA) return VatTreatment.STANDARD;
    // NATURAL depende del estrato
    if (stratum === null || stratum === undefined) {
      throw new BadRequestException('Estrato es obligatorio para persona natural.');
    }
    if (stratum <= 2) return VatTreatment.EXEMPT;
    if (stratum === 3) return VatTreatment.EXCLUDED;
    return VatTreatment.STANDARD;
  }

  resolveTaxRegime(personType: PersonType): TaxRegime {
    return personType === PersonType.JURIDICA ? TaxRegime.COMMON : TaxRegime.SIMPLIFIED;
  }

  validateRequiredFields(personType: PersonType, data: Partial<Subscriber>): string[] {
    const errors: string[] = [];
    if (personType === PersonType.NATURAL) {
      if (!data.documentType) errors.push('documentType es obligatorio para persona natural');
      if (!data.documentNumberEncrypted) errors.push('documentNumber es obligatorio');
      if (!data.firstName) errors.push('firstName es obligatorio para persona natural');
      if (!data.lastName) errors.push('lastName es obligatorio para persona natural');
      if (data.stratum === null || data.stratum === undefined)
        errors.push('stratum es obligatorio para persona natural');
      if (data.stratum !== null && (data.stratum < 1 || data.stratum > 6))
        errors.push('stratum debe ser entre 1 y 6');
    }
    if (personType === PersonType.JURIDICA) {
      if (!data.nit) errors.push('nit es obligatorio para persona jurídica');
      if (!data.businessName) errors.push('businessName es obligatorio para persona jurídica');
    }
    return errors;
  }
}
```

**3.2** Crear test unitario `vat-treatment.service.spec.ts` con los 7 casos del PRD (CA-SUB-01 a CA-SUB-07).

---

### Paso 4: SubscriberStatusTransitionService

**4.1** Crear `apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts`:

Transiciones permitidas:

- LEAD → PROSPECT (requiere: documento, nombre, contacto)
- PROSPECT → ACTIVE (requiere: evento de activación)
- ACTIVE → SUSPENDED (requiere: motivo)
- SUSPENDED → ACTIVE (requiere: motivo)
- ACTIVE → CANCELLED (requiere: motivo)
- Cualquier estado → CANCELLED (requiere: motivo)
- CANCELLED es terminal (sin retorno)

**4.2** Cada transición genera un registro en StatusChange (reutilizar la entidad existente del expediente, adaptada para subscriber).

---

### Paso 5: SubscribersService (CRUD + cifrado)

**5.1** Crear `apps/api/src/modules/crm/subscribers/subscribers.service.ts`:

Métodos:

- `create(dto, actorId)` — crea subscriber, cifra PII, calcula vatTreatment y taxRegime automáticamente
- `findAll(filters)` — lista con filtros (status, personType, customerSegment, stratum, search) + paginación
- `findById(id)` — detalle con PII descifrado
- `update(id, dto, actorId)` — actualiza, recalcula vatTreatment si cambia personType o stratum
- `remove(id, actorId)` — soft delete
- `transitionStatus(id, targetStatus, reason, actorId)` — cambia estado con validación
- `search(query)` — búsqueda por documento, NIT, email, nombre (cifrado)
- `createFromExpediente(expedienteId, actorId)` — crea subscriber a partir de expediente CLIENTE_ACTIVO

**5.2** Cifrado PII: reutilizar el mismo patrón AES-256-GCM de ExpedienteService (mismo encryption key, formato `iv:authTag:ciphertext`). NO crear un servicio de cifrado separado — inyectar la misma lógica.

**5.3** Búsqueda por documento/NIT/email: usar comparación determinista (hash SHA-256 del valor plano almacenado en columna separada) para evitar descifrar todos los registros.

**5.4** Todas las operaciones usan `runInTenantSchema` para multi-tenancy.

---

### Paso 6: DTOs y validación Zod

**6.1** Crear `apps/api/src/modules/crm/subscribers/dto/create-subscriber.dto.ts`:

Usar `z.discriminatedUnion('personType', [naturalSchema, juridicaSchema])` para validar campos obligatorios según tipo de persona:

- Natural: documentType, documentNumber, firstName, lastName, stratum (1-6), email, phone, address, customerSegment
- Jurídica: nit, nitVerificationDigit, businessName, email, phone, address, customerSegment

**6.2** Crear `update-subscriber.dto.ts` — todos los campos opcionales excepto los que recalculan IVA.

**6.3** Crear `transition-status.dto.ts` — targetStatus (enum) + reason (string, max 255).

**6.4** Crear `subscriber-response.dto.ts` — respuesta con PII descifrado.

**6.5** Usar `ZodBodyValidationPipe` para validación en el controller (mismo patrón que ExpedientesModule).

---

### Paso 7: SubscribersController

**7.1** Crear `apps/api/src/modules/crm/subscribers/subscribers.controller.ts`:

```
POST   /subscribers                    @Roles(ADMIN, SALES)
GET    /subscribers                    @Roles(ADMIN, SALES, SUPPORT, ACCOUNTANT)
GET    /subscribers/:id                @Roles(ADMIN, SALES, SUPPORT, ACCOUNTANT)
PATCH  /subscribers/:id                @Roles(ADMIN, SALES)
DELETE /subscribers/:id                @Roles(ADMIN)
PATCH  /subscribers/:id/status         @Roles(ADMIN, SUPPORT)
GET    /subscribers/search             @Roles(ADMIN, SALES, SUPPORT, ACCOUNTANT)
GET    /subscribers/:id/360            @Roles(ADMIN, SALES, SUPPORT, ACCOUNTANT)
```

**7.2** Todos los endpoints usan `@JwtAuthGuard()` + `@Roles()` + `TenantContext` para multi-tenancy.

**7.3** Documentar con decoradores Swagger/OpenAPI.

---

### Paso 8: Integración Expediente → Subscriber

**8.1** Crear `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts`:

Este servicio se invoca cuando un expediente transiciona a CLIENTE_ACTIVO:

1. Buscar expediente por ID
2. Determinar personType (si tiene NIT → JURIDICA, si tiene estrato → NATURAL)
3. Determinar customerSegment (por defecto: NATURAL → RESIDENTIAL, JURIDICA → PYME)
4. Copiar datos PII del expediente al subscriber (ya cifrados)
5. Calcular vatTreatment y taxRegime
6. Crear subscriber con status ACTIVE
7. Actualizar expediente con subscriberId
8. Emitir evento `subscriber.created` vía EventEmitter2

**8.2** Modificar `StatusTransitionService.validateClienteActivo()` para invocar SubscriberCreationService después de validar completitud.

**8.3** Crear `apps/api/src/modules/crm/subscribers/events/subscriber-created.event.ts`:

```typescript
export class SubscriberCreatedEvent {
  constructor(
    public readonly subscriberId: string,
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly expedienteId: string,
    public readonly personType: PersonType,
    public readonly customerSegment: CustomerSegment,
    public readonly vatTreatment: VatTreatment,
  ) {}
}
```

---

### Paso 9: Consolidación del pipeline (12 → 8 estados)

**9.1** Actualizar `ExpedienteStatus` enum en `packages/shared/src/enums/crm/expediente-status.enum.ts` (ya hecho en Paso 1.8).

**9.2** Actualizar `StatusTransitionService` en `apps/api/src/modules/crm/expedientes/status-transition.service.ts`:

- Eliminar validadores para estados eliminados: `validateContacted`, `validatePrecalificado` (renombrar a `validatePrecalificado` que absorbe CONTACTADO y PENDIENTE_DATOS), `validateViableComercialmente`, `validatePendienteDecision`.
- Actualizar transiciones permitidas para 8 estados.
- Transiciones eliminadas se mapean a estados vecinos:
  - CONTACTADO → absorbido por NUEVO_POTENCIAL (si hay datos de contacto, se puede ir directo a PRECALIFICADO)
  - PENDIENTE_DATOS → absorbido por PRECALIFICADO (la completitud indica qué falta)
  - VIABLE_COMERCIALMENTE → absorbido por VALIDANDO_COBERTURA (si cobertura es viable, se avanza a EN_COTIZACION)
  - PENDIENTE_DECISION → absorbido por EN_COTIZACION (cotización enviada, esperando decisión)

**9.3** Actualizar `CompletenessCalculator` — no requiere cambios en la lógica de cálculo (opera sobre campos, no sobre estados).

**9.4** Actualizar `expediente-ui.ts` en el portal — eliminar labels y colores de estados eliminados.

**9.5** Actualizar `crmApi` en `apps/portal/src/lib/api-client.ts` — ajustar transiciones permitidas.

---

### Paso 10: Migraciones de base de datos

**10.1** Crear migración `packages/database/src/migrations/tenant/012_add_subscribers.ts`:

- Crear tabla `subscribers` con todos los campos del PRD §6.1
- Crear enum types: person_type_enum, customer_segment_enum, vat_treatment_enum, tax_regime_enum, subscriber_status_enum
- Crear índices compuestos
- Crear constraint CHECK chk_subscriber_person_fields
- Crear unique index idx_subscribers_user_id WHERE user_id IS NOT NULL

**10.2** Crear migración `packages/database/src/migrations/tenant/013_consolidate_expediente_pipeline.ts`:

- Actualizar registros en `expediente_records` que tengan estados eliminados:
  - CONTACTADO → PRECALIFICADO
  - PENDIENTE_DATOS → PRECALIFICADO
  - VIABLE_COMERCIALMENTE → VALIDANDO_COBERTURA
  - PENDIENTE_DECISION → EN_COTIZACION
- Actualizar registros en `status_changes` que referencien estados eliminados
- NO eliminar columnas de estados eliminados del enum de PostgreSQL inmediatamente (dejar para migración posterior después de verificar)

**10.3** Actualizar `packages/database/src/migrations/tenant/runner.ts` para incluir las nuevas migraciones.

**10.4** Verificar que las migraciones son reversibles (down methods).

---

### Paso 11: SubscribersModule

**11.1** Crear `apps/api/src/modules/crm/subscribers/subscribers.module.ts`:

Importar: TypeOrmModule.forFeature([Subscriber]), SubscribersService, VatTreatmentService, SubscriberStatusTransitionService, SubscriberCreationService, SubscribersController.

**11.2** Registrar SubscribersModule en CrmModule.

**11.3** Actualizar `apps/api/src/modules/crm/crm.module.ts` para importar SubscribersModule.

**11.4** Eliminar `SubscriberType` del barrel export en `apps/api/src/modules/crm/enums/index.ts` (reemplazado por enums en shared).

---

### Paso 12: Tests

**12.1** `vat-treatment.service.spec.ts` — 7 tests unitarios (CA-SUB-01 a CA-SUB-07).

**12.2** `subscriber-status-transition.service.spec.ts` — tests para cada transición permitida y prohibida.

**12.3** `subscribers.service.spec.ts` — tests de CRUD, cifrado PII, búsqueda, cálculo automático de IVA.

**12.4** `subscribers.controller.spec.ts` — tests de integración con Supertest para los 8 endpoints.

**12.5** `subscriber-creation.service.spec.ts` — test de creación desde expediente.

**12.6** `status-transition.service.spec.ts` — actualizar tests existentes para 8 estados.

**12.7** Verificar cobertura ≥ 80% en módulos core.

---

## 4. Restricciones no negociables

1. No romper boundaries del modulith — SubscriberModule no importa directamente servicios de otros módulos.
2. No acceder a tablas de otro módulo directamente — usar puertos tipados.
3. No usar credenciales ni datos reales en tests.
4. No omitir pruebas ni documentación.
5. Cifrado PII usa el mismo formato que ExpedienteService (iv:authTag:ciphertext en hex).
6. Multi-tenant: todas las operaciones usan `runInTenantSchema` con `TenantContext`.
7. Audit log en toda operación CUD de Subscriber.
8. Zod validation en todo boundary externo del controller.
9. El motor IVA (VatTreatmentService) es la ÚNICA fuente de verdad para cálculo de tratamiento IVA — ningún otro servicio debe calcular IVA directamente.
10. La consolidación de pipeline (12→8) NO elimina datos — solo mapea estados y actualiza el enum.
11. **Identidad corporativa iWana (para Fase 02 - Frontend):** Todo componente frontend DEBE usar los design tokens, tipografía (Exo 2), colores (primary #17163A, secondary #A5C330), bordes redondeados (2xl estándar), sombras (iwana-shadow-md/lg) y animaciones definidos en `docs/identity/Manual_Implementacion_Identidad_Iwana.md`. Los componentes base son IwanaButton, IwanaCard, IwanaNavbar. Tailwind CSS v4 con configuración CSS-first (@theme directive). shadcn/ui como base personalizada con tokens iWana. Contraste AA: texto sobre blanco usa iwana-secondary-700 o iwana-primary, nunca iwana-secondary DEFAULT sobre blanco.

---

## 5. Entregables técnicos obligatorios

- [ ] Entity Subscriber completa con dos dimensiones
- [ ] VatTreatmentService con tests unitarios
- [ ] SubscriberStatusTransitionService con tests unitarios
- [ ] SubscribersService (CRUD + cifrado + búsqueda) con tests
- [ ] SubscribersController con 8 endpoints REST + Swagger
- [ ] DTOs con validación Zod discriminada por personType
- [ ] SubscriberCreationService (integración Expediente → Subscriber)
- [ ] Evento SubscriberCreated
- [ ] ExpedienteStatus consolidado a 8 estados
- [ ] StatusTransitionService actualizado
- [ ] Migraciones 012 (subscribers) y 013 (pipeline consolidation)
- [ ] Enums en packages/shared (PersonType, CustomerSegment, VatTreatment, TaxRegime, SubscriberStatus, DocumentType extendido)
- [ ] SubscribersModule registrado en CrmModule
- [ ] Cobertura de tests ≥ 80%

---

## 6. Entregables documentales obligatorios

- [ ] Informe de fase en `docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-01-v1.0.md`
- [ ] Evidencia de calidad en `docs/quality/`
- [ ] ADR-025 (modelo de dos dimensiones) en `docs/adrs/`
- [ ] ADR-026 (consolidación pipeline 8 estados) en `docs/adrs/`

---

## 7. Criterios de aceptación

| ID        | Criterio                                                      | Validación                   |
| --------- | ------------------------------------------------------------- | ---------------------------- |
| CA-SUB-01 | NATURAL estrato 2 → EXEMPT                                    | Test VatTreatmentService     |
| CA-SUB-02 | NATURAL estrato 3 → EXCLUDED                                  | Test VatTreatmentService     |
| CA-SUB-03 | NATURAL estrato 5 → STANDARD                                  | Test VatTreatmentService     |
| CA-SUB-04 | JURIDICA cualquier estrato → STANDARD                         | Test VatTreatmentService     |
| CA-SUB-05 | JURIDICA GOVERNMENT → STANDARD (no exento)                    | Test VatTreatmentService     |
| CA-SUB-06 | NATURAL sin estrato → error 400                               | Test validación              |
| CA-SUB-07 | JURIDICA sin NIT → error 400                                  | Test validación              |
| CA-SUB-08 | Expediente CLIENTE_ACTIVO → subscriber creado                 | Test integración             |
| CA-SUB-09 | Cambiar strato → vatTreatment recalculado                     | Test servicio                |
| CA-SUB-10 | Cambiar personType → vatTreatment recalculado                 | Test servicio                |
| CA-SUB-11 | PII cifrado al guardar, descifrado al leer                    | Test cifrado                 |
| CA-SUB-12 | Búsqueda por documento funciona                               | Test búsqueda                |
| CA-SUB-13 | Ficha 360° retorna datos + contacts + contracts + habeas data | Test integración             |
| CA-SUB-14 | Pipeline tiene 8 estados (no 12)                              | Test StatusTransitionService |
| CA-SUB-15 | Expediente → CLIENTE_ACTIVO crea subscriber + emite evento    | Test E2E                     |
| CA-SUB-16 | Migración de estados legacy funciona sin pérdida              | Test migración               |
| CA-SUB-17 | Audit log en toda operación CUD                               | Test auditoría               |
| CA-SUB-18 | RBAC en endpoints de subscriber                               | Test guards                  |

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- La migración de estados legacy causa pérdida de datos en expedientes existentes.
- El cifrado PII no es compatible con el formato existente de ExpedienteService.
- La consolidación de pipeline rompe endpoints del portal que dependen de estados eliminados.
- No se puede compilar después de eliminar SubscriberType enum legacy.

**Documentar causa en:** `docs/quality/BLOCK-MOD05-SUBSCRIBERS-FASE-01.md`

**Escalar a:** AI-EM-ARCH

**Recomendación esperada:** Resolver bloqueo antes de continuar. Si el bloqueo es de arquitectura, emitir ADR.

---

## 9. Criterio de salida de la fase

- [ ] Backend validado: todos los endpoints responden correctamente
- [ ] Base de datos validada: migraciones aplicadas y reversibles
- [ ] Tests en verde: ≥ 80% cobertura en módulos core
- [ ] OpenAPI actualizada con endpoints de subscriber
- [ ] Pipeline consolidado (8 estados) funciona sin regresiones
- [ ] Documentación archivada en docs/informes/ y docs/quality/
- [ ] ADR-025 y ADR-026 aprobados
