# PROMPT-MOD13 — Red y Aprovisionamiento · Fase 01 · Encargos por bloque

**Versión:** 1.1 · **Fecha:** 2026-10-22 · **Emisor:** AI-EM-ARCH
**Historial:** el 2026-10-23 se añadió §Ola 17 (E2E-CI). El mismo día se añadió §Ola 16 (B-cov, V1-ci2). El mismo día se añadió §Ola 15 (V1-ci, V5, V4-plan). El mismo día se añadió §Ola 14 (B-wire). El mismo día se añadió §Ola 13 (B-fix3). El mismo día se corrigió §V1-r: la MAC del CPE es opcional (exigirla era un error del emisor, porque el contrato la admite nula) y V4-bis-r va después de V1-r. Antes, ese mismo día, §V1-r ya pedía el worker en marcha y el CPE registrado en el flujo. El mismo día se añadió §Ola 12 (B-fix2). El mismo día se añadió §Ola 11 (F1-v2, V1-r, V4-bis-r). El mismo día se añadió §Ola 10 (T-login, FX-v1, FX-nav). El mismo día se añadió §B-mig, tras el fallo de la 163 en `db:migrate:all`. El mismo día, tras el primer intento de la Ola 9, se corrigieron las precondiciones 1, 3 y 5 (puerto de Redis, tenant de pruebas `ACTIVE` y migraciones de MOD13). Al preparar la Ola 9 (2026-10-23) se añadió la precondición 5 (tenant de pruebas migrado) y §V4-bis. Al lanzar la Ola 8 (2026-10-23) se añadieron §V2-c y §V4-c, y las precondiciones y §R-pg de la Ola 9. Al lanzar la Ola 7 (2026-10-22) se añadieron §B-fix y §F-fix. Al lanzar la Ola 6 (2026-10-22) se detallaron §V2, §V3 y §V4 y se fijaron las precondiciones de V1 y V5. Al lanzar la Ola 5 (2026-10-22) se completó §F2 con lo que fija HLD v1.1. Al lanzar la Ola 4 (2026-10-22) se añadieron §B3.0 (frontera) y §F1-v. Al lanzar la Ola 3 (2026-10-22), §B2 se alineó con los nombres de HLD v1.1 y se añadieron §P0-ter y la pantalla de ajustes en §F2. Antes: v1.1 apunta al HLD y al PRD v1.1, añade la Ola 1-bis (D1-bis, B1a-bis, P0-bis, S0-bis) y las reglas comunes 7 a 9. Aclaración del 2026-10-22, al lanzar la Ola 2: §B1b explicita lo que HLD v1.1 ya le asignaba (puerto de actores, auditoría, pipeline, formas §4.4). Los bloques ya cerrados en la Ola 1 no se re-despachan. v1.0 queda superado.
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) v1.2 (en revisión; la estructura por bloques sigue los prompts de MOD05 Fase 08)
**Plan:** [2026-10-22-mod13-aprovisionamiento.md](../plans/2026-10-22-mod13-aprovisionamiento.md) (orden, paralelo, gates y matriz de skills)
**Contrato congelado:** [HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md). Ningún bloque lo modifica. Si algo no cabe, emite `[BLOQUEO] <sección del HLD> — <motivo>` y para.
**Definición:** [PRD-MOD13](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md)

## Reglas comunes a todos los bloques

1. Lee `AGENTS.md`, el plan, el HLD y tu sección. Lee los `SKILL.md` que el plan §3 te asigna **antes** de escribir código.
2. Se trabaja en `main`. Hay rutas sin commitear ajenas a esta fase: no las toques ni las añadas a tus commits. Haz `git add` solo de tus rutas. **No hagas commit**: el cierre de cada ola lo commitea AI-EM-ARCH.
3. Solo `pnpm`. Tests sin caché de turbo y con conteo real de suites y tests (`iwana-test-evidence`). Un verde sin cifras no cuenta. No crees carpetas de caché de jest dentro del repo: usa el `cacheDirectory` por defecto.
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
- Matriz y plantillas de `access-control.constants.ts` (§7), con las claves que publicó B1a. `network.provisioning.regularize` también va a «Acceso estándar NOC» y «Acceso estándar Aprovisionamiento»; debe coincidir con lo que siembra la migración 162.
- `network/ports/network-actor-read.port.ts` y su adaptador (§8), que copia `crm/expedientes/crm-actor-read.adapter.ts`. Lo usan `updatedBy` del catálogo y, después, B2 y B3.
- Auditoría de las mutaciones del catálogo y del ajuste del tenant según §6.8, con `logWithin` en la transacción.
- Pipeline §6.9 en los controladores del catálogo: `limit` ≤ 100, `ParseUUIDPipe` y validación estricta. Los límites por actor de los comandos llegan con B2.
- Respuestas con las formas exactas del §4.4 y el envelope `ListResponse` de ADR-065.
- OpenAPI.

**Tests:**
- unitarios de validaciones y códigos de error;
- integración contra Postgres real: CA-NET-01, CA-NET-03 y **CA-NET-02 (20 reservas concurrentes, 0 duplicados)**;
- HTTP de permisos (CA-NET-12);
- auditoría: una prueba que fuerce el fallo de `logWithin` y demuestre que la mutación del catálogo se revierte.

## B2 · `sr-backend` — Aprovisionamiento en la OT

**Depende de:** B1b (cerrado) y S4 (cerrado).

**Entregables:**
- MOD11 (HLD §5.1 a 5.3):
  - `getExecutionSnapshot` (con `customerDisplayLabel`), `getExecutionSnapshots`, `hasEvidence` y `listInstallationOrders` en el puerto existente, con las formas de HLD v1.1 §5.1;
  - el nuevo `service-provisioning-read.port.ts`;
  - `kind: 'PROVISIONING'` en `TemplateRequirement` y en el evaluador;
  - la guarda en `close()`.
