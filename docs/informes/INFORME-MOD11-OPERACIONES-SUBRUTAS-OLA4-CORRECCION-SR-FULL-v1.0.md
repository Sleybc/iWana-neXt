# INFORME — MOD11 Operaciones · OLA 4.1 (corrección) · SR-FULL — DEF-F6-01 y SEC-D4

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-SR-FULL (`sr-backend`)
**Encargo:** ola correctiva 4.1 de MOD11, orden autosuficiente del orquestador (cierre de G6) — no hay prompt de fase nuevo.
**Atiende:** `[BLOQUEO]` de AI-SR-QA por **DEF-F6-01** (crítico, ruteo) y `[CONSULTA]` bloqueante de AI-SR-QA a AI-SR-FULL; y **SEC-D4** (Baja, funcional) del dictamen `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SEC-ENG-v1.0.md` §4.1, condicionado a que se resolviera con lookup batch por página.
**Referencias:** `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md` §6.2/§11 · `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SEC-ENG-v1.0.md` §4.1/§10 · plan `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 §8/§8.1/§13.1 · spec `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 §4.7.1/§4.7.2 · contrato `packages/shared/src/contracts/operations/execution-orders-list.ts` v1 (no modificado).
**Rama:** `main` (HEAD `7314c208`) · sin ramas/worktrees · **sin commit** · solo `pnpm` · sin PII.

---

## 1. DoR verificado antes de arrancar

| Condición de entrada | Estado | Evidencia |
| --- | --- | --- |
| H6 aceptado / G5 completo | ✅ | `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md` §4 («G5 COMPLETO — APROBADO», H1–H6 verificados) |
| Informe QA OLA4 en disco (bloqueo + consulta) | ✅ | `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md` §6.2 y §11 leídos íntegros |
| Causa raíz de DEF-F6-01 declarada y verificable | ✅ | Leída en QA §6.2 y reproducida en proceso (§3.1 de este informe: el spec nuevo falló en rojo con 400 antes del fix) |
| Contratos congelados localizables | ✅ | `execution-orders-list.ts` v1 y `execution-orders.ts` leídos; **ninguno modificado** |
| Entrada incompleta | No se detectó; **no se emitió `[BLOQUEO]` de arranque** |

## 2. Skills leídas (declaración §5.1 del plan)

**Obligatorias (leídas antes de tocar código):**

- `nestjs-expert` — módulo/controlador/rutas NestJS, orden de registro, testing con Supertest; aplicada al reorden de `controllers` y al harness de la regresión.
- `backend-security-coder` — validación en boundaries, boundaries del modulith, zero-trust PII; aplicada a la decisión SEC-D4 (servicio existente, sin tablas ajenas) y a la no-exposición de campos.
- `postgresql` — sin cambio de esquema ni consultas nuevas por fuera de `findDisplayLabelsByIds`; el lookup batch es una `IN` parametrizada ya existente (sin N+1).

**De apoyo (leídas):**

- `testing-patterns` — comportamiento sobre implementación; un caso nuevo por responsabilidad; bugfix reproducido antes del fix.
- `systematic-debugging` — causa raíz antes de fix (fase 1 reproducida en rojo, fase 4 con test del fallo), sin parche de síntoma.

**No usada y por qué:** `openapi-spec-generation` — la superficie OpenAPI **no cambia**: `ExecutionOrderListAssigneeDto.displayLabel` ya estaba declarado (`@ApiPropertyOptional`) en `apps/api/src/modules/tasks/dto/execution-orders.dto.ts:729-738` y el campo ya figura en el DTO del listado (`:765-766`). No hubo endpoints nuevos ni modificados.

## 3. DEF-F6-01 — corregido

### 3.1 Causa raíz (confirmada, no supuesta)

