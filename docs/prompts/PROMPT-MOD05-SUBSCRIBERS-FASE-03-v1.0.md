# PROMPT — MOD05 CRM: Subscriber Two-Stage Conversion + 360° — Fase 03

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-17  
**Generado por:** AI-EM-ARCH (Modo Architect)  
**Destinatario:** AI-SR-FULL (Senior Developer Fullstack)  
**Modulo:** MOD05-CRM-SUBSCRIBERS  
**Fase:** 03 — Conversión Expediente → Subscriber + Vista 360°  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md  
**PRD padre:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md  
**PRD Fase 02:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md  
**PRD complementario:** docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md  
**HLD de referencia:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs aplicables:** ADR-002, ADR-004, ADR-016, ADR-019, ADR-022, ADR-024, ADR-025, ADR-026  
**ADR requerido en esta fase:** ADR-027  
**Informe relacionado vigente:** docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-01-v1.0.md  
**Identidad corporativa:** docs/identity/Manual_Implementacion_Identidad_Iwana.md — Obligatorio  
**Baseline:** Node 24/25, pnpm 10, NestJS, Next.js App Router, React 19, Tailwind CSS v4, TypeORM, PostgreSQL multi-tenant por schema

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** cerrar el gap entre pipeline CRM y entidad Subscriber mediante una conversión en dos etapas y entregar una vista Subscriber 360° operativa, consistente con el expediente detail y lista para soportar operación comercial, cumplimiento y soporte.

**Lo que sí entra:**

- Migración de `subscribers` para incorporar trazabilidad del expediente origen.
- Eventos de dominio y listeners para creación, activación y cancelación automática.
- Refactor de `ExpedienteService.transitionStatus()` para emitir eventos de pipeline.
- Filtro de expedientes abiertos que excluye por defecto `CLIENTE_ACTIVO` y `DESCARTADO`.
- Override manual del alta de subscriber con autorización administrativa y razón obligatoria.
- Extensión del endpoint `GET /crm/subscribers/:id/360` y nuevos endpoints de guardado por sección.
- Refactor del portal subscriber hacia una vista 360° con 6 tabs y layout espejo del expediente.
- Tests unitarios e integración de la conversión y del guardado por sección.

**Lo que no entra:**

- Facturación real, pagos, tickets, consumo, inventario o provisioning reales.
- Reuso interno de componentes entre expediente y subscriber.
- WebSockets, SSE o cambios de stack.
- Nuevos módulos fuera del boundary CRM.

---

## 2. Artefactos de entrada obligatorios

Lee y comprende estos documentos antes de escribir código:

| Artefacto | Ruta | Relevancia |
| --- | --- | --- |
| PRD fase actual | `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md` | Alcance funcional aprobado |
| PRD padre | `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md` | Modelo funcional base de subscriber |
| PRD Fase 02 | `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md` | Punto de partida del portal existente |
| PRD Auto-Pipeline | `docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md` | Reglas del pipeline de expediente |
| HLD CRM | `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md` | Boundaries, estructura y puertos |
| ADR-024 | `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md` | Estrategia de evolución de expediente |
| ADR-025 | `docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md` | Modelo fiscal y de segmento |
| ADR-026 | `docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md` | Pipeline consolidado |
| Stack Tecnológico | `docs/prds/Stack_Tecnologico.md` | Versiones reales |
| AGENTS.md | `AGENTS.md` | Reglas del repo |

### Archivos de código de referencia