- Migración `163_publish_instalacion_estandar_v3.ts` (§3.4).
- MOD05 (§8): `subscriber-service-context-read.port.ts` con su adaptador.
- MOD12 (§8): `installed-equipment-read.port.ts` con su adaptador.
- MOD13:
  - `network-provisioning.controller.ts`: `context`, `reserve`, `certify`, `release`, `inbox`, `subscribers/:id`. `regularize` va en B3.
  - Dos proyecciones del contexto, construidas por separado (§6.5): `ProvisioningOrderContextDto` y `TechnicianProvisioningViewDto` de cinco campos.
  - `reservedBy`, `certifiedBy` y `releasedBy` resueltos con el `NetworkActorReadPort` que entregó B1b.
  - `TenantAwareThrottlerGuard` de 30 por minuto por actor en `reserve`, `certify` y `release` (§6.9).
  - `service-provisioning.service.ts`
  - `router-provisioning.port.ts` y `manual-router-provisioning.adapter.ts` (§6.6)
  - `service-provisioning-read.adapter.ts`

**Restricción de frontera:** ningún módulo importa servicios ni entidades de otro; solo puertos (§8).

**Tests:**
- CA-NET-04, CA-NET-05 y CA-NET-06: cerrar sin certificar → `CLOSURE_GATE_INCOMPLETE`, con el ajuste encendido y apagado;
- `NOT_EXECUTED` no consulta el puerto;
- R6 ter en `reserve` y `certify`;
- R6 bis: liberar un servicio `CERTIFIED` exige `certify`;
- la respuesta HTTP del técnico tiene exactamente los cinco campos;
- reversión cuando falla la auditoría de `reserve`, `certify` y `release`.

La suite existente de `tasks` debe seguir en verde, con conteo.

## B3 · `sr-backend` — Eventos, activación y regularización

### B3.0 · Frontera (antes de lo demás)

B2 hizo que `TasksModule` importara `NetworkModule` completo, con sus controladores. `NetworkModule` exporta además servicios (`IpamService`, `NetworkCatalogService`, `ServiceProvisioningService`) y reexporta `EXECUTION_ORDER_READ_PORT`. HLD v1.1 §5.2 pide un módulo estrecho (patrón ADR-097). Hay que:
- crear `network/network-provisioning-read.module.ts`, que solo provee y exporta `SERVICE_PROVISIONING_READ_PORT` con su adaptador y los repositorios que ese adaptador necesita;
- hacer que `TasksModule` importe ese módulo y no `NetworkModule`;
- dejar en `NetworkModule` solo los exports que otro módulo consume según HLD §8, sin servicios;
- comprobar que la suite de `tasks` y la de `network` siguen en verde, con conteo.

**Depende de:** B2.

**Entregables:**
- Worker (§5.4): `enqueueSignedNetworkEvent` en `execution-order-events.processor.ts`, solo para OT `INSTALLATION`.
- `network-execution-event.processor.ts`, con inbox y la tabla de efectos del §6.3.
- Evento `network.service-provisioning.activated` (§6.4).
- Listener CRM y `service-provisioning-commercial-status.port.ts`, definido en CRM e implementado en MOD13.
- Listener de inventario que fija `contract_ref_id`.
- Reconciliador (§6.7).
- `POST /network/provisioning/regularize`, con:
  - las guardas de HLD v1.1 §6.2 en orden: R12, R6 y R6 ter, lock por OT, reutilización de la fila `FAILED` e idempotencia;
  - `regularized_by` y `regularized_at`;
  - el límite por actor de §6.9.
- El inbox guarda solo `last_error_code` de `NETWORK_INBOX_ERROR_CODES` (§6.3).
- Las mutaciones asíncronas se auditan con actor de sistema (§6.8).

**Tests contra Postgres y Redis reales:**
- CA-NET-07, 08, 09 y 10;
- **un test que provoque el fallo del listener CRM dentro del `@OnEvent` real** y demuestre el reintento y el estado `PENDING`;
- CA-NET-11, con datos de fixture, no con los del caso de origen;
- regularize: OT no elegible, servicio ya `ACTIVE` (409), técnico nulo, regularizador igual al técnico y reintento idempotente.

Comprobar con `iwana-queue-inspect` que `network-execution-events` queda drenada. La suite del worker debe seguir en verde, con conteo.

## F1 · `fe-platform` — Catálogo de red

**Depende de:** P0 y B1b.

**Entregables:**
- `apps/portal/src/app/dashboard/network/routers/` y `ipv4-networks/`, según la spec P0 y el HLD §9: tablas con paginación numerada (ADR-065), drawers de alta y edición, barra de ocupación y acciones condicionadas por permiso.
- Grupo «Red» en la navegación del portal.
- `docs/directorio-modulos.md` actualizado.

Usa los componentes de `@iwana/ui`; no crees primitivas nuevas sin `ds-owner`.

## P0-ter · `prod-ux` — Addendum UX: Ajustes de red

Añade a `docs/specs/2026-10-22-mod13-aprovisionamiento-ux.md` una sección para la pantalla `network/settings` (HLD v1.1 §9, aclaración en §12):
- tabla de planes con su lista de direcciones PCQ y su edición;
- interruptor «Exigir aprovisionamiento certificado para cerrar instalaciones», con confirmación, efecto explicado y último cambio;
- estados vacío, cargando, error y sin permiso.

No añadas campos fuera del §4.4.

## F1-v · `fe-platform` — Prueba de F1 contra el API vivo

