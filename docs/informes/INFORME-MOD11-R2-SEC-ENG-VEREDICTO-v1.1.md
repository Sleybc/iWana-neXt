# INFORME-MOD11-R2-SEC-ENG-VEREDICTO-v1.1

**Estado:** **SECURITY GO CONDICIONAL** para la postura de seguridad y el merge, sin autorización de despliegue productivo.
**Fecha:** 2026-08-01  
**Owner:** **AI-SEC-ENG**
**Identificador:** AI-SEC-ENG
**Expediente:** MOD09-MOD11 OT de instalación
**Alcance:** cambios actuales desde 439de2de, con foco en migraciones 100/101, replay de evidencia, propagación de errores del worker, QA-49, QA-33 y gate CI.

---

## 1. Resumen ejecutivo

La revisión independiente no confirma una vulnerabilidad crítica nueva en los cambios revisados. La evidencia estática actual respalda:

- migración 101 con purga condicionada por la relación tipada de idempotencia y rollback fail-closed coordinado con la 100;
- replay de un intent PENDING vencido como EVIDENCE_UPLOAD_EXPIRED, sin mutación ni nuevo upload;
- propagación de errores del worker para permitir reintentos/DLQ;
- QA-49 con aserciones explícitas de cero escrituras en storage del navegador;
- contrato de rate limit fail-closed y cobertura HTTP/unit del 503 con request autenticada válida + Redis no disponible.

El veredicto de seguridad es **GO condicional**. Las condiciones de verificación E2E/CI no se convierten en un hallazgo crítico ni se mezclan con el veredicto de seguridad:

- **QA-33 E2E: PASS en evidencia dinámica posterior a esta revisión.** La corrida final ejecutó 29/29, 0 fallos, 0 skips, flaky=0, exit 0 y cleanup OK; esta evidencia pertenece al carril de ejecución y no se atribuye como ejecución propia de AI-SEC-ENG.
- **G6.5 CI: fuera del veredicto de seguridad.** El piso del vertical es 29 pasadas, 0 fallidas, 0 skipped, 0 did-not-run y flaky=0; el cumplimiento efectivo requiere una corrida CI que no está disponible en esta sesión.
- **G7 producción: NO-GO** hasta completar evidencia de plataforma, TLS, rollback/restore y la autorización correspondiente.

No se implementó código productivo ni tests; esta sesión solo actualiza los informes autorizados.

---

## 2. Método y límites de evidencia

### 2.1 Evidencia ejecutada por AI-SEC-ENG en esta sesión

**No se ejecutaron comandos de shell, pnpm, Jest, Playwright, Docker, PostgreSQL ni Redis en esta sesión.** El entorno disponible para esta revisión no expuso shell. Por ello, este informe **no inventa exit codes** ni presenta como corrida propia ningún comando.

### 2.2 Evidencia dinámica archivada, no re-ejecutada

| Artefacto | Lectura válida | Límite |
|---|---|---|
| docs/quality/evidence-fase-06-g6/provision-run5.txt | 26 tests E2E pasados y E2E_PLAYWRIGHT_EXIT=0 | Corrida anterior; no contiene 4c/4d/4e y deja E2E_CLEANUP=DISABLED. |
| docs/quality/evidence-fase-06-g6/provision-run6.txt | 26 tests E2E pasados | Corrida anterior; no contiene 4c/4d/4e ni evidencia del piso actual de 29. |
| Informes previos de backend/plat-ops | Trazabilidad histórica de pruebas reportadas por esos owners | No se elevan a ejecución de AI-SEC-ENG ni se revalidan por inferencia. |

### 2.3 Evidencia estática

La lectura estática se realizó sobre el árbol actual y sobre PRD/HLD del módulo. Las rutas y líneas citadas son orientación verificable, no sustituyen la ejecución dinámica.

---

## 3. Veredicto de controles revisados