Express resuelve las rutas **en orden de registro**. En `tasks.module.ts` los controladores se declaraban `[TasksController, ExecutionOrdersController, ExecutionOrderTemplatesController]`; `TasksController` declara `@Get(':id')` (`tasks.controller.ts:91`, con `ParseUUIDPipe`). Para `GET /tasks/execution-orders`, el segmento `execution-orders` es capturado por `:id` → el pipe responde 400 antes de alcanzar el listado.

Reproducción en proceso (evidencia roja, previa al fix) con el spec de regresión montando los controladores en el orden real del módulo:

```text
● GET /api/v1/tasks/execution-orders …            Expected: 200 · Received: 400
● GET /api/v1/tasks/execution-order-templates …   Expected: 200 · Received: 400
Tests: 3 failed, 2 passed, 5 total
```

La colisión afectaba a **dos** rutas estáticas de un segmento, no solo a la reportada: `tasks/execution-orders` (bandeja de OT) y `tasks/execution-order-templates` (listado de plantillas). Ambas quedaron corregidas por el mismo movimiento.

### 3.2 Cambio aplicado

| Archivo | Líneas | Cambio |
| --- | --- | --- |
| `apps/api/src/modules/tasks/tasks.module.ts` | 76-84 | `controllers: [ExecutionOrdersController, ExecutionOrderTemplatesController, TasksController]` + comentario que fija el porqué (DEF-F6-01) y remite a la regresión |

Una línea de comportamiento efectivo (el reorden) y el comentario que impide que un futuro cambio lo revierta sin contexto. No se tocó ningún controlador ni se creó router alternativo.

### 3.3 Auditoría del módulo — sombreado estático vs dinámico

Barrido completo de los tres controladores del módulo y de su registro:

| Superficie | Patrones | Veredicto |
| --- | --- | --- |
| Registro del módulo (3 controladores con `@Get()` de un segmento) | `TasksController` `:id` (1 segmento) vs `tasks/execution-orders` y `tasks/execution-order-templates` | **Defecto real (DEF-F6-01)** — corregido por reorden (3.2) |
| `TasksController` interno | `@Get()` y `@Post()` estáticos declarados **antes** de `:id`, `:id/*` | Sin sombreado |
| `ExecutionOrdersController` interno | `@Get('health/relay')` (2 segmentos, prefijo literal) y `@Post('events/:eventId/redrive')` (3 segmentos) declarados después de `:id`/`:id/*` | Sin sombreado: `:id` (1 segmento) no captura rutas más profundas; los patrones de 2 segmentos exigen literales (`evidences`, `activities`, `item-usage`, `reconciliation`) y el de 3 exige literal intermedio (`activities`). Verificado con requests reales en la regresión (§4) |
| `ExecutionOrderTemplatesController` interno | `@Get()`/`@Post()` primero; `:templateId/versions` (2 segmentos) antes de `versions/:versionId/publish|retire` (3 segmentos) | Sin sombreado (distinto número de segmentos). Su `GET /tasks/execution-order-templates` **sí** estaba colisionado a nivel módulo y queda cubierto por la regresión |

**Resultado de la verificación §13.1 del plan (`@Get('health/relay')` después de `@Get(':id')`):** **no es la misma clase de defecto; no aplica.** `:id` es un patrón de un solo segmento y `health/relay` tiene dos; ningún patrón anterior del controlador matchea (`:id/evidences`, `:id/activities`, `:id/item-usage`, `:id/reconciliation` exigen literales distintos de `relay`). Evidencia ejecutada: el spec de regresión golpea `GET /api/v1/tasks/execution-orders/health/relay` con el orden real del módulo y alcanza el handler (200, servicio invocado). No se movió la ruta: no había defecto que corregir y moverla habría sido churn sin señal. Queda fijada por test para futuros cambios.