Precondición, que prepara el CTO: el API local responde en `127.0.0.1:3000`, y las credenciales E2E de un tenant de pruebas no `ACTIVE` están en variables de entorno, nunca en el chat. Si no se cumple, emite `[BLOQUEO]` y para, sin tocar código.

Ejecuta las pruebas de routers y redes IPv4 contra el API real:
- alta, edición y desactivación;
- solapamiento → `NETWORK_OVERLAP`;
- ocupación;
- acciones ocultas sin `network.catalog.manage`.

Reporta el conteo real. No corrijas código de producto: si algo falla, reporta el fallo.

## F2 · `fe-platform` — Panel de la OT, bandeja y ficha

**Depende de:** P0, P0-ter y B3.

**Entregables:**
- `app/dashboard/network/settings/`, según P0-ter.
- `components/operations/ExecutionOrderProvisioningPanel.tsx`, integrado en `ExecutionOrderMomentContainer` y `ExecutionOrderRequirementIndex`, con el faltante en `ExecutionOrderCloseSection`.
- `app/dashboard/network/provisioning/` con sus tres pestañas y la acción de regularizar.
- `components/crm/subscribers/SubscriberTechnicalServiceSection.tsx` en la pestaña «Servicios» de `SubscriberDetailClient.tsx`.
- La instrucción MikroTik con botón de copiar.
- `canCertify` controla el botón de certificar; el técnico nunca lo ve.
- Vista del técnico construida solo con `TechnicianProvisioningViewDto` (cinco campos). Nunca pide el contexto completo.
- Liberar un servicio `CERTIFIED` y regularizar piden motivo (10–500) y solo se ofrecen con el permiso que exige HLD v1.1 §6.2.
- Mensajes de cada código de `NETWORK_ERROR_CODES` según la spec UX, incluido `PROVISIONING_TECHNICIAN_REQUIRED`.
- Sección del suscriptor montada solo con `network.provisioning.read` (Q2).

**Pruebas:**
- componentes y páginas con datos tipados del §4.4;
- contra el API vivo con la misma precondición de §F1-v. Si no se cumple, entrega el resto y marca solo esa parte como `[BLOQUEO]`.

Conteo real, más lint, typecheck y build del portal.

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

Revisiones de solo lectura sobre el código de la fase: los commits `4217690a`, `03825527` y `f2de5537`, más el F2 sin commitear. Siguen el plan §4 (G5 y G6). Cada una entrega su informe en `docs/informes/` con hallazgos por severidad y `archivo:línea`. Ninguna corrige código.

### V2 · `sec-eng` — Seguridad de la implementación

Entregable: `docs/informes/INFORME-MOD13-REVISION-SEGURIDAD-IMPLEMENTACION-v1.0.md`.

Revisa en el código, no en el diseño:
- maker-checker (R6, R6 bis, R6 ter) en `reserve`, `certify`, `release` y `regularize`;
- guardas y lock de `regularize`;
- HMAC con `timingSafeEqual` antes del esquema, en el worker y en el consumidor;
- `TechnicianProvisioningViewDto` construido aparte;
- auditoría con `logWithin` y su lista cerrada;
- `last_error_code` sin mensajes crudos;
- ausencia de PII y secretos en logs;
- filtros de `tenant_id` en todas las consultas.

Cierra el P2 del pipeline (S0 §Verificación v1.1) con evidencia de la configuración real: `ThrottlerGuard` y `CsrfGuard` globales, `TenantAwareThrottlerGuard` en los comandos, validación con `whitelist` y `forbidNonWhitelisted`, `ParseUUIDPipe`, `limit` ≤ 100 y claims del JWT. Lo que solo se pueda probar en ejecución queda para V1.

### V3 · `boundary-reviewer` + `contract-drift-reviewer`

Entregable: `docs/informes/INFORME-MOD13-REVISION-FRONTERA-CONTRATOS-v1.0.md`. Puede ser uno conjunto, con una sección por revisor.

- **Frontera:** ningún módulo importa servicios ni entidades de otro; solo los puertos de HLD v1.1 §8. Incluye el hallazgo P3 abierto: `CrmModule` importa `NetworkModule` completo para obtener `SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT`.
- **Contratos:** `packages/shared/src/contracts/network/` contra sus productores en `apps/api` y `apps/worker` y sus consumidores en `apps/portal`, incluida la cola firmada y el requisito `PROVISIONING`.

### V4 · `ds-owner` — Identidad y sistema de diseño (parte estática)

Entregable: `docs/informes/INFORME-MOD13-REVISION-UI-v1.0.md`.
- `audit-ui.mjs` sobre las rutas `network/*` y los componentes nuevos o tocados de operaciones y suscriptores;
- uso de `@iwana/ui` sin primitivas nuevas y tokens reales;
- estados de la spec UX.

La evidencia visual a 375, 768 y 1280 px, en claro y oscuro, necesita el portal corriendo; queda como V4-bis junto con V1.

### Ola 7 · correcciones de V2, V3 y V4

#### B-fix · `sr-backend`

Aplica HLD v1.1 §12 (aclaraciones al recibir V2 y V3):

1. **SEC-IMPL-01 (P1):** auditar con `logWithin` la fila liberada por `releaseExistingWithin` cuando `regularize` reemplaza un servicio `FAILED`, con la acción `RELEASE` y `releaseReason: REPLACED`. Añadir una prueba contra Postgres que verifique las dos entradas de auditoría y que la operación se revierte si falla cualquiera de ellas.
2. **Códigos de error (V3, P2):**
   - `ipam.service.ts:75`: `NETWORK_NOT_FOUND` → `422 NETWORK_NOT_IN_ROUTER`;
   - `service-provisioning.service.ts:535`: `IPAM_CONFLICT` → `409 IP_IN_USE`;
   - prueba de arquitectura que recorra los `code:` emitidos por `apps/api/src/modules/network` (sin el processor del inbox) y falle si alguno no está en `NETWORK_ERROR_CODES` ∪ {`FORBIDDEN`, `VALIDATION_ERROR`}.