| Control | Estado | Evidencia actual | Alcance del juicio |
|---|---|---|---|
| Rate limiter | GO condicional | TenantAwareThrottlerGuard usa Redis, clave por bucket/actor/tenant, operación atómica y fail-closed (apps/api/src/modules/tasks/guards/tenant-aware-throttler.guard.ts:35-114). | Static + tests HTTP existentes; no reejecutado aquí. |
| TLS | Pendiente de evidencia | No se ejecutó runner de Nginx/TLS ni despliegue. | Condición de plataforma/G7; no se declara satisfecha. |
| JWT | GO estático | JwtStrategy exige firma RS256, expiración, issuer/audience y coherencia con type (apps/api/src/modules/auth/strategies/jwt.strategy.ts:41-70). | No se reejecutó autenticación E2E. |
| Tenant resolution | GO estático | TenantMiddleware compara tenantId y schemaName del JWT con public.tenants (apps/api/src/modules/tenant/tenant.middleware.ts:44-59). | No sustituye una prueba dinámica de aislamiento. |
| RBAC/permisos | GO estático | Controller protegido con JwtAuthGuard, RolesGuard y PermissionsGuard; roles usan UserRole.* (execution-orders.controller.ts:23-81). | Roles según PRD; no se fija un número fuera de la matriz. |
| ABAC | GO condicional | ExecutionOrderAccessGuard aplica ownership y deny-by-default sin recurso (execution-order-access.guard.ts:31-66). | Static + suites reportadas; no reejecutado aquí. |
| Input validation | GO estático | DTOs usan ParseUUIDPipe y ZodValidationPipe; existe pipe global estricto (execution-orders.controller.ts:93-105, main.ts:42-49). | No reejecutado aquí. |
| Audit CUD | GO estático | AuditInterceptor está registrado globalmente para CUD y sanea secretos/PII (app.module.ts:238-244, audit.interceptor.ts:43-114). | No se declara cobertura 100% dinámica en esta sesión. |
| Secretos/PII | Sin hallazgo crítico nuevo observado | El scope revisado no añade credenciales ni PII real; los logs del worker usan identificadores técnicos. | Mantener revisión de fixtures y logs en CI. |

---

## 4. Revisión específica de las correcciones

### 4.1 Migraciones 100/101 y retención — **GO condicional**

- La 100 crea evidence_upload_intent_id, FK ON DELETE RESTRICT e índice parcial; el backfill solo enlaza UUIDs existentes en el mismo schema (packages/database/src/migrations/tenant/100_link_execution_order_evidence_idempotency.ts:28-66).
- La 101 purga intents expirados únicamente cuando no existe referencia en idempotencia (101_align_execution_order_evidence_intent_retention.ts:238-255).
- El down de la 101 falla cerrado si la 100 sigue aplicada y no restaura la función legacy insegura (101_align_execution_order_evidence_intent_retention.ts:263-292).
- El runner ordena el rollback 100 → 101 dentro de una transacción, con rollback transaccional ante error (packages/database/src/migrations/tenant/revert.ts:83-104, :340-363).
- La integración declara aislamiento por schema, FK restrictiva y rollback coordinado, pero su ejecución real depende de PostgreSQL disponible; no se reejecutó en esta sesión.

**Conclusión AppSec:** la corrección elimina la combinación peligrosa “FK de 100 + función legacy de 095” durante el rollback normal. No se desautoriza evidencia previa: se clasifica como evidencia histórica hasta repetirla en el entorno objetivo.

### 4.2 Replay de PENDING vencido — **GO condicional**

El servicio obtiene primero el intent vinculado, valida status y después compara expiresAt contra el reloj; un PENDING vencido devuelve EVIDENCE_UPLOAD_EXPIRED y no crea upload ni muta el registro (apps/api/src/modules/tasks/services/execution-orders.service.ts:1245-1305). La prueba dedicada cubre vencido versus futuro y exige ausencia de update, save y nuevo upload (execution-orders.evidence.service.spec.ts:505-584).

### 4.3 Propagación de errores del worker — **GO estático**

- El processor de eventos hace ROLLBACK, registra diagnóstico mínimo y vuelve a lanzar el error para que BullMQ reintente (apps/worker/src/processors/execution-order-events.processor.ts:214-224).
- El processor de huérfanos vuelve a lanzar errores después de liberar el cliente (apps/worker/src/processors/evidence-orphan-detection.processor.ts:83-107).
- La suite fuente contiene aserciones rejects.toThrow para fallo transitorio, rollback y propagación (execution-order-events.processor.spec.ts:435-484, evidence-orphan-detection.processor.spec.ts:425-447).

### 4.4 QA-49 — **GO condicional, sin declarar suite ejecutada**

Las pruebas actuales espían localStorage/sessionStorage e indexedDB.open, y asertan cero escrituras en OperationsClient y ExecutionOrderDrawer (OperationsClient.spec.tsx:548-573, ExecutionOrderDrawer.spec.tsx:1217-1279). Esto es evidencia estática de determinismo/cobertura añadida; el conteo reportado por una corrida no se inventa en esta sesión.

### 4.5 503 con Redis caído — semántica correcta y límite de 4e

La afirmación correcta es:

1. **Request autenticada válida + Redis no disponible:** la cobertura HTTP/unit del controller construye un Bearer aceptado por el harness, hace que redis.eval rechace y aserta HTTP 503 con RATE_LIMIT_STORE_UNAVAILABLE (apps/api/src/modules/tasks/tests/execution-orders.controller.http.spec.ts:806-840).
2. El controller coloca JwtAuthGuard antes del throttler; por tanto, la prueba 503 solo es válida con autenticación ya aceptada. El fail-closed ocurre en el throttler (execution-orders.controller.ts:74-81, tenant-aware-throttler.guard.ts:87-97).
3. **E2E 4e no asserta 503.** Su contrato solo exige que, con Redis real detenido, no haya respuesta 200/2xx y que, al restaurarlo, vuelva 200 con headers de rate limit (e2e/tests/api/execution-orders-operational.spec.ts:1485-1529). No se debe presentar 4e como prueba de status 503.
4. La evidencia dinámica posterior confirma 4e conforme a su contrato: sin 2xx con Redis detenido y recuperación 200 con headers al restaurarlo.

