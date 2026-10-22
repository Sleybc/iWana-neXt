# PROMPT-MOD13 — Red y Aprovisionamiento · Fase 01 · Encargos por bloque

**Versión:** 1.1 · **Fecha:** 2026-10-22 · **Emisor:** AI-EM-ARCH
**Historial:** v1.1 apunta al HLD y al PRD v1.1, añade la Ola 1-bis (D1-bis, B1a-bis, P0-bis, S0-bis) y las reglas comunes 7 a 9. Los bloques ya cerrados en la Ola 1 no se re-despachan. v1.0 queda superado.
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) v1.2 (en revisión; la estructura por bloques sigue los prompts de MOD05 Fase 08)
**Plan:** [2026-10-22-mod13-aprovisionamiento.md](../plans/2026-10-22-mod13-aprovisionamiento.md) (orden, paralelo, gates y matriz de skills)
**Contrato congelado:** [HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md). Ningún bloque lo modifica. Si algo no cabe, emite `[BLOQUEO] <sección del HLD> — <motivo>` y para.
**Definición:** [PRD-MOD13](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md)

## Reglas comunes a todos los bloques

1. Lee `AGENTS.md`, el plan, el HLD y tu sección. Lee los `SKILL.md` que el plan §3 te asigna **antes** de escribir código.
2. Se trabaja en `main`. Hay rutas sin commitear ajenas a esta fase: no las toques ni las añadas a tus commits. Haz `git add` solo de tus rutas. **No hagas commit**: el cierre de cada ola lo commitea AI-EM-ARCH.
3. Solo `pnpm`. Tests sin caché de turbo y con conteo real de suites y tests (`iwana-test-evidence`). Un verde sin cifras no cuenta.
4. Multi-tenant: todo en `runInTenantSchema` / `TenantContext`, con `tenant_id` en cada consulta. Ningún log une IP con nombre, documento o teléfono (R14).
5. Comentarios de negocio en español. Sin `any`. DTOs validados.
6. Entrega: archivos con ruta, evidencia con comandos y conteos, y deuda nueva clasificada P0–P3.
7. **HLD v1.1 §6.8:** toda mutación se audita con `AuditService.logWithin` dentro de su transacción, con la lista cerrada de campos. Una mutación sin auditoría es defecto P1.
8. **HLD v1.1 §6.9:** límites por actor en los comandos, `limit` ≤ 100, `ParseUUIDPipe` y validación con `whitelist` + `forbidNonWhitelisted`.
9. **R6 ter:** sin `assignedTechnicianId` no hay `reserve`, `certify` ni `regularize` (`PROVISIONING_TECHNICIAN_REQUIRED`). Cada bloque que toque esos comandos lo cubre con test.

---

## Ola 1-bis · re-sync v1.1

La Ola 1 cerró S0 y D1 y dejó a P0 y B1a bloqueados por defectos del contrato v1.0. Ya están corregidos en v1.1 (HLD §12). Lo ya entregado se conserva y se ajusta; no se rehace.

### D1-bis · `data-eng` — Ajuste de 161 y 162

Aplica HLD v1.1 §12 «Impacto»:
- `161_network_provisioning` y la entidad `service-provisioning`: `execution_order_number varchar(40) NOT NULL`, `regularized_by`, `regularized_at`, `released_by`, y el `ck_sp_regularized` ampliado.
- `network_inbox_events.last_error` pasa a `last_error_code varchar(64)`, también en la entidad.
- `162_seed_network_permissions`: `network.provisioning.regularize` también para «Acceso estándar NOC» y «Acceso estándar Aprovisionamiento».

Vuelve a correr ida y vuelta de 160–162 sobre fixtures efímeros, con conteo real; ningún tenant `ACTIVE`. Borra `packages/database/.jest-cache-d1/` y `.jest-integration-cache-d1/`: son residuos de la Ola 1 y no se commitean.

### B1a-bis · `sr-backend` — DTO y cuerpos en shared

