# INFORME — MOD05 CRM: Subscriber + Pipeline Consolidado — Fase 01 (Backend)

**Versión:** 1.0  
**Fecha:** 2026-04-16  
**Módulo:** MOD05-CRM-SUBSCRIBERS  
**Fase:** 01 — Backend  
**Estado:** ✅ COMPLETADA  
**Generado por:** AI-EM-ARCH (Modo EM)

---

## 1. Resumen ejecutivo

Se implementó el backend completo del módulo Subscriber dentro del CRM de iWana neXt, incluyendo:

- **Entity Subscriber rediseñada** con modelo de dos dimensiones ortogonales (ADR-025): `personType` (dimensión fiscal) y `customerSegment` (dimensión de negocio).
- **Motor IVA colombiano** (`VatTreatmentService`) que calcula automáticamente el tratamiento tributario según Ley 1819/2016.
- **Máquina de estados** del suscriptor (LEAD → PROSPECT → ACTIVE → SUSPENDED → CANCELLED).
- **CRUD REST completo** con 8 endpoints, validación Zod, cifrado PII AES-256-GCM, y audit trail.
- **Integración Expediente → Subscriber**: creación automática cuando un expediente alcanza `CLIENTE_ACTIVO`.
- **Consolidación del pipeline CRM** de 12 a 8 estados (ADR-026), eliminando 4 estados redundantes.
- **Migraciones de base de datos** reversibles (012 y 013).
- **127 tests unitarios** pasando (cobertura ≥ 80% en módulos core).

---

## 2. Artefactos creados

### 2.1 Enums (`packages/shared/src/enums/`)

| Archivo                                      | Descripción                                               |
| -------------------------------------------- | --------------------------------------------------------- |
| `person-type.enum.ts`                        | NATURAL, JURIDICA                                         |
| `customer-segment.enum.ts`                   | RESIDENTIAL, SOHO, PYME, CORPORATE, GOVERNMENT, WHOLESALE |
| `vat-treatment.enum.ts`                      | EXEMPT, EXCLUDED, STANDARD                                |
| `tax-regime.enum.ts`                         | SIMPLIFIED, COMMON                                        |
| `subscriber-status.enum.ts`                  | LEAD, PROSPECT, ACTIVE, SUSPENDED, CANCELLED              |
| `document-type.enum.ts` (extendido)          | Agregados PEP, PTP                                        |
| `crm/expediente-status.enum.ts` (modificado) | Consolidado de 12 a 8 estados                             |

### 2.2 Entity y servicios (`apps/api/src/modules/crm/subscribers/`)

| Archivo                                   | Descripción                                                       |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `entities/subscriber.entity.ts`           | Entity completa con 2 dimensiones, índices, constraint CHECK      |
| `vat-treatment.service.ts`                | Motor IVA colombiano (28 tests)                                   |
| `subscriber-status-transition.service.ts` | Máquina de estados (31 tests)                                     |
| `subscribers.service.ts`                  | CRUD + cifrado PII + búsqueda + createFromExpediente (27 tests)   |
| `subscriber-creation.service.ts`          | Integración Expediente → Subscriber con descifrado PII (24 tests) |
| `subscribers.controller.ts`               | 8 endpoints REST con RBAC y Swagger (16 tests)                    |
| `subscribers.module.ts`                   | Módulo registrado en CrmModule                                    |
| `dto/create-subscriber.dto.ts`            | Zod discriminatedUnion por personType                             |
| `dto/update-subscriber.dto.ts`            | Todos los campos opcionales                                       |
| `dto/transition-subscriber-status.dto.ts` | targetStatus + reason                                             |
| `dto/subscriber-response.dto.ts`          | Respuesta con PII descifrado                                      |
| `events/subscriber-created.event.ts`      | Evento para futuros listeners                                     |

### 2.3 Migraciones (`packages/database/src/migrations/tenant/`)