---

## 5. QA-33, CI G6.5 y bloqueos explícitos

### QA-33 E2E — **PASS en evidencia posterior; fuera de la ejecución propia de AppSec**

La ejecución dinámica posterior a la emisión de este informe cubrió los casos **4c, 4d y 4e** dentro de la corrida vertical completa: 29 passed, 0 failed, 0 skipped, 0 did-not-run, flaky=0, exit 0 y cleanup OK. El artefacto sanitizado es `docs/quality/evidence-fase-06-g6/provision-run-r41-final.txt`.

El intento de provisión está adicionalmente bloqueado por:

- Los bloqueos históricos del reporter, bootstrap y proceso externo del API fueron corregidos en el provisioner.
- El caso BOLA se aisló del bucket agotado deliberadamente por 4d esperando su reset, sin relajar la aserción 404.

**Acción requerida:** conservar la evidencia de QA-33 y ejecutar los jobs Linux de G6.5. Security no convierte esa corrida local en autorización productiva.

### G6.5 CI — fuera del veredicto de seguridad

El gate está parametrizado con piso **29** y rechazo de flaky > 0 (scripts/e2e-provision-operational.mjs:17-18, :91-105; workflow ci.yml:448-451, :511-529). Esta lectura confirma el contrato del gate, no su cumplimiento en una corrida actual. **G6.5 queda fuera del veredicto de seguridad** y debe cerrarse con CI Linux real.

---

## 6. Dependencias y discrepancias documentales

El PRD MOD11 v1.2 identifica el addendum ADR-068 como **propuesto** (PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md:3-4,299-301), mientras el HLD v1.1 lo rotula **Aprobado** en su addendum (HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md:4,333-371). No se sintetiza este conflicto. Requiere reconciliación documental por EM-ARCH/CTO antes de producción; no es una vulnerabilidad crítica de los cambios revisados.

Cualquier requisito regulatorio no confirmado permanece como **requiere verificación con fuente oficial**. Este informe no declara cumplimiento legal cerrado.

---

## 7. Hallazgos y SLA

| ID | Severidad | Estado | Hallazgo / condición | Owner de corrección | SLA |
|---|---|---|---|---|---|
| SEC-ENG-01 | Media | Condicional | Falta reejecución dinámica de la cadena completa y evidencia de TLS/entorno objetivo. | AI-PLAT-OPS + AI-SR-QA | Antes de G7/producción |
| QA-33-E2E | Evidencia dinámica, fuera de seguridad | Cerrado en QA | Corrida final 29/0/0/0/0, flaky=0, exit 0 y cleanup OK; evidencia sanitizada archivada. | AI-SR-QA + AI-PLAT-OPS | Mantener en CI |
| G6.5-CI | Gate de CI, fuera de seguridad | Pendiente | No existe en esta sesión una corrida Linux que demuestre 29/0/0/0/0 y flaky=0. | AI-PLAT-OPS | Antes de G6.5 |
| CVE-PLAT-OPS | Según snapshot PLAT-OPS | En seguimiento | Se conserva el inventario de dependencias del informe CVE; no se re-clasifica por inferencia ni se re-ejecuta pnpm audit aquí. | AI-PLAT-OPS | Según informe CVE |

No se confirma P0/P1 crítico nuevo en este alcance. No se aprueba ninguna excepción de seguridad.

---

## 8. Decisión final de AI-SEC-ENG

**[SEC-REVIEW] Veredicto:** **SECURITY GO CONDICIONAL** para los controles revisados y el merge, sujeto a que el cierre de plataforma mantenga TLS, despliegue seguro y la evidencia de CI requerida.

- **QA-33 E2E:** PASS en evidencia dinámica posterior; no implica autorización productiva.
- **G6.5 CI:** pendiente y explícitamente fuera del veredicto de seguridad.
- **G7 producción:** NO-GO hasta completar sus gates y la autorización humana correspondiente.
- No hay base para una **[ESCALACIÓN DE SEGURIDAD]** por vulnerabilidad crítica confirmada en esta reemisión.

**Corrección documental aplicada:** Owner corregido a AI-SEC-ENG; se separaron evidencia dinámica, evidencia estática y bloqueos; se corrigió la descripción del 503. La corrida posterior de QA se registra como evidencia del carril de ejecución, no como ejecución propia de AI-SEC-ENG.