En `packages/shared/src/contracts/network/`, según HLD v1.1 §4.4:
- todas las interfaces de respuesta;
- los esquemas Zod de los cuerpos;
- `NETWORK_ERROR_CODES` y `NETWORK_INBOX_ERROR_CODES`.

Tests de los esquemas: límites de longitud, IPv4 inválida, métodos repetidos y `forbidNonWhitelisted` del lado Zod (`.strict()`). Borra `packages/shared/coverage-v4/` si lo generaste. Conteo real.

### P0-bis · `prod-ux` — Completar la spec UX

Retoma `docs/specs/2026-10-22-mod13-aprovisionamiento-ux.md` sobre HLD v1.1. Ahora el contrato da:
- `certifiedBy.name`, `regularizedBy.name` y `releasedBy.name`;
- la proyección `TechnicianProvisioningViewDto`, de cinco campos: el técnico ve solo eso;
- las tres colas de la bandeja con sus columnas (§4.4);
- los mensajes para cada código de `NETWORK_ERROR_CODES`, incluido `PROVISIONING_TECHNICIAN_REQUIRED`.

Retira la sección `[BLOQUEO]` y deja constancia de que v1.1 la resolvió.

### S0-bis · `sec-eng` — Verificar v1.1 (solo lectura)

Comprueba que HLD v1.1 cierra los cuatro P1 y los tres P2 de `INFORME-MOD13-REVISION-SEGURIDAD-DISENO-v1.0.md`. Añade al informe una sección «Verificación v1.1» con el estado de cada hallazgo: cerrado en diseño, o pendiente para la implementación (V2). Si alguno sigue abierto en diseño, `[BLOQUEO]`.

---

## P0 · `prod-ux` — Spec UX

**Entregable:** `docs/specs/2026-10-22-mod13-aprovisionamiento-ux.md`.

**Contenido de la spec:**
- Flujos y estados (vacío, cargando, error, sin permiso) de:
  - catálogo de routers;
  - catálogo de redes IPv4, con barra de ocupación;
  - bandeja de tres pestañas (HLD §9);
  - panel de aprovisionamiento en la OT, en las vistas del técnico y de NOC;
  - sección «Servicio técnico» de la ficha;
  - faltante «Aprovisionamiento certificado» en el cierre de la OT.
- Vocabulario del PRD §8, revisado con `system-vocabulary-review`.
- Mensajes de cada código de error del HLD §6.
- Criterios de aceptación de UX trazados a CA-NET-13 y 14.
- Breakpoints 375, 768 y 1280 px.

**No** inventes campos que no estén en el HLD. Si un flujo lo pide, `[BLOQUEO]`.

## S0 · `sec-eng` — Revisión de diseño (solo lectura)

**Entregable:** `docs/informes/INFORME-MOD13-REVISION-SEGURIDAD-DISENO-v1.0.md`.

**Qué revisar:**
- Maker-checker (R6).
- Verificación HMAC antes de validar el esquema (HLD §4.3).
- Regularización (R12).
- Matriz de permisos (§7).
- Exposición de datos del `ProvisioningOrderContextDto` (§6.5).
- Auditoría sin PII.
- STRIDE del flujo.

**Cierra HLD Q2:** decide si la sección de la ficha exige `network.provisioning.read` o le basta `crm.subscribers.read`, con su motivo. Hallazgos P0–P3 con sección del HLD. No escribe código.

## D1 · `data-eng` — Migraciones 160–162 y entidades

**Entregables:**
- `packages/database/src/migrations/tenant/160_network_catalog.ts`, `161_network_provisioning.ts` y `162_seed_network_permissions.ts`, exactamente según HLD §3.1 a 3.3. Reversibles, registradas en `runner.ts`, cada una con su `*.integration.spec.ts` de ida y vuelta.
- Entidades TypeORM en `packages/database/src/entities/`: `network-router`, `ipv4-network`, `network-plan-profile`, `network-setting`, `service-provisioning`, `ip-assignment` y `network-inbox-event`, exportadas desde `index.ts`.
- **HLD Q1:** comprobar si `btree_gist` está disponible en el Postgres local y en el que declara `docker-compose`. Si no lo está, aplicar el plan B del HLD y reportarlo.
- Para 162: los permisos se siembran con el patrón de `151_seed_blocked_data_permission.ts`. Usa las claves que B1a publica en `AccessPermissionKey` (S2). Si todavía no existen, deja 162 para el final del bloque; no las declares tú.