**Observación del barrido (no es sombreado, no corregida — fuera de alcance):** el OpenAPI publicado `apps/api/openapi/tasks-execution-orders.v1.json` (v1.1.0) declara `/tasks/execution-order-template-versions/{versionId}/publish|retire`, pero ningún controlador del código vigente registra ese path: el path vivo es `/tasks/execution-order-templates/versions/:versionId/publish|retire` (`execution-order-templates.controller.ts:89-113`). Divergencia preexistente de un artefacto publicado; el fix de esta ola no toca superficie de endpoints. Se registra para que AI-EM-ARCH decida si entra en el expediente de G6/G6.5.

## 4. Regresión añadida (la que habría detectado la colisión)

**Archivo nuevo:** `apps/api/src/modules/tasks/tests/tasks-routing.spec.ts` — 6 casos. Monta los controladores del módulo **en el orden real declarado por `tasks.module.ts`** (se lee del fuente, mismo precedente que `tasks.entity-metadata.spec.ts`, porque importar `TasksModule` arrastra AuthModule→otplib, ESM que Jest no transforma en este repo) y expone la app con `supertest` y prefijo `api/v1`, con guards/servicios sustituidos (`overrideGuard`/`overrideInterceptor` y mocks de servicio).

| Caso | Qué fija |
| --- | --- |
| Orden declarado | `ExecutionOrdersController` y `ExecutionOrderTemplatesController` tienen índice menor que `TasksController`; si el array del módulo se revierte, falla con mensaje directo |
| `GET /tasks/execution-orders` | **200 y el servicio de listado invocado** — el `:id` de `TasksController` no intercepta (el fallo original habría sido 400 de `ParseUUIDPipe`) |
| `GET /tasks/execution-order-templates` | 200 y listado de plantillas invocado (segunda ruta colisionada) |
| `GET /tasks/:id` | Sigue resolviendo el detalle de tarea en `TasksController` (el reorden no rompió la ruta dinámica) |
| `GET /tasks/execution-orders/health/relay` | Alcanza el handler del relay (§13.1 no aplica) |
| `POST /tasks/execution-orders/events/:eventId/redrive` | 202 y handler invocado (tercera ruta con prefijo literal no sombreada) |

Como el harness **deriva el orden del propio fuente del módulo**, revertir `controllers` vuelve a poner el spec en rojo: la regresión no depende de que un humano recuerde actualizar el test.

**No se modificó** `execution-orders.controller.http.spec.ts` (prohibido por la orden; su diff vs `HEAD` es de F1, no de esta sesión). Se conserva intacta su cobertura por controlador; ese banco no ve colisiones **entre** controladores, que es exactamente el hueco que cubre el spec nuevo.

## 5. SEC-D4 — corregido (lookup batch, sin cambio de contrato)

**Decisión: CORREGIDO**, porque se cumplen todas las condiciones del encargo: lookup **en lote por página** (una sola query `IN`), con **servicio existente** del módulo, **sin** query por fila, **sin** joins, **sin** acceso a tablas de otro módulo y **sin** cambio de contrato (`displayLabel` es opcional en `execution-orders-list.ts` v1 y ya estaba declarado en el DTO de OpenAPI).

**Cambio aplicado:** `apps/api/src/modules/tasks/services/execution-orders.service.ts`

| Líneas | Cambio |
| --- | --- |
| 70 | `import { UsersService } from '../../users/users.service';` (servicio ya consumido por `TasksService` dentro del mismo módulo; `TasksModule` ya importa `UsersModule`) |
| 236 | `@Optional() private readonly usersService?: UsersService` (último parámetro; opcional para no romper construcciones directas de specs) |
| 591-595 | `list()` resuelve `assigneeLabels` **una vez por página** y lo pasa a `toListItem` |
| 608-633 | `resolveAssigneeLabels()`: IDs distintos de `assigned_technician_id` de la página → **una** llamada a `UsersService.findDisplayLabelsByIds` (misma vía del `responsibleLabel` de F1; filtra IDs no-UUID legacy). Sin IDs o sin servicio → mapa vacío |
| 2422-2450 | `toListItem(order, assigneeLabels)`: emite `assignee.displayLabel` solo cuando el ID resuelve (2448). Cuadrillas (`CREW`, IDs de WFM) quedan sin etiqueta: no son usuarios del directorio y resolverlas exigiría un servicio de otro módulo, fuera del alcance autorizado |

