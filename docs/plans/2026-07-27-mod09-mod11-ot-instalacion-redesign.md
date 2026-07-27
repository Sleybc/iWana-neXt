# OT de instalacion MOD09–MOD11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar una OT de instalacion segura, inmutable y trazable, con Agenda enfocada en coordinacion y MOD11 como unica verdad de ejecucion.

**Architecture:** MOD09 conserva solicitud, agenda y supervision; MOD11 conserva OT, plantilla aplicada, actividades, evidencia y cierre; MOD12 conserva custodia y movimientos. La sincronizacion entre owners usa outbox tenant-aware, consumidores idempotentes y reconciliacion según ADR-068 (Aprobado).

**Tech Stack:** NestJS, Next.js App Router, TypeScript estricto, TypeORM, PostgreSQL multi-tenant por schema, Redis/BullMQ, OpenAPI, Jest/Supertest y Playwright.

---

**Version:** 1.0  
**Estado:** Ejecución autorizada — G1 aprobado; G3 materializado parcialmente y G4 en curso  
**Fecha:** 2026-07-27  
**Autor:** AI-EM-ARCH  
**Protocolo:** `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`

## 1. Reglas de orquestacion

- AI-EM-ARCH no escribe codigo: mantiene decisiones, prioridades, contratos, gates y stop/go.
- Fases 01–03 quedan autorizadas tras la aprobación CTO de ADR-068; cada carril conserva sus gates técnicos y revisión.
- Fase 00 puede emitirse separadamente en G4 bajo ADR-046/ADR-047 para contener BOLA, terminalidad y replay; no puede introducir outbox, saga ni cambio de boundary.
- Ningun agente edita archivos fuera de su ownership sin handoff explícito.
- Todo cambio parte de prueba fallida, implementacion minima y verificacion focalizada.
- Cada tarea produce un commit revisable; no mezclar fases ni refactors adyacentes.
- Toda desviacion de boundary, seguridad o contrato detiene la tarea y escala.

## 2. Mapa de ownership

| Carril | Owner | Archivos/responsabilidad |
| --- | --- | --- |
| Arquitectura y gates | AI-EM-ARCH | ADR, PRD/HLD, plan, prompts, informe y stop/go |
| Experiencia | AI-PROD-UX | journey, estados, copy y aceptación UX; no codigo |
| Contrato DS | AI-DS-OWNER | tokens, API de composiciones, estados; no codigo |
| Backend | AI-SR-FULL | MOD11, contratos compartidos, OpenAPI, integración por eventos |
| Frontend | AI-FE-PLATFORM | `apps/portal`, `@iwana/ui`, RSC/client split y accesibilidad |
| Datos | AI-DATA-ENG, on-demand | consulta de modelo e integración de datos; AI-SR-FULL conserva ownership de entidades, migraciones, outbox, índices y reconciliacion |
| Seguridad | AI-SEC-ENG | factibilidad AppSec en G3 y auditoria de implementación en G6 |
| Calidad | AI-SR-QA | estrategia, unit/integration/E2E, a11y y evidencia G6 |

## 3. Orden de ejecucion

```mermaid
flowchart LR
  T0[G1 Aprobacion ADR] --> T1[G2 Alcance UX y DS]
  T1 --> T1B[G3 Factibilidad y contratos tipados]
  T1B --> T1C[G4 Prompts y contratos congelados]
  T1C --> T2[Contencion P0]
  T2 --> T3[Permisos y contrato API]
  T3 --> T4[Outbox y estados]
  T3 --> T5[Plantillas y gate]
  T1 --> T6[Agenda coordinador]
  T5 --> T7[OT de ejecucion]
  T3 --> T7A[Lifecycle Media y evidencia]
  T4 --> T8[Inventario y reconciliacion]
  T6 --> T9[E2E y seguridad]
  T7 --> T9
  T7A --> T9
  T8 --> T9
  T9 --> T10[G5 implementacion / G6 review / G7 produccion]
```