**Cierre:** las migraciones aplicadas y revertidas sobre un tenant local, con conteo real de las integraciones.

## B1a · `sr-backend` — Contratos compartidos

**Entregables:**
- `packages/shared/src/contracts/network/`, según HLD §4.1 a 4.3: enums, `ControlParamsSchema`, `NetworkExecutionEventSchema`, `SignedNetworkExecutionEventSchema`, `canonicalizeNetworkExecutionEvent` y DTO de respuesta (`RouterDto`, `Ipv4NetworkDto`, `PlanProfileDto`, `NetworkSettingsDto`, `ServiceProvisioningDto`, `ProvisioningOrderContextDto`, `ProvisioningInboxRowDto`).
- Las colas en `constants/queue-names.ts`.
- Las seis claves de HLD §7 en `packages/shared/src/enums/access-control/access-permission-key.enum.ts`, que D1 consume para la migración 162.
- Exportarlo todo desde el barrel.
- Tests unitarios de los esquemas, incluido que la canonicalización sea estable ante el orden de las claves.

## B1b · `sr-backend` — Catálogo, IPAM y permisos

**Depende de:** S1 y S2.

**Entregables:**
- `apps/api/src/modules/network/` con `network.module.ts` registrado en `app.module.ts`.
- `network-catalog.controller.ts` y `network-catalog.service.ts` (HLD §6.2, catálogo).
- `ipam.service.ts` (§6.1).
- Matriz y plantillas de `access-control.constants.ts` (§7), con las claves que publicó B1a.
- OpenAPI.

**Tests:**
- unitarios de validaciones y códigos de error;
- integración contra Postgres real: CA-NET-01, CA-NET-03 y **CA-NET-02 (20 reservas concurrentes, 0 duplicados)**;
- HTTP de permisos (CA-NET-12).

## B2 · `sr-backend` — Aprovisionamiento en la OT

**Depende de:** B1b y S4.

**Entregables:**
- MOD11 (HLD §5.1 a 5.3):
  - `getExecutionSnapshot`, `hasEvidence` y `listInstallationOrdersClosedExecutedWithout` en el puerto existente;
  - el nuevo `service-provisioning-read.port.ts`;
  - `kind: 'PROVISIONING'` en `TemplateRequirement` y en el evaluador;
  - la guarda en `close()`.
- Migración `163_publish_instalacion_estandar_v3.ts` (§3.4).
- MOD05 (§8): `subscriber-service-context-read.port.ts` con su adaptador.
- MOD12 (§8): `installed-equipment-read.port.ts` con su adaptador.
- MOD13:
  - `network-provisioning.controller.ts`: `context`, `reserve`, `certify`, `release`, `inbox`, `subscribers/:id`. `regularize` va en B3.
  - `service-provisioning.service.ts`
  - `router-provisioning.port.ts` y `manual-router-provisioning.adapter.ts` (§6.6)
  - `service-provisioning-read.adapter.ts`

**Restricción de frontera:** ningún módulo importa servicios ni entidades de otro; solo puertos (§8).

**Tests:** CA-NET-04, CA-NET-05 y CA-NET-06 (cerrar sin certificar → `CLOSURE_GATE_INCOMPLETE`, con el ajuste encendido y apagado), y que `NOT_EXECUTED` no consulta el puerto. La suite existente de `tasks` debe seguir en verde, con conteo.

## B3 · `sr-backend` — Eventos, activación y regularización

**Depende de:** B2.