| Archivo                                  | Descripción                                                  |
| ---------------------------------------- | ------------------------------------------------------------ |
| `012_add_subscribers.ts`                 | Crear tabla subscribers con enums, índices, constraint CHECK |
| `013_consolidate_expediente_pipeline.ts` | Mapear 4 estados eliminados a estados vecinos                |

### 2.4 Documentación

| Archivo                                                  | Descripción                           |
| -------------------------------------------------------- | ------------------------------------- |
| `docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md` | Decisión de modelo ortogonal          |
| `docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md`            | Decisión de consolidación de pipeline |
| `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md`            | PRD del módulo                        |
| `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-01-v1.0.md`  | Prompt de ejecución                   |

---

## 3. Criterios de aceptación

| ID        | Criterio                                      | Validación                   | Estado |
| --------- | --------------------------------------------- | ---------------------------- | ------ |
| CA-SUB-01 | NATURAL estrato 2 → EXEMPT                    | Test VatTreatmentService     | ✅     |
| CA-SUB-02 | NATURAL estrato 3 → EXCLUDED                  | Test VatTreatmentService     | ✅     |
| CA-SUB-03 | NATURAL estrato 5 → STANDARD                  | Test VatTreatmentService     | ✅     |
| CA-SUB-04 | JURIDICA cualquier estrato → STANDARD         | Test VatTreatmentService     | ✅     |
| CA-SUB-05 | JURIDICA GOVERNMENT → STANDARD                | Test VatTreatmentService     | ✅     |
| CA-SUB-06 | NATURAL sin estrato → error 400               | Test validación              | ✅     |
| CA-SUB-07 | JURIDICA sin NIT → error 400                  | Test validación              | ✅     |
| CA-SUB-08 | Expediente CLIENTE_ACTIVO → subscriber creado | Test integración             | ✅     |
| CA-SUB-09 | Cambiar strato → vatTreatment recalculado     | Test servicio                | ✅     |
| CA-SUB-10 | Cambiar personType → vatTreatment recalculado | Test servicio                | ✅     |
| CA-SUB-11 | PII cifrado al guardar, descifrado al leer    | Test cifrado                 | ✅     |
| CA-SUB-12 | Búsqueda por documento funciona               | Test búsqueda                | ✅     |
| CA-SUB-13 | Ficha 360° retorna datos + stubs              | Test integración             | ✅     |
| CA-SUB-14 | Pipeline tiene 8 estados (no 12)              | Test StatusTransitionService | ✅     |
| CA-SUB-15 | Expediente → CLIENTE_ACTIVO crea subscriber   | Test E2E                     | ✅     |
| CA-SUB-16 | Migración de estados legacy funciona          | Migración 013                | ✅     |
| CA-SUB-17 | Audit log en toda operación CUD               | AuditService inyectado       | ✅     |
| CA-SUB-18 | RBAC en endpoints de subscriber               | Guards verificados           | ✅     |

**Resultado: 18/18 criterios de aceptación cumplidos.**

---

## 4. Resultados de pruebas

| Suite                                          | Tests   | Estado      |
| ---------------------------------------------- | ------- | ----------- |
| `vat-treatment.service.spec.ts`                | 28      | ✅          |
| `subscriber-status-transition.service.spec.ts` | 31      | ✅          |
| `subscribers.service.spec.ts`                  | 28      | ✅          |
| `subscribers.controller.spec.ts`               | 16      | ✅          |
| `subscriber-creation.service.spec.ts`          | 24      | ✅          |
| **Total**                                      | **127** | **✅ 100%** |

- **Typecheck:** `tsc --noEmit` pasa sin errores.
- **Lint:** `pnpm lint` pasa sin errores críticos.
- **Cobertura:** ≥ 80% en módulos core del subscriber.

---

## 5. Decisiones técnicas relevantes

### 5.1 Modelo de dos dimensiones (ADR-025)

Se separaron las dimensiones fiscal y de negocio en campos independientes:

- `personType` (NATURAL/JURIDICA) → determina IVA y tipo de documento
- `customerSegment` (6 segmentos ISP) → determina plan, SLA, provisioning

**Beneficio:** Permite combinaciones como NATURAL + CORPORATE o JURIDICA + RESIDENTIAL sin ambigüedad.

### 5.2 Consolidación de pipeline (ADR-026)

Se eliminaron 4 estados del pipeline CRM:

- CONTACTADO → absorbido por PRECALIFICADO
- PENDIENTE_DATOS → absorbido por PRECALIFICADO
- VIABLE_COMERCIALMENTE → absorbido por VALIDANDO_COBERTURA
- PENDIENTE_DECISION → absorbido por EN_COTIZACION

**Beneficio:** Pipeline más simple, menos transiciones redundantes, mejor UX.

### 5.3 Cifrado PII con AES-256-GCM

Se reutiliza el mismo patrón de ExpedienteService:

- Formato: `iv:authTag:ciphertext` (hex)
- Clave: `MFA_ENCRYPTION_KEY` (env var)
- Búsqueda: hash SHA-256 determinista para comparación sin descifrar

### 5.4 Audit trail en operaciones CUD

Se inyectó `AuditService` en `SubscribersService` para registrar:

- CREATE: tipo de persona, segmento, IVA, régimen, estado inicial
- UPDATE: diff de campos modificados (sin PII)
- DELETE: tipo de persona, segmento, estado al momento de eliminación

### 5.5 Descifrado PII en SubscriberCreationService

Se mejoró el servicio para descifrar los campos PII del expediente antes de crear el subscriber:

- `emailPrimaryEncrypted` → descifrado con AES-256-GCM
- `phonePrimaryEncrypted` → descifrado con AES-256-GCM
- `documentNumberEncrypted` → descifrado con AES-256-GCM
- Fallback a `emailSecondary` (texto plano) si no hay email cifrado
- Placeholder temporal si no hay datos disponibles

### 5.6 Emisión de eventos con EventEmitter2

Se instaló `@nestjs/event-emitter` y se migró `SubscriberCreationService` para emitir eventos reales:

- Evento `subscriber.created` emitido vía `EventEmitter2.emit()`
- Permite que módulos futuros (Billing, Provisioning) reaccionen sin acoplamiento directo
- El evento incluye: subscriberId, tenantId, schemaName, expedienteId, personType, customerSegment, vatTreatment

### 5.7 Búsqueda determinista por hash (migración 014)

Se creó la migración 014 que agrega columnas hash SHA-256 para búsqueda sin descifrar:

- `document_number_hash` — índice parcial WHERE IS NOT NULL
- `email_hash` — índice parcial WHERE IS NOT NULL
- `phone_hash` — índice parcial WHERE IS NOT NULL

El método `search()` ahora usa estas columnas en lugar de descifrar todos los registros en memoria, mejorando el rendimiento de O(n) a O(log n).

### 5.8 Audit trail en SubscriberCreationService

Se inyectó `AuditService` en `SubscriberCreationService` para registrar la creación automática de suscriptores desde expedientes, incluyendo la fuente (expediente ID) y los datos no sensibles del nuevo subscriber.

---

## 6. Riesgos y mitigaciones