### Task 0: Cerrar G1–G4 y congelar contratos

**Owner:** AI-EM-ARCH; reviews cruzados AI-PROD-UX, AI-DS-OWNER, AI-SR-FULL, AI-SEC-ENG, AI-SR-QA  
**Files:**

- Modify: `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` (Aprobado)
- Modify: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-coordinador-design.md`
- Modify: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md`
- Modify: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md`
- Create: `packages/shared/src/contracts/operations/execution-orders.ts` — AI-SR-FULL, contrato tipado
- Modify: `packages/shared/src/index.ts` — export del contrato
- Create: `apps/api/openapi/tasks-execution-orders.v1.json` — OpenAPI máquina-legible
- Modify: `apps/api/src/modules/tasks/tasks.swagger.spec.ts` — AI-SR-FULL, OpenAPI ejecutable
- Modify: prompts Fase 00–04 — AI-EM-ARCH, declaración de congelación

- [x] Registrar aprobación CTO de ADR-068 y reconciliar ADR-034/035.
- [x] Resolver por escrito cada objecion de UX, DS, backend, seguridad y QA documental.
- [x] G2: AI-EM-ARCH aprueba alcance de UX/DS, sin declarar congelación prematura.
- [x] G3: AI-SR-FULL materializa contrato y emite factibilidad; AI-SEC-ENG/AI-DATA-ENG/AI-PLAT-OPS revisan su dominio.
- [x] AI-SR-FULL publica tipos request/response/error en `@iwana/shared` y OpenAPI verificable antes de que frontend derive mocks.
- [x] G4: AI-EM-ARCH promueve los prompts y declara literalmente "contrato de componente congelado" y "contrato de API congelado", citando ruta, version, tipos y OpenAPI.
- [x] Congelar nombres de permisos, comandos, estados, eventos y componentes.
- [x] Registrar en el informe vivo la fecha y hash documental de congelacion.
- [x] Ejecutar `pnpm audit:adr-citations` y obtener 0 bloqueantes.
- [x] Ejecutar `pnpm audit:doc-locations` y obtener 0 hallazgos.
- [x] Commit documental: `docs(operations): freeze installation work order contracts`.

**Corte de revisión 2026-07-27:** G3 no se declara completo mientras falten proyecciones efectivas, receipt/saga de inventario, plantilla/acciones, OpenAPI completo y límites `429`. Media, cuadrillas, follow-up y redrive permanecen fail-closed hasta disponer de sus boundaries.

### Task 1: Contener mutaciones inseguras y estados terminales

**Owner:** AI-SR-FULL; review AI-SEC-ENG y AI-SR-QA  
**Files a localizar/confirmar antes de editar:**

- Modify: `apps/api/src/modules/tasks/execution-orders.controller.ts`
- Modify: `apps/api/src/modules/tasks/services/execution-orders.service.ts`
- Test: `apps/api/src/modules/tasks/tests/execution-orders.controller.http.spec.ts`
- Test: `apps/api/src/modules/tasks/tests/execution-orders.service.spec.ts`

- [ ] Escribir pruebas que nieguen lectura/escritura por UUID sin alcance o asignacion.
- [ ] Escribir pruebas de mass assignment para tenant, actor, estado, asignación, version, metadata y campos desconocidos.
- [ ] Escribir pruebas de DTO minimizado y redacción de PII/textos libres en respuesta, logs y auditoria.
- [ ] Ejecutar pruebas focalizadas y confirmar que fallan por ausencia del control.
- [ ] Escribir pruebas que rechacen actividad, consumo, evidencia, reasignacion o segundo cierre sobre estados terminales.
- [ ] Implementar guards/politicas y precondiciones sin depender de controles frontend.
- [ ] Ejecutar las pruebas focalizadas y confirmar éxito.
- [ ] Solicitar review de AI-SEC-ENG antes del commit.
- [ ] Verificar `429` por actor/tenant; AI-PLAT-OPS aporta evidencia de TLS/terminación en G5.
- [ ] Commit: `fix(operations): enforce execution order ownership and immutability`.

### Task 2: Introducir permisos por capacidad

**Owner:** AI-SR-FULL; consulta AI-DATA-ENG si hay seeds/migracion; review AI-SEC-ENG  
**Files esperados:**

- Modify: contratos de permisos en `packages/shared/`
- Modify: seeds/migraciones de acceso en `packages/database/`
- Modify: politica/controladores en `apps/api/src/modules/tasks/`
- Test: specs de access-control y execution-orders

- [ ] Crear pruebas para `execute`, `supervise` y `templates.manage`, incluyendo contratista asignado.
- [ ] Crear pruebas negativas para coordinador sin permiso de ejecución y ejecutor no asignado.
- [ ] Implementar permisos canónicos `read`, `execute`, `supervise`, `templates.read`, `templates.manage`, `execution_events.redrive` y alias temporal medible de `wfm.work_orders.execute`.
- [ ] Migrar catálogo/perfiles `MOD00_ACCESS_V1` sin otorgar privilegios implícitos y probar compatibilidad.
- [ ] Documentar el alias como deprecado y su condición de retiro.
- [ ] Ejecutar migraciones en schema de prueba y revertirlas.
- [ ] Ejecutar test de aislamiento entre dos tenants.
- [ ] Commit: `feat(access): add execution order capability permissions`.

### Task 3: Publicar contrato OpenAPI y control de concurrencia

**Owner:** AI-SR-FULL; review AI-SR-QA y AI-SEC-ENG  
**Files esperados:**

- Modify: `apps/api/src/modules/tasks/dto/execution-orders.dto.ts`
- Modify: `apps/api/src/modules/tasks/execution-orders.controller.ts`
- Modify: OpenAPI generado/validado según baseline del repo
- Test: `apps/api/src/modules/tasks/tests/execution-orders.controller.http.spec.ts`

- [ ] Escribir contratos HTTP para idempotency key, version esperada, errores 403/404/409/422 y `allowedActions`.
- [ ] Probar reintento de iniciar, registrar y cerrar con misma clave.
- [ ] Probar misma clave+mismo payload como replay y misma clave+payload distinto como `409`.
- [ ] Probar atomicidad única de registro idempotente, mutación, outbox y audit-intent, propagando `intentId` estable; probar expiración y replay tras el horizonte definido.
- [ ] Inyectar fallo al persistir audit-intent y comprobar rollback completo; inyectar fallo de entrega y comprobar retry/DLQ sin pérdida.
- [ ] Probar bodies tipados 403/404/409/422 y ausencia de enumeración.
- [ ] Probar conflicto de version y dos cierres concurrentes.
- [ ] Implementar respuestas estables sin exponer existencia fuera de alcance.
- [ ] Validar OpenAPI y TypeScript estricto.
- [ ] Commit: `feat(operations): version execution order commands`.

### Task 4: Implementar outbox tenant-aware y convergencia

**Owner:** AI-SR-FULL; consulta AI-DATA-ENG para modelo/relay tenant; review AI-EM-ARCH de boundary y AI-SR-QA  
**Files esperados:**

- Create/Modify: entidad y migracion tenant de outbox en `packages/database/`
- Create: publicador/consumidores dentro de los modulos owners
- Modify: `apps/worker/` para jobs tenant-aware
- Test: integración de commit+outbox, duplicados, orden y reconciliacion

- [ ] Escribir prueba de atomicidad entre cambio de OT y registro outbox.
- [ ] Escribir prueba que un evento duplicado no repite efecto.
- [ ] Escribir prueba que una version antigua no revierte una proyeccion nueva.
- [ ] Implementar envelope y resolución explícita de tenant en worker.
- [ ] Implementar relay con lease, scanner de tenants confiable, inbox, retry, DLQ y re-drive auditado.
- [ ] Probar crash-window commit→enqueue y enqueue→mark sin pérdida ni efecto duplicado.
- [ ] Implementar matriz de convergencia aprobada.
- [ ] Implementar reconciliador y métricas de lag/discrepancia.
- [ ] Ejecutar migracion tenant y rollback en dos schemas de prueba.
- [ ] Probar constraint único `(tenant_id, schedule_event_id)`, carrera del consecutivo y control optimista `version`.
- [ ] Commit: `feat(operations): synchronize execution projections through outbox`.

### Task 5: Implementar plantillas versionadas y gate de cierre

**Owner:** AI-SR-FULL; consulta AI-DATA-ENG para persistencia; review AI-PROD-UX, AI-SEC-ENG, AI-SR-QA  
**Files esperados:**

- Create/Modify: entidades y migracion tenant de plantillas/snapshot
- Create/Modify: servicios/controladores MOD11 de administración y evaluación
- Test: versionado, publicación, retiro, snapshot e incompletitud 422

- [ ] Escribir prueba que una version publicada es inmutable.
- [ ] Escribir prueba que una OT conserva su plantilla aunque se publique una version nueva.
- [ ] Escribir tabla de casos de cierre por ejecutada, observada, no ejecutada y seguimiento.
- [ ] Implementar evaluador determinista que devuelve faltantes localizables.
- [ ] Auditar schemas configurables para evitar expresiones o componentes arbitrarios.
- [ ] Ejecutar tests y migracion reversible.
- [ ] Commit: `feat(operations): add versioned work order close templates`.

### Task 6: Simplificar Agenda al rol de coordinador

**Owner:** AI-FE-PLATFORM; contrato AI-DS-OWNER; aceptación AI-PROD-UX; QA AI-SR-QA  
**Files a confirmar con búsqueda antes de editar:**

- Modify: `apps/portal/src/components/scheduling/ScheduleEventDrawer.tsx`
- Modify/Create: composiciones reutilizables en `packages/ui`
- Test: unit/component tests de estados y permisos
- Test: Playwright de Agenda

- [ ] Escribir pruebas de `OperationalSidePeek` para ready, stale, conflict, forbidden, offline y terminal.
- [ ] Extender `ProgressMeter` mediante pruebas para recibir `label` y `ariaLabel`; eliminar el texto accesible fijo antes de usarlo en requisitos de instalación.
- [ ] Verificar que Agenda no renderiza formularios de ejecución ni selectores genéricos.
- [ ] Implementar resumen, alerta, siguiente acción y enlace a OT.
- [ ] Externalizar labels; no renderizar enums crudos ni UUID prominentes.
- [ ] Validar foco, Escape, retorno de foco, teclado y responsive.
- [ ] Ejecutar auditoria WCAG y captura visual desktop/movil.
- [ ] Commit: `refactor(scheduling): focus event detail on coordination`.

### Task 7: Construir la experiencia de ejecución de OT

**Owner:** AI-FE-PLATFORM; contrato AI-DS-OWNER; aceptación AI-PROD-UX  
**Files esperados:**

- Modify: `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx`
- Create/Modify: `OperationalSidePeek` en `packages/ui` y `ExecutionOrderSummary` en el dominio Operaciones de `apps/portal`
- Test: component tests y Playwright del flujo de ejecución

- [ ] Escribir pruebas para cada estado OT y todos los estados asincronos.
- [ ] Escribir prueba que OT terminal no presenta controles editables.
- [ ] Implementar bloques de compromiso, checklist, trabajo, materiales, evidencia, conformidad y cierre.
- [ ] Implementar offline informativo/read-only sin borradores locales; comprobar que evidencia, firma, dirección, instrucciones y textos libres no se persisten en el dispositivo.
- [ ] Renderizar recibo/estados de evidencia del contrato congelado sin acceder directamente a storage ni inventar persistencia local.
- [ ] Implementar listado accionable de requisitos faltantes del gate.
- [ ] Validar desktop/movil, teclado, foco y mensajes.
- [ ] Commit: `feat(operations): deliver installation execution workspace`.

### Task 7A: Integrar lifecycle seguro de evidencia con Media/Assets

**Owner:** AI-SR-FULL; consulta AI-DATA-ENG; review AI-SEC-ENG, AI-PLAT-OPS y AI-SR-QA  
**Files esperados:**

- Modify: contrato tipado de `MediaService` en `apps/api/src/modules/media/`
- Modify: metadata/migración pública Media para estado de análisis, claim opaco y reconciliación
- Create/Modify: upload-intent y vínculo OT–media en entidades/migraciones tenant MOD11
- Modify: jobs de análisis, compensación y limpieza huérfana en `apps/worker/`
- Test: integración API/Media/MinIO/PostgreSQL, fault injection, multi-tenant y rollback

- [ ] Escribir pruebas de `PENDING_ANALYSIS`, `AVAILABLE`, `REJECTED` y `EXPIRED`, incluido polling del recibo `202`.
- [ ] Probar MIME real, allowlist/tamaño, checksum/timestamps de servidor, asset cross-tenant/cross-OT y claim duplicado.
- [ ] Implementar object key determinista e idempotencia por `intentId` sin PII en key/metadata.
- [ ] Inyectar fallo en ventanas objeto→metadata, metadata→vínculo y claim→evidencia; recuperar por compensación/reconciliador.
- [ ] Implementar detección de huérfanos, TTL aprobado, soft delete auditado y borrado físico posterior.
- [ ] Mantener Media como owner de binario/análisis y MOD11 como owner de la relación probatoria, sin FK/import de repositorio cruzado.
- [ ] Verificar URL firmada corta, reautorización por descarga y ausencia de `objectKey`/bucket/secreto en DTO/log/audit.
- [ ] Commit: `feat(media): secure execution order evidence lifecycle`.

### Task 8: Integrar inventario sin romper boundary

**Owner:** AI-SR-FULL; consulta AI-DATA-ENG para conciliacion; review AI-SEC-ENG y AI-SR-QA  
**Files esperados:**

- Modify: adaptador/comandos MOD12 bajo `apps/api/src/modules/inventory/`
- Modify: integración de referencia MOD11 sin acceso a repositorios MOD12
- Test: integración de custodia, serial, cantidades, duplicados y rechazo

- [ ] Escribir pruebas que rechacen custodio arbitrario y serial fuera de custodia.
- [ ] Probar tipo de ubicación, `responsibleRefId`, membresia vigente de cuadrilla y revocación entre lectura y comando.
- [ ] Escribir prueba de consumo concurrente y reintento idempotente.
- [ ] Inyectar fallo después de confirmación MOD12 y antes de persistir uso MOD11; verificar reconciliación y cero duplicados.
- [ ] Eliminar el fallback que fabrique `stockMovementId` sin movimiento real.
- [ ] Implementar confirmación/rechazo por evento y referencia de movimiento.
- [ ] Implementar estado de conciliacion visible y alerta operativa.
- [ ] Verificar ausencia de imports de repositorios/tablas cruzadas.
- [ ] Commit: `feat(inventory): reconcile installation work order consumption`.

### Task 9: Ejecutar gate integral de calidad y seguridad

**Owner:** AI-SR-QA; auditor AI-SEC-ENG; aprobación stop/go AI-EM-ARCH  
**Files:**

- Modify: `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md`
- Modify: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md`
- Test: `e2e/tests/` según mapa final de QA