3. **Frontera (V3, P3):**
   - crear un módulo estrecho que provea y exporte solo `SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT`;
   - que `CrmModule` lo importe en lugar de `NetworkModule`;
   - una prueba de frontera como la de B3.0.
4. **SEC-IMPL-02 (P3):** `network-actor-read.adapter.ts` filtra `User` también por el `tenantId` autenticado. La búsqueda de `PlatformUser` queda aparte.
5. **SEC-IMPL-03 (P3):** el alta de router audita en `changedFields` los nombres de los campos opcionales enviados, sin valores.

Las suites de `network`, `tasks`, `crm` y del worker deben seguir en verde, con conteo.

#### F-fix · `fe-platform`

1. **DS-MOD13-P1-01:** `ExecutionOrderProvisioningPanel` no debe cortar con `readDenied` cuando falta `network.provisioning.read`:
   - si el usuario es el técnico asignado y tiene `operations.execution_orders.read`, pide el contexto y pinta la vista del técnico con los cinco campos de `TechnicianProvisioningViewDto`;
   - si el API responde 403, muestra el estado sin permiso;
   - añadir pruebas de las dos ramas.
2. **DS-MOD13-P2-02:** los tabs de la bandeja usan la receta compartida `portalModuleTabs*` en lugar de un `tablist` hecho a mano.
3. **DS-MOD13-P3-03:** el vacío del catálogo de routers muestra el texto de la spec UX §3 según el permiso: invita a registrar solo si existe la acción.
4. **V3:** prueba explícita de la etiqueta `PROVISIONING` en `execution-order-requirements.ts`.

Lint, typecheck y pruebas del portal con conteo. El build queda sujeto al `EPERM` del entorno; si persiste, se reporta y no se intenta forzar.

### Ola 8 · confirmación estática (no necesita entorno)

#### V2-c · `sec-eng`
Comprueba en el código que la Ola 7 cerró SEC-IMPL-01, 02 y 03 y que no abrió hallazgos nuevos en los archivos que tocó. Añade una sección «Confirmación Ola 7» a `INFORME-MOD13-REVISION-SEGURIDAD-IMPLEMENTACION-v1.0.md`. La prueba de reversión contra Postgres no corrió en la Ola 7 (1 suite y 6 tests omitidos): márcala como pendiente de runtime, no como cerrada.

#### V4-c · `ds-owner`
Comprueba DS-MOD13-P1-01, P2-02 y P3-03 en el código y vuelve a correr `audit-ui.mjs` sobre las rutas `network/*` y los componentes tocados. Añade una sección «Confirmación Ola 7» a `INFORME-MOD13-REVISION-UI-v1.0.md`. La evidencia visual sigue en V4-bis.

### Ola 9 · con entorno (precondiciones del CTO)

Precondiciones, todas en el entorno local y sin compartir secretos por el chat:
1. Docker Desktop corriendo, con Postgres (`127.0.0.1:5433`, base `dbiw`) y Redis de desarrollo arriba. Redis escucha en el puerto que fija `REDIS_PORT` en `.env` (hoy `6380`), no en 6379. Conviene rotar antes la contraseña de Redis, que se expuso en la Ola 4.
2. El API respondiendo en `127.0.0.1:3000`.
3. `E2E_TENANT_SLUG`, `E2E_TENANT_ADMIN_EMAIL` y `E2E_TENANT_ADMIN_PASSWORD` de un tenant **de pruebas** en variables de entorno. Ese tenant debe estar `ACTIVE`, porque uno `INACTIVE` no permite iniciar sesión, y nunca puede ser `tenant_iwana`. La v1.1 decía «no `ACTIVE`»; era un error del emisor, corregido el 2026-10-23.
4. `apps/portal/.next` sin bloqueos: cerrar los `node` residuales o borrar la carpeta antes de compilar.
5. Migraciones de MOD13 aplicadas: la pública `028_enable_btree_gist` y las de tenant de `160` a `164`, con `db:apply-least-privilege` ejecutado. El 2026-10-23 ningún tenant las tenía (todos llegaban a la 159). `db:migrate:all` las aplica a todos los tenants `ACTIVE`; los `INACTIVE` quedan fuera. Antes de lanzar, verifícalo en solo lectura.

Si falta alguna, cada bloque emite `[BLOQUEO]` y para.

#### B-mig · `data-eng` (antes que el resto de la Ola 9)

Primer intento de `db:migrate:all`, el 2026-10-23:
- la pública 028 y las de tenant 160–162 se aplicaron en los 6 tenants `ACTIVE`;
- la 163 falló en 5 tenants (`23514`, `chk_execution_order_template_requirements_kind`) y se revirtió en cada uno;
- en `tenant_iwana` quedó registrada como aplicada, pero no hizo nada (ya había una v3 sin `PROVISIONING`);
- `db:apply-least-privilege` no llegó a correr.