| Archivo | Patrón a seguir |
| --- | --- |
| `apps/api/src/modules/crm/expedientes/expediente.service.ts` | Transiciones y persistencia principal |
| `apps/api/src/modules/crm/subscribers/services/subscriber-creation.service.ts` | Base de la conversión actual |
| `apps/api/src/modules/crm/subscribers/subscribers.controller.ts` | Contratos REST y guards |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts` | CRUD y lógica principal subscriber |
| `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx` | Patrón visual header |
| `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx` | Patrón visual tabs |
| `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx` | Patrón de sections y grid |
| `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx` | Patrón de timeline |
| `apps/portal/src/lib/api-client.ts` | API client del portal |

---

## 3. Alcance técnico de la fase

### Backend

1. Crear ADR-027 para formalizar la conversión Expediente → Subscriber en dos etapas.
2. Crear migración reversible para `expedienteId`, `convertedAt`, `activatedAt` en `subscribers`.
3. Crear eventos `ExpedienteReadyForInstallationEvent`, `ExpedienteActivatedEvent` y `ExpedienteDiscardedEvent`.
4. Crear eventos `SubscriberConvertedEvent` y `SubscriberActivatedEvent`.
5. Refactorizar la creación automática para producir `PROSPECT` en `LISTO_PARA_INSTALACION`.
6. Crear listeners de activación y cancelación.
7. Agregar guard y payload de override manual en `POST /crm/subscribers`.
8. Agregar endpoint `PATCH /crm/subscribers/:id/section/:section`.
9. Extender `GET /crm/subscribers/:id/360` para devolver datos reales agregados del bounded context.
10. Filtrar por defecto expedientes completados o descartados del pipeline abierto.

### Portal

1. Refactorizar `SubscriberDetailClient` a una vista 360° de 6 tabs.
2. Replicar patrón visual del expediente sin compartir componentes internos en esta fase.
3. Agregar Vista general, Datos, Servicios, Financiero, Cumplimiento y Seguimiento.
4. Implementar guardado por sección con loading y validación parcial.
5. Añadir resumen del expediente origen con link inverso.
6. Mostrar placeholders honestos para Billing, Tickets, Inventory y Provisioning.

### Testing

1. Unit tests de creación automática con idempotencia.
2. Unit tests de activación automática.
3. Unit tests de cancelación automática por descarte.
4. Tests de integración del flujo expediente → subscriber.
5. Tests del endpoint de guardado por sección.

---

## 4. Instrucciones de implementación backend

### 4.1 Migración y entidad subscriber

Crear una migración reversible en `packages/database/src/migrations/tenant/` para:

- agregar `expediente_id UUID NULL`;
- agregar `converted_at TIMESTAMPTZ NULL`;
- agregar `activated_at TIMESTAMPTZ NULL`;
- crear índice por tenant + `expediente_id` cuando aplique;
- mantener compatibilidad con registros legacy.

Actualizar `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts` con los campos nuevos y decoradores correspondientes.

### 4.2 Eventos de dominio

Crear:

```text
apps/api/src/modules/crm/expedientes/events/expediente-pipeline.events.ts
apps/api/src/modules/crm/subscribers/events/subscriber-converted.event.ts
apps/api/src/modules/crm/subscribers/events/subscriber-activated.event.ts
```

Reglas:

1. usar EventEmitter2 intra-módulo;
2. no introducir BullMQ;
3. los eventos deben transportar tenantId, schemaName y los ids relevantes;
4. no acoplar servicios directamente por llamadas ad hoc si el diseño aprobado ya definió eventos.

### 4.3 Wiring del pipeline

Modificar `ExpedienteService.transitionStatus()` para emitir:

- `ExpedienteReadyForInstallationEvent` al pasar a `LISTO_PARA_INSTALACION`;
- `ExpedienteActivatedEvent` al pasar a `CLIENTE_ACTIVO`;
- `ExpedienteDiscardedEvent` al pasar a `DESCARTADO`.

No revertir la transición del expediente si falla el downstream del subscriber. Persistir, auditar y permitir reintento.

### 4.4 Servicios y listeners subscriber

Refactorizar `SubscriberCreationService` para:

1. escuchar `ExpedienteReadyForInstallationEvent`;
2. crear subscriber `PROSPECT`;
3. verificar idempotencia por tenant + `expedienteId`;
4. registrar `convertedAt`;
5. emitir `SubscriberConvertedEvent`.

Crear:

- `SubscriberActivationListener`: `PROSPECT` → `ACTIVE`, asigna `activatedAt`, emite `SubscriberActivatedEvent`;
- `SubscriberCancellationListener`: al recibir descarte, si existe subscriber `PROSPECT` vinculado, cambiar a `CANCELLED` con motivo automático.

### 4.5 Override manual

El `POST /crm/subscribers` debe quedar restringido a `TENANT_ADMIN` o superior cuando se use como alta manual fuera del flujo normal.

Requisitos:

1. campo `manualOverrideReason` obligatorio, string mínimo 10 caracteres;
2. `expedienteId` opcional;
3. registro de auditoría diferenciado;
4. no abrir bypass silenciosos para otros roles.

### 4.6 Endpoint de sección y 360°

Implementar `PATCH /crm/subscribers/:id/section/:section` con:

1. validación Zod parcial por sección;
2. actualización acotada a campos permitidos por sección;
3. recálculo de IVA cuando cambien `personType` o `stratum`;
4. auditoría por sección.

Extender `GET /crm/subscribers/:id/360` para retornar como mínimo:

- `subscriber`;
- `contacts`;
- `contracts`;
- `quotes`;
- `habeasData`;
- `arcoRequests`;
- `expedienteSummary`;
- `timelineSeed` o estructura equivalente para seguimiento.

### 4.7 Filtro del pipeline

Modificar el listado de expedientes para excluir por defecto `CLIENTE_ACTIVO` y `DESCARTADO`.

Agregar parámetro explícito `includeCompleted=true` para habilitar la visualización cuando el usuario lo solicite.

---

## 5. Instrucciones de implementación portal

### 5.1 API client

Actualizar `apps/portal/src/lib/api-client.ts` para:

1. extender `SubscriberRecord` con `expedienteId`, `convertedAt`, `activatedAt` y `manualOverrideReason` si aplica al contrato;
2. agregar `updateSubscriberSection(id, section, payload)`;
3. ampliar `get360(id)` al contrato real devuelto por backend.

### 5.2 Estructura visual del 360°

La página `/dashboard/crm/subscribers/[id]` debe pasar a una composición con 6 tabs:

1. Vista general
2. Datos
3. Servicios
4. Financiero
5. Cumplimiento
6. Seguimiento

Cada tab debe respetar la identidad iWana y el patrón del expediente detail.

### 5.3 Contenido por tab

**Vista general**

- card de identidad;
- card de origen con expediente vinculado y fechas clave;
- card de servicio activo;
- placeholders explícitos para financiero, soporte y red.

**Datos**

- secciones: Identificación, Contacto, Contactos alternativos, Dirección, Segmento y Fiscal, Cobertura;
- guardado individual por sección;
- grid 2 columnas;
- porcentaje de completitud por sección.

**Servicios**

- contratos;
- cotizaciones;
- plan activo;
- placeholders de equipos y provisioning.

**Financiero**

- datos fiscales editables;
- placeholders de facturas, pagos y estado de cuenta.

**Cumplimiento**

- consentimientos;
- solicitudes ARCO;
- consentimientos heredados del expediente origen.

**Seguimiento**

- timeline de conversión, activación, cancelación, cambios de estado y eventos relevantes;
- filtros por tipo;
- paginación siguiendo el patrón del expediente.

### 5.4 Restricciones de UX

1. no recalcular IVA ni reglas tributarias en cliente;
2. no simular módulos futuros con datos falsos;
3. no romper el patrón visual existente del portal;
4. no introducir React Query, SWR ni cambios de arquitectura frontend.

---

## 6. Restricciones no negociables

1. No romper boundaries del modulith.
2. No acceder a tablas de otro módulo directamente.
3. No usar credenciales, secretos ni PII reales.
4. No omitir Zod en boundaries nuevos.
5. No cambiar el stack ni introducir infraestructura adicional.
6. No usar strings literales en `@Roles()`; usar `UserRole.*`.
7. No revertir automáticamente el estado del expediente si falla la creación o activación del subscriber.
8. No compartir componentes expediente/subscriber en esta fase.

---

## 7. Entregables técnicos obligatorios

| # | Entregable | Ruta |
| --- | --- | --- |
| 1 | ADR-027 | `docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md` |
| 2 | Migración de subscribers | `packages/database/src/migrations/tenant/` |
| 3 | Entity subscriber actualizada | `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts` |
| 4 | Eventos de pipeline y subscriber | `apps/api/src/modules/crm/**/events/` |
| 5 | Listeners de activación y cancelación | `apps/api/src/modules/crm/subscribers/listeners/` |
| 6 | Override manual y endpoint por sección | `apps/api/src/modules/crm/subscribers/` |
| 7 | Extensión de schemas shared | `packages/shared/src/schemas/subscriber.schema.ts` |
| 8 | Extensión del API client | `apps/portal/src/lib/api-client.ts` |
| 9 | Refactor del Subscriber 360° | `apps/portal/src/components/crm/subscribers/` |
| 10 | Ajuste del listado de expedientes | `apps/portal/src/components/crm/expedientes/` |
| 11 | Tests unitarios e integración | `apps/api/src/modules/crm/**` |

---

## 8. Entregables documentales obligatorios

| # | Entregable | Ruta |
| --- | --- | --- |
| 1 | ADR de decisión estructural | `docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md` |
| 2 | Actualización HLD CRM | `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md` |
| 3 | Informe de fase | `docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-03-v1.0.md` |

Si durante la ejecución aparece un conflicto de boundary, seguridad o stack, documentarlo y escalarlo de inmediato.

---

## 9. Criterios de aceptación

| # | Criterio | Verificación |
| --- | --- | --- |
| 1 | `pnpm --filter @iwana/api typecheck` pasa | CI local |
| 2 | `pnpm --filter @iwana/portal typecheck` pasa | CI local |
| 3 | La migración aplica y revierte sin error | DB |
| 4 | `LISTO_PARA_INSTALACION` crea subscriber `PROSPECT` sin duplicados | Test integración |
| 5 | `CLIENTE_ACTIVO` activa subscriber vinculado | Test integración |
| 6 | `DESCARTADO` cancela subscriber `PROSPECT` vinculado | Test integración |
| 7 | El pipeline abierto excluye completados por defecto y permite `includeCompleted=true` | Test funcional |
| 8 | `PATCH /crm/subscribers/:id/section/:section` valida, guarda y audita por sección | Test API |
| 9 | La vista Subscriber 360° muestra 6 tabs y patrón visual consistente con expediente | Verificación manual |
| 10 | Los placeholders de módulos futuros son explícitos y honestos | Revisión funcional |

---

## 10. Criterio de stop/go

Detenerse inmediatamente si ocurre alguna de estas situaciones:

1. se detecta necesidad de cambiar boundaries del CrmModule;
2. el diseño requiere integración real con Billing, Ticketing, Inventory o Provisioning no disponible en esta fase;
3. aparece contradicción documental entre HLD, PRD y ADRs sobre el punto de conversión o ciclo de vida;
4. la solución propuesta exige desactivar validaciones o controles de seguridad.

Documentar la causa, dejar evidencia en el informe de fase y escalar con recomendación concreta.

---

*Prompt aprobado para ejecución fullstack de la Fase 03 de Subscriber, centrada en conversión operativa y consolidación de la vista 360° del cliente.*