**Efecto en la bandeja:** `ExecutionOrdersTable.tsx:156` deja de pintar «Sin asignar» para OT asignadas a un técnico resoluble; para OT sin asignar o con cuadrilla el comportamiento no cambia. **No hay cambio de contrato, de DTO ni de OpenAPI** (se emite un campo opcional ya documentado). **SEC-O2** (fallback a email en `responsibleLabel`) no se altera: el mismo comportamiento aplica al nuevo campo vía `findDisplayLabelsByIds` y sigue como observación abierta de SEC-ENG con Producto.

**Tests añadidos** (`apps/api/src/modules/tasks/tests/execution-orders.service-list.spec.ts`, +3 casos, 14/14 en verde):

1. `emite displayLabel del técnico asignado con un solo lookup batch por página (SEC-D4)` — dos filas del mismo técnico generan **una** llamada con IDs distintos; la fila de cuadrilla no consulta ni etiqueta.
2. `omite displayLabel cuando el técnico no es resoluble` — el campo opcional se omite (sin propiedad).
3. `no consulta etiquetas cuando la página no tiene técnicos asignados` — cero consultas innecesarias.

**Ajuste de soporte en un spec existente (no de comportamiento):** `execution-orders.service.spec.ts` amplió su mock parcial de `@iwana/db` con `...jest.requireActual('@iwana/db')` (comentario incluido). Motivo real: la cadena de imports que introduce `UsersService` consume exports de `@iwana/db` (p. ej. `MediaUsage`) que el mock parcial dejaba `undefined` y rompía la carga del spec. Es el patrón que `execution-orders.service-list.spec.ts` ya documenta para el mismo caso. Ningún caso existente cambió de semántica (24/24 suites de `tasks` en verde).

## 6. Evidencia de ejecución — conteos reales (§8.1 del plan)

Plataforma: Windows 11 (win32) · PowerShell 7 · `pnpm` · jest directo (sin turbo) para la API. Árbol: `main`, cambios F0–F6 + esta ola sin commitear.

| Verificación | Comando | Resultado real | Duración | Caché |
| --- | --- | --- | --- | --- |
| Regresión en rojo (pre-fix) | `pnpm --filter @iwana/api exec jest src/modules/tasks/tests/tasks-routing.spec.ts` | **3 failed, 2 passed** (400 vs 200 en las dos rutas estáticas) | 4.9 s | jest directo |
| SEC-D4 en rojo (pre-implementación) | `pnpm --filter @iwana/api exec jest …execution-orders.service-list.spec.ts` | **Falló compilación** (capacidad inexistente) | 3.0 s | jest directo |
| Regresión + SEC-D4 (post-fix) | `pnpm --filter @iwana/api exec jest src/modules/tasks/tests/tasks-routing.spec.ts` | **6/6 passed** | 5.2 s | jest directo |
| Suite `tasks` completa | `pnpm --filter @iwana/api exec jest src/modules/tasks` | **24/24 suites · 538 passed** | 10.7 s | jest directo |
| **API completa** | `pnpm --filter @iwana/api test` | **314 suites passed + 4 skipped (318) · 3936 passed + 15 skipped (3951) · exit 0** | **29.413 s** | jest directo |
| Lint | `pnpm lint --force` | **8/8 successful · 0 errores** (warnings preexistentes; ninguno en archivos de esta ola) · exit 0 | 21.266 s | **`Cached: 0 cached, 8 total`** |
| Typecheck | `pnpm typecheck --force` | **8/8 successful · 0 errores** · exit 0 | 12.497 s | **`Cached: 0 cached, 8 total`** |

