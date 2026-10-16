# PROMPT — `privacy` Fase 1b · Delta v1.3 · Correcciones de la Ola 2

**Versión:** 1.3 (delta sobre v1.0 a v1.2; lo que no se toca sigue vigente) · **Fecha:** 2026-10-16 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado
**Plan:** [2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md) v1.3 · **Base:** `main` en `0af184d4`
**Origen:**
- [V1](../informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.0.md): `[BLOQUEO]`;
- [V2](../informes/INFORME-PRIVACY-FASE-1B-V2-SEC-v1.0.md): NO-GO, dos altos;
- [V3](../informes/INFORME-PRIVACY-FASE-1B-V3-REV-v1.0.md): NO-GO, un alto, un medio y un bajo;
- [V4](../informes/INFORME-PRIVACY-FASE-1B-V4-GATES-v1.0.md): gates verdes;
- [V5](../informes/INFORME-PRIVACY-FASE-1B-V5-DOCS-v1.0.md): solo menores;
- CI [`38958070660`](https://github.com/Sleybc/iWana-neXt/actions/runs/38958070660): unit tests de los siete paquetes en verde y una integración Postgres en rojo.

AI-EM-ARCH verificó en el código los hallazgos altos antes de emitir este delta.

## 1. Hallazgos y disposición

| # | Origen | Severidad | Hallazgo | Verificado | Dueño |
| --- | --- | --- | --- | --- | --- |
| H1 | V2-1 | Alta | `PATCH crm/subscribers/:id/section/:section` no llama `assertNotBlocked` y responde con `sanitizeResponse(updated, [], true)`: un usuario de gestión edita a un bloqueado y recibe la PII completa | `subscribers.controller.ts:440-448` | B3 |
| H2 | V2-2 | Alta | La auditoría de la supresión usa `AuditService.log()`, que abre su propia transacción y absorbe errores: la supresión puede confirmarse sin su evento. El HLD §7 exige auditar dentro de la transacción cuando el efecto es atómico | `requests.service.ts:1046`; `audit.service.ts:48` (`logWithin`), `:90` (`log`) | B1 |
| H3 | V2-2 | Alta (derivada) | Las lecturas de datos bloqueados con permiso especial (`grantedBy`, `blockedServed`) también se auditan con `log()`, así que una lectura puede servirse sin rastro | Controllers de suscriptores, expedientes y contratos | B3 |
| H4 | V3 | Alta | La vista previa no limita `candidateExpedienteIds`, pero `resolve` acepta como máximo 50: con más de 50 expedientes, la pantalla no puede resolver | `requests.ts:219-225` frente a `:246-254` | B1 + B4 |
| H5 | V3 | Media | `PATCH crm/contracts/:id` (y las demás mutaciones de contrato) responden sin `titularAnonymizedAt` proyectado: la insignia «Anonimizado» desaparece hasta recargar | `contracts.service.ts:633-647` | B3 |
| H6 | V3 | Baja | `titularAnonymizedAt` aparece como opcional en OpenAPI y como requerido (nullable) en shared | `contract-response.dto.ts:36-37` | B3 |
| H7 | CI | P1 | `150_…integration.spec.ts:154` cuenta la función en `pg_proc` sin filtrar por schema; en CI hay más de un schema tenant y da 2 | Log del CI | B1 |
| H8 | V2 (hardening) | Baja | `ExpedienteSections.tsx:62` comprueba `privacyRestricted` solo como truthy: si falta, muestra los datos | — | B4 |
| H9 | V1 | `[BLOQUEO]` | No existe la suite E2E de los cuatro casos, y `dbiw` no está migrada a la 151. El launcher v1.3 decía «eres verificador: no corrijas código», y `sr-qa` entendió que tampoco debía **escribir** tests. **Defecto del emisor**: V1 es autor de la suite E2E | — | V1 (`sr-qa`) + CTO |
| H10 | V5 | Menor | Faltan metadatos (fecha o estado) en 7 documentos | — | AI-EM-ARCH (prompts) |

## 2. Contratos de corrección

### C1 · Edición por sección (H1, B3)

`updateSection` llama `assertNotBlocked(id)` antes de editar (409 `PRIVACY_DATA_BLOCKED`, como `update`). Su respuesta se proyecta con el `canSeeBlocked` real del actor, nunca forzado a `true`.

**Regla general para B3:** busca en `crm/subscribers`, `crm/expedientes` y `crm/contracts` toda llamada que fuerce la proyección completa (`sanitizeResponse(…, true)` o equivalente) y justifica cada una en el informe: solo es válida después de `assertNotBlocked`.

**Test HTTP:** gestión sin `crm.blocked_data.read` → 409 y ningún dato en el cuerpo.

### C2 · Auditoría de la supresión dentro de la transacción (H2, B1)

`resolveSuppression` audita con `AuditService.logWithin(entry, manager)`, usando el `manager` de la transacción. Un fallo de auditoría **revierte** la supresión.

**Test de integración:** se provoca un fallo en `logWithin` → la solicitud sigue `EN_TRAMITE`, ningún participante cambió filas y no queda `erased_at`. También se corrige el comentario de `requests.service.ts:983-985`.

### C3 · Lecturas de datos bloqueados: sin auditoría no se sirven (H3, B3)

Decisión del emisor: la única justificación para que facturación o el Oficial vean datos bloqueados es el **rastro auditable**. Por eso, sin auditoría no hay lectura.
- **Cuándo aplica:** cuando la respuesta sirve datos de un titular bloqueado gracias a `canSeeBlocked`.
- **Cómo:** la auditoría se escribe **antes** de responder, con `logWithin` dentro de un `runInTenantSchema` corto.
- **Si falla:** 503 `PRIVACY_AUDIT_UNAVAILABLE`, sin datos en el cuerpo.
- **Qué no cambia:** las lecturas de titulares no bloqueados conservan la auditoría vigente (`log()`, ADR-067). No se amplía el alcance.

### C4 · Límite de candidatos (H4, B1 + B4)

- `@iwana/shared` (B1): `resolveRequestSchema.erasure.expedienteIds` y `erasurePreviewSchema.candidateExpedienteIds` pasan a `.max(500)`. `erasureBlockerSchema` agrega `'TOO_MANY_CANDIDATES'`.
- `erasurePreview` (B1): con más de 500 candidatos devuelve `eligible: false`, `blockers: ['TOO_MANY_CANDIDATES']`, `candidateExpedienteIds: []` y los conteos reales.
- `resolve` con más de 500 candidatos recalculados → 409 `PRIVACY_ERASURE_TOO_MANY_CANDIDATES`.
- Esos casos se atienden con el CLI de emergencia, según el runbook.
- **Test:** preview y resolve con 501 candidatos sintéticos, y un test de esquema que pruebe que toda vista previa elegible produce un cuerpo de `resolve` válido.
- **Portal (B4):** etiqueta en español del bloqueo nuevo: «Hay demasiados expedientes para resolver desde la pantalla. Usa el procedimiento de emergencia del Oficial de protección de datos».

### C5 · Respuestas de mutaciones de contrato (H5 y H6, B3)

- `update`, `service-point`, `stratum-evidence` y la creación de contratos devuelven la proyección de lectura (`projectContractsForRead`), con `titularAnonymizedAt` y la redacción de v1.1.
- OpenAPI: `@ApiProperty({ nullable: true })` para `titularAnonymizedAt`.
- **Test:** editar un contrato de un titular anonimizado conserva `titularAnonymizedAt` en la respuesta.

### C6 · Test de la 150 (H7, B1)

Filtrar por `pronamespace = to_regnamespace(current_schema())` (y lo mismo en cualquier otra consulta a catálogo de los specs 149 a 151). Correr la integración con **dos schemas tenant** presentes, como en CI.

### C7 · Guarda del componente (H8, B4)

En `ExpedienteSections.tsx`, la sección se trata como restringida si `privacyRestricted !== false`, igual que `page.tsx:275`. Test con el campo ausente.

### C8 · Suite E2E de la Fase 1b (H9, V1)

`sr-qa` **escribe** `e2e/tests/portal-privacy-fase-1b-live.spec.ts` contra la API real, con los cuatro casos del launcher v1.3 más v1.2 §4 y R16. Puede crear tests y fixtures, nunca código de producto ni contratos.
- **Datos:** sintéticos y aislados, creados por la propia suite a través de la API (o con un script de siembra propio en `e2e/scripts/`), y limpiados o con prefijo único por corrida.
- **Precondición del CTO:** `pnpm db:backup` y `pnpm db:migrate:all` sobre `dbiw` hasta la tenant 151. `sr-qa` lo acredita en el informe con la versión de migración del tenant de prueba.
- **Evidencia:** conteo real de Playwright, sin reintentos ocultos (`--retries=0`), y la matriz R1–R16 ↔ test.

## 3. Propiedad

| Bloque | Agente | Correcciones | Archivos |
| --- | --- | --- | --- |
| B1 | `sr-backend` | C2, C4 (shared y API), C6 | `privacy/**`, `packages/shared/src/schemas/privacy/**`, specs de las migraciones 149 a 151 |
| B3 | `sr-backend` | C1, C3, C5 | `crm/subscribers/**`, `crm/expedientes/**`, `crm/contracts/**` |
| B4 | `fe-platform` | C4 (etiqueta), C7 | `apps/portal/src/components/privacy/**`, `apps/portal/src/components/crm/expedientes/**` |
| V1 | `sr-qa` | C8 | `e2e/tests/portal-privacy-fase-1b-live.spec.ts`, `e2e/scripts/` (solo lo propio) |

B1 y B3 corren en paralelo; B4 arranca cuando B1 publique el cambio de shared (C4). V1 escribe la suite en paralelo y la **ejecuta** cuando B1, B3 y B4 estén verdes y el CTO haya migrado `dbiw`.

**Evidencia obligatoria para B1, B3 y B4** (lección del 2026-10-16):
- la suite **completa** de su paquete, sin caché;
- para backend, además, el arranque real de la API hasta `/health`;
- `pnpm exec turbo run test --force --continue` con los totales por paquete.

## 4. Re-verificación

| # | Agente | Alcance |
| --- | --- | --- |
| V2′ | `sec-eng` | H1, H2 y H3 sobre el diff de este delta; GO/NO-GO de G4 |
| V3′ | `contract-drift-reviewer` | H4, H5 y H6 |
| V4′ | `gate-verifier` | Gates completos, más la integración Postgres con varios schemas |

V2′ y V3′ corren en paralelo cuando terminen B1, B3 y B4; V4′ va al final. G6 se cierra con V1 (C8) y V4′ en verde; G6.5, con el CI de `main` en verde por SHA.