**Entregables:**
- Worker (§5.4): `enqueueSignedNetworkEvent` en `execution-order-events.processor.ts`, solo para OT `INSTALLATION`.
- `network-execution-event.processor.ts`, con inbox y la tabla de efectos del §6.3.
- Evento `network.service-provisioning.activated` (§6.4).
- Listener CRM y `service-provisioning-commercial-status.port.ts`, definido en CRM e implementado en MOD13.
- Listener de inventario que fija `contract_ref_id`.
- Reconciliador (§6.7).
- `POST /network/provisioning/regularize`.

**Tests contra Postgres y Redis reales:**
- CA-NET-07, 08, 09 y 10;
- **un test que provoque el fallo del listener CRM dentro del `@OnEvent` real** y demuestre el reintento y el estado `PENDING`;
- CA-NET-11, con datos de fixture, no con los del caso de origen.

Comprobar con `iwana-queue-inspect` que `network-execution-events` queda drenada. La suite del worker debe seguir en verde, con conteo.

## F1 · `fe-platform` — Catálogo de red

**Depende de:** P0 y B1b.

**Entregables:**
- `apps/portal/src/app/dashboard/network/routers/` y `ipv4-networks/`, según la spec P0 y el HLD §9: tablas con paginación numerada (ADR-065), drawers de alta y edición, barra de ocupación y acciones condicionadas por permiso.
- Grupo «Red» en la navegación del portal.
- `docs/directorio-modulos.md` actualizado.

Usa los componentes de `@iwana/ui`; no crees primitivas nuevas sin `ds-owner`.

## F2 · `fe-platform` — Panel de la OT, bandeja y ficha

**Depende de:** P0 y B3.

**Entregables:**
- `components/operations/ExecutionOrderProvisioningPanel.tsx`, integrado en `ExecutionOrderMomentContainer` y `ExecutionOrderRequirementIndex`, con el faltante en `ExecutionOrderCloseSection`.
- `app/dashboard/network/provisioning/` con sus tres pestañas y la acción de regularizar.
- `components/crm/subscribers/SubscriberTechnicalServiceSection.tsx` en la pestaña «Servicios» de `SubscriberDetailClient.tsx`.
- La instrucción MikroTik con botón de copiar.
- `canCertify` controla el botón de certificar; el técnico nunca lo ve.

## V1 · `sr-qa` — Pruebas de punta a punta

**Escribes tests y fixtures; nunca código de producto.**

**Entregable:** E2E Playwright del portal contra el API real, con este recorrido:
1. crear un router y una red /24;
2. OT de instalación en `IN_PROGRESS` con el CPE registrado;
3. reservar como NOC y comprobar la IP sugerida;
4. adjuntar evidencia y certificar como NOC;
5. el técnico cierra;
6. comprobar en la ficha: servicio activo, suscriptor activo.

**Casos negativos:**
- el técnico no ve «Certificar»;
- cerrar sin certificar muestra el faltante;
- `NOT_EXECUTED` libera la IP.

**Precondiciones de dominio del fixture:**
- suscriptor con contacto real y datos fiscales completos;
- expediente en `LISTO_PARA_INSTALACION`;
- plantilla v3 publicada;
- `enforceProvisioningOnInstallClose = true` en el tenant de prueba;
- usuarios distintos para el técnico y para NOC.

Matriz CA-NET → test en el informe, con conteo real.

## V2 · `sec-eng` · V3 · `boundary-reviewer` + `contract-drift-reviewer` · V4 · `ds-owner` · V5 · `gate-verifier`

Revisiones de solo lectura sobre el diff de la fase, según el plan §4 (G5 y G6). Cada una entrega su informe en `docs/informes/` con hallazgos por severidad y archivo:línea.

## Lo que ningún bloque hace

- Conectarse a un router o guardar credenciales.
- Encender `enforceProvisioningOnInstallClose` en tenants reales.
- Regularizar el caso de origen (OT `OTE-20260828-001`).
- Commitear.

Esas acciones son de G7 (AI-EM-ARCH + CTO).