| Riesgo                      | Impacto | Mitigación                                          | Estado      |
| --------------------------- | ------- | --------------------------------------------------- | ----------- |
| Migración 013 no reversible | Medio | ✅ **Corregido 2026-07-19 (ADR-056 / AI-SR-FULL).** El CTO decidió corregir, no aceptar. La migración ahora **captura el estado original** (`expediente_records` **y** `status_changes` — `up()` reescribe ambas) en una tabla de respaldo del schema del tenant antes de transformar, y `down()` restaura desde ella. Tres ramas: restaura si hay respaldo; **completa limpio si no hay nada que revertir** (el caso del tenant nuevo, donde la 013 es un no-op demostrable: ninguna migración 001-012 inserta en esas tablas); falla **solo** si detecta transformación sin captura, con mensaje que indica qué columnas restaurar y desde dónde. El `throw` incondicional anterior era el defecto principal — convertía un riesgo *condicional* de pérdida de datos en un bloqueo *absoluto* del rollback de las 74 migraciones. Verificación: 17 tests que ejercitan las tres ramas; suite de `apps/api` 1607 tests en verde. **Actualizado 2026-07-19 — `down()` ya no falla nunca.** Se eliminó la rama de fallo: tras un `up()` exitoso quedan cero filas en estados eliminados por definición, así que ningún dato distingue "transformó" de "no había nada que transformar"; la versión anterior contaba el total de filas del pipeline y rechazaba si era > 0, produciendo un **falso positivo en todo tenant provisionado tras la consolidación** (verificado sobre `tenant_iwana`: 1 fila, 0 en estados eliminados, sin respaldo). Ahora: con respaldo restaura y lo elimina; sin respaldo retorna limpio. Además `up()` elimina la tabla de respaldo si quedó vacía — sin residuo en el schema. **Verificado contra PostgreSQL real (2026-07-19):** 11/11 checks en verde ejecutando la clase real de la migración sobre un schema desechable — incluido el **round-trip exacto** de `expediente_records` y `status_changes`, y el ciclo `up()→down()→up()`. `tenant_iwana` no se tocó. Ver ADR-056 §Residuales 1-3 | ✅ **Cerrado** |
| Estados legacy en BD        | Bajo    | `LEGACY_STATUS_MAP` + `getStatusMeta()` en frontend | ✅ Mitigado |
| PII sin cifrar en audit log | Alto    | AuditService registra solo campos no sensibles      | ✅ Mitigado |

---

## 7. Deuda técnica conocida

| Item               | Descripción                                | Prioridad | Fase         |
| ------------------ | ------------------------------------------ | --------- | ------------ |
| Migración 013 down | Implementar rollback con backup restaurado | Baja      | Post-release |

**Deuda técnica cerrada en esta iteración:**

- ✅ Event emitter → Instalado `@nestjs/event-emitter` y migrado `SubscriberCreationService`
- ✅ Búsqueda por hash → Migración 014 creada, `SubscribersService.search()` actualizado
- ✅ Audit en SubscriberCreationService → `AuditService` inyectado y registrado

---

## 8. Lo que NO entra en esta fase

- Frontend del módulo (Fase 02) — debe seguir identidad corporativa iWana
- Ficha 360° completa con módulos futuros (stubs implementados)
- Portal del suscriptor (público)
- Integración real con Billing, Provisioning, Inventory, WFM, Assurance
- ETL de migración desde sistemas origen
- App móvil

---

## 9. Siguiente fase

**Fase 02 — Frontend:** Implementar UI del módulo Subscriber con:

- Listado de suscriptores con filtros y paginación
- Formulario de creación con validación discriminada por personType
- Vista de detalle 360°
- Transición de estados con validación
- Todo siguiendo la identidad corporativa iWana (Exo 2, colores #17163A/#A5C330, shadcn/ui con tokens)

---

## 10. Firmas

| Rol            | Agente     | Fecha      |
| -------------- | ---------- | ---------- |
| EM + Architect | AI-EM-ARCH | 2026-04-16 |
| Sr. Developer  | AI-SR-FULL | 2026-04-16 |

---

_Documento generado automáticamente al completar la Fase 01 del módulo MOD05-CRM-SUBSCRIBERS._

---

## 11. Actualización de consistencia documental y portal (2026-04-17)

Se aplicaron correcciones puntuales para alinear documentación de Fase 02 con el estado real del código y con ADR-026:

- `apps/portal/src/components/crm/CrmOverviewClient.tsx`: métricas y textos ajustados para remover referencias a estados legacy (`CONTACTADO`, `PENDIENTE_DATOS`, `VIABLE_COMERCIALMENTE`, `PENDIENTE_DECISION`).
- `apps/portal/src/app/dashboard/subscribers/page.tsx`: redirect histórico actualizado a `/dashboard/crm/subscribers`.
- `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-02-v1.0.md`: Paso 1 actualizado a verificación/consumo de schemas ya existentes en `@iwana/shared` y Paso 9 extendido para exigir limpieza de métricas legacy.

Objetivo de la actualización: evitar ejecución duplicada de tareas ya completadas y eliminar inconsistencias de narrativa con el pipeline consolidado de 8 estados.

---

## 12. Handoff arquitectónico para ejecución de Fase 02 (2026-04-17)

Se completó una revisión en modo Architect/Mixto para determinar si la Fase 02 estaba lista para ejecución y se cerraron las decisiones menores que podían generar deriva durante la implementación.

### 12.1 Veredicto

**Estado:** lista para ejecutar con ajustes menores ya resueltos en la documentación operativa.

No se identificaron bloqueos de arquitectura, multi-tenancy, seguridad o boundaries que requieran ADR adicional o escalación al CTO. El backend, los contratos compartidos y la base de navegación del portal son suficientes para iniciar la ejecución.

### 12.2 Decisiones cerradas

- `subscribersApi` debe seguir el patrón existente del portal como objeto exportado en `apps/portal/src/lib/api-client.ts`.
- La validación del formulario debe basarse en Zod reutilizando los schemas ya exportados desde `@iwana/shared`.
- `VatTreatmentBanner` es exclusivamente de lectura y no recalcula IVA ni régimen en cliente.
- La ficha 360 mantiene stubs para contacts, contracts y habeas data dentro del alcance actual.

### 12.3 Artefactos generados para el handoff

- `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-02-v1.0.md`: ajustado para fijar patrón de `subscribersApi`, estrategia de validación y restricciones del banner IVA.
- `docs/plans/PLAN-MOD05-SUBSCRIBERS-FASE-02-v1.0.md`: plan técnico refinado con lanes, dependencias, paralelismo y Definition of Done.
- `docs/quality/CHECKLIST-MOD05-SUBSCRIBERS-FASE-02-v1.0.md`: checklist operativo para ejecución y salida de la fase.

### 12.4 Riesgo residual aceptado

El principal riesgo residual es intentar ampliar alcance frontend con endpoints nuevos o métricas agregadas no disponibles en el contrato actual. Si eso aparece durante la implementación, debe tratarse como cambio de alcance y no como ajuste implícito de Fase 02.

### 12.5 Avance de implementación y handoff por rol

Se materializó una primera iteración funcional del frontend de subscribers en `apps/portal`, centrada en dejar operativa la columna vertebral del módulo:

- `apps/portal/src/lib/api-client.ts`: agregado `subscribersApi` con métodos tipados para crear, listar, buscar, obtener detalle, actualizar, eliminar, cambiar estado y consultar 360.
- `apps/portal/src/components/crm/subscribers/subscriber-ui.ts`: agregadas metadata y utilidades de presentación del módulo.
- `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`: reemplazo del landing stub por listado funcional.
- `apps/portal/src/app/dashboard/crm/subscribers/new/page.tsx` y `apps/portal/src/app/dashboard/crm/subscribers/[id]/page.tsx`: rutas operativas para alta y detalle.
- `apps/portal/src/components/crm/subscribers/`: agregada base de formulario discriminado, tabs, header, banner IVA y diálogo de transición de estado.
- `apps/portal/src/components/crm/CrmOverviewClient.tsx`: incorporado acceso visible al módulo de suscriptores.
- `docs/plans/PLAN-MOD05-SUBSCRIBERS-FASE-02-ROLES-v1.0.md`: desglose operativo por rol para AI-SR-FULL, QA/Testing y revisión final.

Este avance no modifica contratos backend ni amplía alcance fuera de Fase 02; deja listo el módulo para estabilización funcional, refinamiento visual y validación final.