- [ ] Ejecutar unit/integration/API/E2E del flujo feliz y todas las negativas P0/P1.
- [ ] Ejecutar aislamiento multi-tenant, BOLA, permisos, idempotencia y concurrencia.
- [ ] Ejecutar matriz exhaustiva endpoint×permiso×ABAC, acceso directo a media y re-drive; verificar política uniforme 401/403/404.
- [ ] Ejecutar fault injection de audit-intent/idempotencia y pruebas de evidencia ajena, reutilizada, en cuarentena o con MIME falso.
- [ ] Ejecutar dos confirmaciones concurrentes de agenda y comprobar una única OT.
- [ ] Ejecutar las seis filas de convergencia: en ejecución; bloqueada; ejecutada/con observaciones; requiere seguimiento; no ejecutada; cancelada.
- [ ] Ejecutar al menos un E2E vertical con API y PostgreSQL reales; mocks solo para dependencias externas inevitables.
- [ ] Registrar que el umbral de lag queda “sin umbral aprobado” hasta decisión operativa; no inventarlo desde QA.
- [ ] Ejecutar WCAG, responsive y regresion visual.
- [ ] Ejecutar migración/rollback y reconciliación.
- [ ] Ejecutar `pnpm lint`, `pnpm typecheck`, pruebas focalizadas y build afectado.
- [ ] Registrar comandos, resultados, fecha y responsable; no declarar éxito sin evidencia.
- [ ] G6: AI-SEC-ENG y AI-SR-QA emiten hallazgos/evidencia; PROD-UX y DS-OWNER revisan flujo/contrato.
- [ ] G7: AI-EM-ARCH recomienda GO/NO-GO sin escribir codigo; CTO aprueba producción.
- [ ] Commit: `docs(operations): record installation work order release gate`.