Corrige según HLD v1.1 §12 («Aclaración tras aplicar `db:migrate:all`»):
1. **163:** ampliar la restricción de tipos con `PROVISIONING` antes de insertar, y publicar la versión siguiente a la última, no la v3 fija. El `down` debe ser reversible y respetar las OT que usen la versión publicada.
2. **Nueva 164** (`164_ensure_provisioning_requirement.ts`), idempotente: amplía la restricción y publica la versión siguiente con `PROVISIONING` en todo tenant cuya última versión publicada no lo tenga. Cubre `tenant_iwana`, donde la 163 ya figura como aplicada, y es un no-op donde la 163 ya cumplió.
3. **Pruebas de integración** sobre un schema construido con todas las migraciones reales hasta la 162, no con un fixture mínimo. Deben cubrir tres casos: un tenant con v2, un tenant con una v3 previa sin `PROVISIONING` y la reaplicación idempotente.

Después, el CTO vuelve a correr `pnpm db:migrate:all`. Verificar en solo lectura, por tenant `ACTIVE`, que existe exactamente un requisito `PROVISIONING` en la última versión, y que se ejecutó `db:apply-least-privilege`. No borres filas de `typeorm_migrations` a mano. Sin cachés de jest en el repo. No commitees.

#### R-pg · `sr-backend`
Ejecuta las suites contra Postgres que quedaron omitidas, empezando por `service-provisioning.audit.postgres.integration.spec.ts` (1 suite, 6 tests), y todas las `*.postgres.integration.spec.ts` de `network`. No modifiques código de producto; si algo falla, reporta.

#### V4-bis · `ds-owner`
Con el portal corriendo, toma la evidencia visual de routers, redes IPv4, bandeja, ajustes, panel de la OT (vistas de NOC y del técnico) y sección técnica del suscriptor. Debe cubrir 375, 768 y 1280 px, en claro y en oscuro, y aplicar el criterio de `iwana-identity-ui-review`. Las capturas van en `docs/informes/evidence/mod13-ui/` y el resultado se añade a `INFORME-MOD13-REVISION-UI-v1.0.md` como «V4-bis».

### Ola 10 · desbloqueo de G4

La Ola 9 cerró R-pg (4 suites con 23 tests: reversión de auditoría y 20 reservas concurrentes sin duplicados) y dejó tres bloqueos: el login del portal, la guarda apagada en el tenant de pruebas y la falta de sesiones y datos de prueba.

#### T-login · `e2e-triage` (solo lectura y diagnóstico)
En F1-v, el login del portal en `localhost:3002` acepta los datos pero vuelve a `/auth/login` y no llega a `/dashboard` en 60 s. Con las mismas credenciales, el login directo contra el API devuelve 200. Además falta interactividad antes del login. Clasifica la causa en regresión, entorno o prueba, y contrasta como mínimo estas hipótesis:
- la cookie de sesión cae en otro host: el portal corre en `localhost` y el API en `127.0.0.1`;
- los cambios sin commitear de la sesión de instant navigation, ajenos a MOD13: `apps/portal/next.config.ts` (`experimental.instantInsights`, redirección de `/`), el borrado de `apps/portal/src/app/page.tsx` y `next-env.d.ts`;
- la hidratación no termina en modo dev.

Puedes repetir una prueba aislada para separar fallos intermitentes de una regresión. No edites archivos. Entrega `docs/informes/INFORME-MOD13-TRIAGE-LOGIN-PORTAL-v1.0.md` con la causa, la evidencia y quién debe corregir, y si el arreglo es de MOD13 o ajeno.

#### FX-v1 · `sr-qa` (fixtures en el tenant de pruebas `srqa-mod11-r5-20261006`)
**Escribes fixtures y tests, nunca código de producto.** Solo a través del API, y nunca en `tenant_iwana`:
1. encender `enforceProvisioningOnInstallClose` **solo en el tenant de pruebas**, con `PATCH /network/settings` como ADMIN. D-NET-3 reserva para G7 el encendido en el resto de tenants;
2. preparar sesiones E2E para un usuario NOC (o «Acceso estándar Aprovisionamiento»), el técnico asignado y un usuario con solo `network.catalog.read`. Crea los usuarios por el API si no existen y guarda sus credenciales solo en `.env.development.local`, con los nombres `E2E_NOC_*`, `E2E_TECH_*` y `E2E_NETWORK_READONLY_*`. Nunca en el chat ni en informes;
3. preparar los datos de dominio del §V1: suscriptor con contacto real y datos fiscales completos, expediente en `LISTO_PARA_INSTALACION` y una OT de instalación con plantilla v3 asignada al técnico.

Entrega una sección «Fixtures» en `INFORME-MOD13-PRUEBAS-V1-v1.0.md`, con identificadores pero sin datos personales ni secretos. Si para crear algo hiciera falta tocar código de producto, `[BLOQUEO]`.

#### FX-nav · `fe-platform` (corrección acotada del shell)
DS-MOD13-VIS-P2-01: en `Sidebar.tsx`, el enlace «Inicio» (`/dashboard`) se marca activo por prefijo junto con el módulo actual, con dos `aria-current="page"` a la vez. Corrígelo con coincidencia exacta para `/dashboard` y deja la coincidencia por prefijo para los módulos con subrutas. Añade su prueba. Es un defecto heredado del shell que no viene de MOD13; se corrige aquí por ser pequeño y porque afecta a CA-NET-14.

### Ola 11 · cierre de G4

La Ola 10 dejó:
- el login diagnosticado: el harness hacía clic antes de la hidratación;
- los fixtures listos en `srqa-mod11-r5-20261006`: guarda encendida, sesiones `E2E_NOC_*`, `E2E_TECH_*` y `E2E_NETWORK_READONLY_*`, y suscriptor, expediente y OT asignada con plantilla v3;
- el sidebar corregido.