**Delta contra la línea base de OLA4 (QA §5):** suites 313 → **314** (+1: `tasks-routing.spec.ts`); casos 3927 → **3936** (+9: 6 del enrutado + 3 de SEC-D4). Los 4 suites y 15 casos skipped son los mismos de la línea base (no introducidos por esta ola).

**No ejecutado (correcto según la orden):** provisioner E2E canónico (`node scripts/e2e-provision-operational.mjs`) — lo re-ejecuta AI-SR-QA; suite de portal y E2E de navegador — sin cambios de frontend. La re-ejecución del bloque 9 (9a–9g) tras este fix es la condición pendiente de D-2/SEC-D2 y queda en manos de QA.

## 7. Restricciones respetadas

- **Contratos congelados intactos:** `packages/shared/src/contracts/operations/execution-orders.ts` y `execution-orders-list.ts` no fueron modificados (el fix usa campos ya opcionales y ya tipados).
- **`execution-orders.controller.http.spec.ts` no modificado** en esta sesión.
- **Superficie:** solo `apps/api/` (módulo tasks + sus specs). No se tocó `packages/database/`, `packages/shared/`, portal, web ni worker.
- **Rama única `main`, sin ramas ni worktrees, sin commit.**
- **Solo `pnpm`.** Sin PII real: fixtures con UUIDs sintéticos y textos de ejemplo.
- **Sin cambios de contrato, sin dependencias nuevas, sin migraciones, sin ADR nuevo.**
- **Audit de logs:** no se añadieron logs; el lookup reutiliza un método existente cuyos logs ya cumplen la política.

## 8. Deuda y observaciones al cierre

| # | Severidad | Detalle | Dueño |
| --- | --- | --- | --- |
| D-2 / SEC-D2 | Media | La corrida real del bloque 9 (9a–9g) queda pendiente de re-ejecución por SR-QA con este fix aplicado; sin ella, CA-01/CA-03 no tienen verificación E2E-API | AI-SR-QA |
| SEC-O2 | Observación | Fallback a email en etiquetas de usuario (`responsibleLabel` y ahora `displayLabel`): sin cambio de severidad, recomendación de minimización no bloqueante | AI-SR-FULL con Producto |
| Observación OpenAPI publicada | Informativa | `apps/api/openapi/tasks-execution-orders.v1.json` declara paths de template-versions que el controlador vigente no registra (§3.3). Preexistente; no bloquea este fix; decidir si entra al expediente G6/G6.5 | AI-EM-ARCH |
| Crew sin etiqueta | Aceptada | `displayLabel` para asignación por cuadrilla no se resuelve (IDs de WFM, cross-module, fuera del alcance autorizado de SEC-D4) | AI-EM-ARCH decide tramo futuro |

**Reescrituras de contrato en esta ola: 0.** **Consultas/desempates emitidos: 0.** **Marcadores nuevos: ninguno** — el `[BLOQUEO]` y la `[CONSULTA]` de AI-SR-QA quedan **atendidos** por este informe (el fix y la regresión existen; la re-ejecución del bloque 9 es de QA). Sin `[BLOQUEO]` ni `[CONSULTA]` propios: nada impidió el fix dentro de la sesión.

## 9. Anexo — comandos reproducibles

```bash
pnpm --filter @iwana/api exec jest src/modules/tasks/tests/tasks-routing.spec.ts
pnpm --filter @iwana/api exec jest src/modules/tasks/tests/execution-orders.service-list.spec.ts
pnpm --filter @iwana/api exec jest src/modules/tasks
pnpm --filter @iwana/api test
pnpm lint --force
pnpm typecheck --force
```

**Stop/go de esta ola:** `GET /tasks/execution-orders` ya no cae en el `:id` (reproducido en rojo → verde en el harness con el orden real del módulo) ✅ · contratos congelados intactos ✅ · informe con conteo real ✅ · sin commit ✅ · provisioner reservado a QA ✅.

*Fin del informe. Emitido por AI-SR-FULL para AI-EM-ARCH (orquestador).*