### Task 10: Retirar compatibilidad ligera

**Owner:** AI-EM-ARCH decide; implementación AI-SR-FULL/AI-FE-PLATFORM; QA verifica  
**Precondicion:** al menos un ciclo de release con telemetria verde, cero consumidores conocidos y rollback ensayado.

- [ ] Inventariar lecturas/escrituras restantes de `WorkOrder` ligera y permiso alias.
- [ ] Confirmar reconciliación sin discrepancias por periodo acordado.
- [ ] Aprobar plan de deprecacion y migracion.
- [ ] Retirar UI y mutaciones primero; persistencia solo en fase posterior.
- [ ] Actualizar ADR/PRD/HLD/OpenAPI/informe.
- [ ] Commit: `refactor(wfm): retire legacy work order compatibility`.

## 4. Matriz de trazabilidad minima

| Requisito | Tareas | Gate |
| --- | --- | --- |
| Una verdad de ejecución | 1, 3, 4 | G1/G3/G6 |
| Coordinador no ejecuta | 2, 6 | G2/G3/G6 |
| Contratista/cuadrilla habilitable | 2, 8, 9 | G3/G6 |
| Plantilla versionada | 5, 7 | G2/G3/G6 |
| Terminal inmutable | 1, 3, 7 | G3/G6 |
| Inventario idempotente | 3, 8 | G3/G5/G6 |
| Evidencia segura y recuperable | 7A, 9 | G1/G3/G5/G6 |
| Proyecciones convergentes | 4, 9 | G1/G5/G6 |
| Accesibilidad y responsive | 6, 7, 9 | G2/G6 |
| Compatibilidad gradual | 2, 10 | G5/G7 |

## 5. Stop inmediato

Detener y escalar si:

- ADR-068 ya está aprobado por el CTO; permanecen pendientes G3/G4 como gates de materialización y congelación verificable.
- un agente necesita leer/escribir tablas de otro modulo;
- el tenant depende de header/UUID no confiable o no viaja en jobs;
- una OT terminal puede mutarse;
- un reintento puede duplicar inventario o evidencia;
- el contrato de firma pretende suficiencia legal no validada;
- las migraciones no son reversibles;
- un gate carece de evidencia reproducible.

## 6. Criterio de salida

El plan termina solo cuando el informe vivo registra GO, todos los P0/P1 están cerrados, G1–G7 tienen owner y evidencia, y la OT ligera queda como compatibilidad oculta o retirada bajo Task 10.