Reglas comunes a los tres bloques de esta ola:
- **Antes de interactuar, espera a que la página sea interactiva:** que el control esté habilitado y que la hidratación haya terminado, según el método de `INFORME-MOD13-TRIAGE-LOGIN-PORTAL-v1.0.md`. Ningún clic antes de eso.
- **Comprueba `GET /api/v1/health` en 200 antes de empezar.** Si el API cae durante la ola, guarda el final de su log, sin secretos ni datos personales, en el informe del bloque antes de reiniciarlo, y clasifica la caída. La primera caída, en la Ola 10, quedó sin causa.
- Credenciales solo desde el entorno; nunca en la salida.

#### F1-v2 · `fe-platform`
Repite en el navegador las pruebas de routers y redes IPv4 con la espera de interactividad. Incluye las acciones ocultas con la sesión `E2E_NETWORK_READONLY_*`. Añade el resultado a `INFORME-MOD13-PRUEBAS-F1-V-v1.0.md`.

#### V1-r · `sr-qa`
Ejecuta §V1 completo con los fixtures de FX-v1, con conteo real y la matriz CA-NET → test cerrada.

**Ajustes tras la Ola 12 (2026-10-23):**
- **El worker debe estar corriendo** (`pnpm --filter worker dev`). El registro del equipo viaja por el outbox y el worker hasta inventario, y `ExecutionOrderClosedV1` llega a MOD13 por el mismo camino. Sin worker no hay comodato ni activación. Compruébalo antes de empezar; si no está, `[BLOQUEO]`.
- **El CPE nace en el flujo, no en el fixture.**
  - Prepara por el API de inventario un artículo serializado de categoría CPE, con serial, en custodia del técnico (`ASSIGNED_TO_TECHNICIAN`). **La MAC es opcional:** el contrato define `cpe.macAddress` como `string | null` y el API de inventario no permite asignarla. Si no se puede poner, sigue sin ella; no es un `[BLOQUEO]`.
  - Después, en el portal y como técnico, regístralo en la OT con disposición `INSTALLED_AT_CUSTOMER` antes de reservar.
  - Comprueba que el comodato queda abierto y que el contexto de NOC devuelve el `cpe` con su `serialNumber`, que es el último criterio de B-fix2. `macAddress` puede venir `null`.
- **Orden:** V4-bis-r se lanza después de que V1-r haya creado datos (reserva, certificación, cierre y servicio activo), para que la bandeja, la ficha y el panel de NOC tengan contenido.
- Nada en `tenant_iwana`. Credenciales solo desde el entorno.

#### V4-bis-r · `ds-owner`
Toma las 18 combinaciones pendientes con las sesiones y los datos de FX-v1: panel de OT para NOC y para el técnico, sección técnica del suscriptor, bandeja con datos y ajustes con planes. Vuelve a verificar que el sidebar ya no marca dos enlaces activos. Añade el resultado a `INFORME-MOD13-REVISION-UI-v1.0.md`.

### Ola 12 · corrección del contexto de OT

En la Ola 11, F1-v2 pasó (6/6), pero `GET /network/provisioning/orders/:id/context` responde 500 con `22P02`. El log de Postgres lo explica: `invalid input value for enum serialized_asset_status: "INSTALLED_AT_CUSTOMER"`.

La causa está en `apps/api/src/modules/inventory/ports/installed-equipment-read.adapter.ts:41`. Filtra `asset.current_status = 'INSTALLED_AT_CUSTOMER'`, que es un valor de `InventoryDisposition` (la disposición del consumo), cuando `current_status` es un `SerializedAssetStatus` y el equipo en comodato está en `INSTALLED_COMODATO`. El adaptador no tenía ninguna prueba contra Postgres.

#### B-fix2 · `sr-backend`
1. Corregir el filtro a `INSTALLED_COMODATO`, tomando el valor del enum compartido `SerializedAssetStatus` en vez de un literal.
2. Añadir `installed-equipment-read.adapter.postgres.integration.spec.ts`. Con un activo en comodato abierto para la OT y el suscriptor, devuelve serial, MAC y modelo; con el comodato cerrado, o sin activo, devuelve `null`.
3. Revisar todo SQL crudo de MOD13 (`apps/api/src/modules/network`, los puertos y adaptadores que B2 y B3 crearon en `tasks`, `crm` e `inventory`, y el worker) en busca de literales de enum. Cada uno debe venir del enum compartido o tener una prueba contra Postgres que lo ejerza. Reportar la lista revisada.
4. Probar el contexto contra el API vivo con la sesión NOC de FX-v1 y confirmar que devuelve 200 con `cpe` relleno.

No commitees. Sin cachés de jest en el repo.

Después de B-fix2 se relanzan los bloques 2 y 3 del launcher v1.12 (V1-r y V4-bis-r), sin cambios.

### Ola 13 · 500 en `reserve` y cableado real

Segundo relanzamiento de V1-r (2026-10-23). La cadena del CPE funciona de punta a punta: custodia del técnico → registro en la OT → worker → comodato, y el contexto de NOC muestra el `cpe`. El router y la red /24 de prueba quedaron activos. Pero `POST /network/provisioning/reserve` responde **500** con mensaje genérico. No hay reserva parcial y Postgres no registra ningún error, así que la excepción es de la aplicación. No hay log del API disponible.

Es el tercer defecto que solo aparece con el cableado real, después de `EventEmitter2` sin metadatos (`network-provisioning-reconciler.processor.ts`) y del literal de enum de `installed-equipment-read.adapter.ts`. Las pruebas de B2 y B3 sustituyen con dobles los puertos de CRM, inventario, tasks y router.

#### B-fix3 · `sr-backend`
1. **Traza.** Arranca el API con su salida redirigida a un archivo fuera del repo y repite **una sola vez** `reserve` sobre la OT de FX-v1, con la sesión NOC desde el entorno. Copia al informe la traza saneada, sin tokens, credenciales, IP del cliente ni datos personales.
2. **Corrección** de la causa, sin cambiar el contrato.
3. **Pruebas de cableado real** (`network/tests/*.wiring.postgres.integration.spec.ts`): una por comando (`context` para NOC y para el técnico, `reserve`, `certify`, `release` y `regularize`). Cada una construye `NetworkModule` con los módulos estrechos reales de tasks, CRM e inventario, contra Postgres, **sin dobles para los puertos**; solo puede sustituirse lo que sale del proceso (Redis). Deben fallar antes de la corrección y pasar después.
4. Vuelve a probar `reserve` contra el API vivo y deja la OT reservada para que V1-r continúe desde ahí.

Entrega `docs/informes/INFORME-MOD13-CORRECCION-RESERVA-v1.0.md`. No toques `tenant_iwana`, no imprimas secretos ni dejes cachés de jest en el repo. No commitees.

Después de B-fix3 se relanza V1-r y, con los datos que deje, V4-bis-r.

### Ola 14 · cableado real del consumidor

B-fix3 corrigió el 500 de `reserve`: faltaba `IpAssignment` en el `forFeature` de `NetworkModule`. Al recibirlo, AI-EM-ARCH encontró el mismo defecto en `NetworkInboxEvent`, que el consumidor usa con `manager.findOne` y `manager.save`. Por orden del CTO, AI-EM-ARCH la registró en `NetworkModule` el 2026-10-23 y comprobó que el API arranca con health 200. Falta la prueba que lo cubra.

#### B-wire · `sr-backend`
1. Añadir a `network/tests/network.wiring.postgres.integration.spec.ts`, o a un archivo hermano, una prueba de cableado real del **consumidor** `NetworkExecutionEventProcessor`. Debe construir `NetworkModule` con los módulos reales (sin dobles para puertos ni entidades), contra Postgres y Redis reales, y procesar un evento firmado `ExecutionOrderClosedV1` con resultado `EXECUTED` sobre un servicio `CERTIFIED`. Tiene que comprobar:
   - inbox marcado;
   - servicio e IP en `ACTIVE`;
   - evento `network.service-provisioning.activated` emitido;
   - una reentrega sin efecto.
2. La misma prueba con `NOT_EXECUTED` sobre un servicio `RESERVED`: queda `RELEASED`.
3. Una prueba de arquitectura que falle si alguna entidad de `@iwana/db` usada por `apps/api/src/modules/network` (en `manager.*`, `getRepository` o `findOne`) no figura en un `forFeature` de los módulos de red. Así este fallo no se repite.
4. Una prueba de arranque del `AppModule`, si no existe ya. Si es demasiado pesada para CI, márcala como de integración.

Habilita la integración con Redis que quedó omitida en B-fix3. Reporta el conteo real, sin omitidas que no estén justificadas. No toques `tenant_iwana`, no imprimas secretos ni dejes cachés de jest en el repo. No commitees.

### Ola 15 · cierre de G4 y gates (V1-ci ∥ V5, y después V4-plan)

V1-r demostró el flujo de punta a punta sobre FX-v1. El técnico cerró la OT, y quedaron el servicio `ACTIVE`, el comodato abierto y el suscriptor `ACTIVE`, verificados en el portal y en el API. NOC certificó y el cierre prematuro devolvió `422 CLOSURE_GATE_INCOMPLETE`. Pero el recorrido se completó **en varias invocaciones**, y el spec depende del estado de FX-v1 (identificadores fijos del CPE y estados tolerantes). V4-bis-r cubrió las 18 combinaciones y la bandeja con datos; «ajustes con planes» quedó vacío porque el tenant de pruebas no tiene planes comerciales.

#### V1-ci · `sr-qa`
Escribes tests y fixtures, nunca código de producto.
1. Haz `portal-network-provisioning-live.spec.ts` **autocontenido**. Cada corrida crea, por el API y solo en el tenant de pruebas, sus propios datos: suscriptor y expediente, CPE en custodia del técnico, OT asignada, router y red con prefijo propio, y un plan comercial con perfil PCQ.
2. El spec recorre el flujo completo **en una sola corrida** y con estados estrictos, sin listas de estados tolerantes: técnico registra el CPE → NOC reserva → cierre prematuro 422 → NOC certifica con evidencia → técnico cierra → servicio, suscriptor y comodato en `ACTIVE`, y `NOT_EXECUTED` libera la IP en una OT aparte.
3. Pásalo **dos veces seguidas** en verde, con conteo real. Los datos de cada corrida quedan aislados por un sufijo propio.
4. Deja creado un plan con perfil PCQ, para V4-plan.

G4 se cierra cuando se cumpla el punto 3.

#### V5 · `gate-verifier` (en paralelo con V1-ci)
Ejecuta los Gates Before Merge sobre lo que toca MOD13, sin caché de turbo:
- cobertura de `apps/api/src/modules/network` ≥80 %, y la de los puertos y adaptadores tocados en `tasks`, `crm` e `inventory`;
- lint y typecheck de `api`, `worker`, `portal`, `shared` y `db`;
- migraciones reversibles;
- OpenAPI actualizado;
- sin PII en logs.

Entrega `docs/informes/INFORME-MOD13-GATES-V5-v1.0.md` con conteo real. Si la cobertura no llega al 80 %, identifica las áreas sin probar; no escribas tests.

#### V4-plan · `ds-owner` (después de V1-ci)
Captura «ajustes con planes» (375, 768 y 1280 px, en claro y oscuro) con el plan que dejó V1-ci. Añade el resultado a `INFORME-MOD13-REVISION-UI-v1.0.md`.

### Ola 16 · gates abiertos de V5 y spec reproducible

V5 dejó dos gates abiertos, los dos de MOD13:
- **Logging:** `log-error-safety.architecture.spec.ts` falla (2 tests).
  - `network-execution-event.processor.ts:263` escribe en el log identificadores de un payload sin verificar (`untrustedIdentity`);
  - `network-execution-event.processor.ts:170` y `network-provisioning-reconciler.processor.ts:121` no tienen `@SanitizeFailedReason`.
- **Cobertura de `network`:** 49,92 % de statements (40,85 % de branches). Los huecos son `network-catalog.service.ts` (13 %), `network-execution-event.processor.ts` (22 %), `service-provisioning.service.ts` (66 %), el reconciliador (64 %), `service-provisioning-read.adapter.ts` y `service-provisioning-commercial-status.adapter.ts` (0 %), y los listeners de activación de CRM e inventario (0 %).

V1-ci quedó bloqueado por un **defecto previo de MOD11, ajeno a MOD13**: desde `5de2f5eb` (2026-07-27), el gate de cierre exige los requisitos obligatorios de la plantilla con cualquier resultado. Una OT de instalación no puede cerrarse como `NOT_EXECUTED` sin el CPE instalado. Ese defecto se trata aparte, fuera de esta fase. MOD13 no lo rodea, y el agente no debe registrar instalaciones falsas.

#### B-cov · `sr-backend`
1. **Logging:**
   - en `:263` no escribas nada que venga de un payload sin verificar: usa `omitted` o un hash corto;
   - añade `@SanitizeFailedReason` a los dos procesadores;
   - `log-error-safety.architecture.spec.ts` debe pasar y la suite completa del API debe quedar en verde, con conteo.
2. **Cobertura** de `apps/api/src/modules/network` hasta **≥80 %** de statements, lines y functions, y ≥70 % de branches. Prioriza las ramas de error y de idempotencia de los archivos citados. Cubre también los listeners de activación de CRM e inventario, con pruebas en sus propios módulos. Mide con la misma combinación que usó V5 (unitarias más integración contra Postgres) y reporta el mismo desglose.

No cambies el contrato ni el comportamiento. No commitees.

#### V1-ci2 · `sr-qa`
Hacer el spec autocontenido y estricto, igual que §V1-ci, con un solo cambio: la rama «libera la IP» se prueba **cancelando o anulando** una segunda OT con reserva viva (`ExecutionOrderCancelledV1` o `AnnulledV1`), no cerrándola como `NOT_EXECUTED`. Esa rama ya está cubierta por la integración de B-wire. Usa el plan PCQ que ya existe. Dos corridas seguidas en verde, con conteo real. G4 se cierra cuando se cumpla.

### Ola 17 · E2E de MOD13 en el CI (antes del push de G7)

`e2e/playwright.portal.config.ts` recoge todo `portal-*.spec.ts` (`testMatch: /portal-.*\.spec\.ts/`), así que el job bloqueante «E2E portal» del CI ejecutará `portal-network-provisioning-live.spec.ts`. El CTO decidió el 2026-10-23 **sembrarlo en CI**, no dejarlo como prueba local.

El provisioner del CI, `scripts/e2e-provision-operational.mjs`, ya crea un tenant nuevo, los usuarios NOC y técnico (`E2E_NOC_*`, `E2E_TECH_*`) y una sede operativa (`E2E_OPERATIONAL_SITE_ID`). El spec, en cambio, pide `E2E_MOD13_SITE_ID`, que el CI no publica.

#### E2E-CI · `sr-qa` (tests e infraestructura de pruebas; nunca código de producto)
1. Que el spec use `E2E_OPERATIONAL_SITE_ID` y conserve `E2E_MOD13_SITE_ID` solo como alternativa local. Ninguna variable que el provisioner no publique puede ser obligatoria.
2. Comprobar que los usuarios del provisioner tienen lo que el spec necesita: NOC con los permisos `network.*` de la plantilla estándar de NOC (migración 162) y el técnico asignable. Si falta algo, ampliar `scripts/e2e-provision-operational.mjs`. Si hiciera falta tocar `.github/workflows/ci.yml`, emitir `[BLOQUEO]`, porque es de `plat-ops`.
3. El spec ya es autocontenido. Que siga siéndolo en un tenant recién creado: plan con perfil PCQ, CPE en custodia, OT, router y red con prefijo propio, y la guarda encendida solo en ese tenant.
4. Reproducir en local el mismo camino que el CI: `node scripts/e2e-provision-operational.mjs` con la suite portal completa. Debe terminar con `E2E_SETUP=OK`, código 0, 0 fallos, 0 cuarentenas y los marcadores que verifica `--verify-playwright-markers`. Reportar el conteo real y la duración que añade el spec.

Entrega una sección «E2E en CI» en `INFORME-MOD13-PRUEBAS-V1-v1.0.md`. No toques `tenant_iwana`, no imprimas secretos ni dejes cachés en el repo. No commitees.

### V1 y V5 — después de G4

- **V1 (`sr-qa`)** necesita el API vivo y las credenciales E2E, igual que F1-v. Se lanza cuando el CTO prepare el entorno.
- **V5 (`gate-verifier`)** necesita además un build del portal sin `EPERM`: el `.next` debe estar libre de bloqueos de otros procesos. Mide la cobertura de `network` (≥ 80 %) y corre los Gates Before Merge sin caché.

## Lo que ningún bloque hace

- Conectarse a un router o guardar credenciales.
- Encender `enforceProvisioningOnInstallClose` en tenants reales.
- Regularizar el caso de origen (OT `OTE-20260828-001`).
- Commitear.

Esas acciones son de G7 (AI-EM-ARCH + CTO).
