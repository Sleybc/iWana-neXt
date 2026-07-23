# INFORME-USUARIOS-AUDITORIA-BACKEND-v1.0

**Módulo:** Usuarios (`/dashboard/users` · `apps/api/src/modules/users`)
**Fase:** Auditoría de backend, base de datos y migraciones (turno 1 del módulo) · **v1.1 incluye re-auditoría post-remediación (§9)**
**Modo de operación:** AI-EM-ARCH — Architect + Orchestrator
**Fecha:** 2026-07-23
**Autoría:** AI-EM-ARCH (consolidación y verificación de gate) sobre protocolo multiagente
**Protocolo:** [Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md) — etapa de review (§3, G6) ejecutada como auditoría de solo lectura

---

## 0. Encuadre

Auditoría de solo lectura del módulo Usuarios en su superficie **backend / datos / migraciones**. No se tocó código. No se adelantan otros módulos (regla de completitud ADR-016 y secuencia módulo-por-módulo del usuario); la deuda que cruce a otro módulo se anota diferida, no se audita.

**Despliegue multiagente (3 auditores de solo lectura, alcance disjunto):**

| Agente | Rol RACI | Alcance |
| --- | --- | --- |
| AI-SR-FULL | Backend / arquitectura | Boundaries Modulith, multi-tenancy operativa, contrato API/OpenAPI, `@Roles`, idempotencia, bulk processor, tests |
| AI-DATA-ENG | Datos / migraciones | Alineación entidad↔DDL, reversibilidad, índices trgm, narrowing de rol (085), redacción PII, unicidad soft-delete |
| AI-SEC-ENG | Seguridad / PII | Tenant isolation/IDOR, RBAC + admin principal, credenciales/tokens, auditoría inmutable, Ley 1581 |

**Verificación de gate (§7.4 anti-alucinación):** AI-EM-ARCH leyó de forma independiente `users.service.ts` (1.666 líneas), `users.controller.ts`, `user.entity.ts`, `users.module.ts`, `000_initial_tenant_schema.ts` (users), `083_align_users_entity_ddl.ts`, `toDto`/`mapUserRow` y el `UserResponseDto`, y **abrió y comprobó** cada cita de mayor consecuencia antes de firmarla. Todas resistieron apertura. Ninguna alucinación detectada.

---

## 1. Veredicto

**Postura general: sólida y madura.** Multi-tenancy correcta (tenant siempre desde JWT verificado, `SET LOCAL search_path` por transacción con `schemaName` validado por regex antes de interpolar, worker con tenant explícito y re-validación fail-closed), boundaries del Modulith respetados, frontera de roles de plataforma con defensa en profundidad (enum + DTO + Zod + CHECK migración 085), idempotencia bulk resuelta con reclamo one-time atómico (`SET NX`), y migraciones idempotentes con verificación-antes-de-mutar.

**No hay hallazgos críticos.** El merge-gate "sin vulnerabilidades críticas" se cumple. **Sí existe un hallazgo Alto** por encadenamiento (E-01, toma de control de admin par) y tres Medios que tocan merge-gates. Por tanto el módulo **no puede declararse "cerrado sin deuda"** hasta remediar E-01–E-04.

**Decisión del turno:** ver §5.

---

## 2. Hallazgos consolidados

Severidad = criterio EM-ARCH (puede elevar/consolidar los de los agentes). "Origen" enlaza al hallazgo del agente.

| ID | Sev. | Área | Archivo:línea (verificado) | Descripción | Dueño | Origen |
| --- | --- | --- | --- | --- | --- | --- |
| **E-01** | **Alto** (cadena) | Seguridad / RBAC | `users.service.ts:1233-1301` (resetPassword), `:1029-1126` (changeLoginEmailAsAdmin), `:851-940` (update status/role) | **Asimetría de autorización peer-admin.** La protección "un ADMIN no neutraliza a otro ADMIN / al principal" (RF-RBAC-04 + ADR-063) solo se aplica en `remove()`. `resetPassword` **devuelve la contraseña temporal del target** al actor; `changeLoginEmailAsAdmin` cambia su email de acceso; `update` lo pasa a `SUSPENDED`. Ninguno valida peer-admin ni admin principal (solo `assertTargetIsNotPlatformUser`). **Cadena SEC-01+SEC-02 = toma de control total del admin principal por un ADMIN par + bloqueo del titular, con repudio** (el audit registra a la víctima como actor). | sr-backend | SEC-01/02/03 |
| **E-02** | Medio | Auditoría / cumplimiento | `users.service.ts:529,914,1171,1274` (fire-and-forget) vs `:1001,1101` (await) | **Durabilidad de auditoría CUD inconsistente.** Todos los endpoints CUD llevan `@SkipAudit()` (controller 145,189,238,281,322,340,394), luego el `AuditInterceptor` global está desactivado y la auditoría manual es la **única**. `create/update/remove/resetPassword` la emiten con `fireAndForget` (best-effort, el fallo solo se loguea) → hueco de auditoría sin fallar la petición. Toca el merge-gate "audit log en CUD" y la trazabilidad Ley 1581. | sr-backend | U-02 |
| **E-03** | Medio | Contrato API | `users.controller.ts:106,152,219…`; `users-bulk.controller.ts:62-110` | **Cobertura OpenAPI solo descriptiva.** `UserResponseDto` nunca se referencia como `type:` en ningún `@ApiResponse`; los endpoints bulk (Zod, sin clase) no exponen `@ApiBody`. El contrato queda documentado en texto pero sin schema navegable → merge-gate "OpenAPI updated" no se cumple con schema. | sr-backend | U-03 |
| **E-04** | Medio | Datos / drift | `user.entity.ts:55,58,65-66` vs `000_initial_tenant_schema.ts:65-67` | **Drift entidad↔DDL de tipo.** La entidad declara `role`/`status` como `enum` nativo y `tenantId` sin `type:'uuid'`; el DDL los persiste como `VARCHAR + CHECK` y `UUID`. La migración 083 ("align_users_entity_ddl") cierra el drift de **longitudes**, no el de **tipos**. Sin impacto en runtime (no hay `synchronize` ni `migration:generate`), pero desalinea el modelo y confunde tooling futuro. | data-eng / sr-backend | H-01/H-02 |
| ~~E-05~~ | **Resuelto (CTO)** | Cumplimiento / PII | `users.service.ts:1437` (toDto) vía `findAll`; `dto/user.dto.ts:309`; `user.entity.ts:161-168` | **`documentNumber` (cédula) expuesto en lote y en claro** en el listado a todo ADMIN con `USERS_READ`. **Decisión CTO 2026-07-23: la exposición de la cédula es necesaria para la operación del sistema → riesgo aceptado (Opción 3).** Ver §4. | — (cerrado) | SEC-05 |
| **E-06** | Bajo | Seguridad / PII | `users.service.ts:1326-1343` (`search: dto.email` → `route`) | **Email en query-string de una `route` indexada** en la búsqueda global cross-tenant (visible a SYSTEM_ADMIN/support). Contradice "nunca PII en URL/query params". | sr-backend / search | SEC-04 |
| **E-07** | Bajo | Robustez de bordes | `users.controller.ts:111` (cursor); `bulk-create-users.dto.ts:9,30` (Zod sin `.strict()`); `users.controller.ts:149` (Idempotency-Key len); `users.service.ts:454-464,866-876,1248-1258` (idempotencia no atómica) | Cuatro bordes menores: (a) `cursor` sin `ParseUUIDPipe` → cursor malformado da **500** en vez de 400; (b) esquemas Zod del bulk sin `.strict()` descartan props desconocidas en silencio (asimetría con el `forbidNonWhitelisted` del CRUD); (c) "max 128 chars" del `Idempotency-Key` documentado pero no validado; (d) idempotencia del CRUD síncrono read-then-write sin lock (riesgo real bajo por el unique de email). | sr-backend | U-04/05/06/07 |
| **E-08** | Bajo | Auditoría forense | `users.controller.ts:164,359` (`x-forwarded-for`) | **IP de auditoría desde header crudo** controlable por el cliente. Mitigado si nginx sobrescribe el header. | plat-ops | SEC-07 |
| **E-09** | Bajo | Limpieza de datos | `user.entity.ts:32,47` + `000:90,93` (índice `email_hash` duplicado); `083:118 vs 128` (unique `email` case-sensitive vs pre-check `lower(email)`); `083:135 + 084:17` (btree + GIN sobre nombres) | Índices redundantes y unicidad case-sensitive de `email` (redundante con `uq_users_email_hash`, que ya es case-insensitive por el hash). Coste de escritura innecesario; sin impacto funcional. | data-eng | H-04/05/06 |

### Info / riesgo aceptado (no accionable ahora)
- **SEC-06** — contraseñas temporales del bulk en claro en Redis 24 h: **diseño necesario** para el reveal one-time, acotado por TTL e infra interna. Riesgo residual documentado.
- **U-01** — el `@Processor` del bulk vive en `apps/api`, no en `apps/worker` (regla `nestjs-expert`): **deuda auto-declarada** en el propio código, en turno y con dueño. No bloqueante.

---

## 3. Reclasificaciones del gate (EM-ARCH corrige a los agentes)

1. **H-03 de DATA-ENG (unicidad total de `email`/`email_hash` bloquea reutilización tras soft-delete) → NO es defecto.** Es un **invariante deliberado**: el `create()` del servicio (líneas 504-521) depende de esa constraint total — cuando el email pertenece a un registro soft-deleted **restaura y reinicializa** el registro (resurrection, unificado en `buildInitialUserState`) en vez de insertar. La constraint total es *requisito* de ese diseño. Se conserva como invariante documentado, no como hallazgo.
2. **Sospecha preliminar EM-ARCH sobre `SELECT *` en el search-branch de `findAll` → descartada.** El `SELECT *` reconstruye el `User` completo (incluye `passwordHash`, `mfaSecret`, tokens) vía `mapUserRow`, **pero `toDto` es un allowlist** (users.service.ts:1418-1438) que no expone ninguno de esos secretos. No hay fuga.

---

## 4. Escalación al CTO

**[ESCALACIÓN AL CTO] — E-05 (minimización de PII en listados) — RESUELTA 2026-07-23**
- **Prioridad:** Media (cumplimiento, no seguridad rota).
- **Contexto:** `findAll` devuelve `documentNumber` (cédula) en claro y en lote a todo usuario con rol ADMIN + `USERS_READ`. Decisión de **aceptación de riesgo de minimización de datos** bajo Ley 1581 / Habeas Data.
- **Opciones evaluadas:**
  1. Exponer `documentNumber` solo en el detalle (`findOne`), no en el listado.
  2. Enmascarar en el listado (`••••1234`), completo solo en detalle.
  3. Aceptar el riesgo y documentarlo como decisión de negocio.
- **DECISIÓN DEL CTO (2026-07-23):** **Opción 3 — la exposición de la cédula es necesaria para la operación del sistema.** Riesgo aceptado; el dato permanece expuesto en `findAll`, protegido por `USERS_READ` (solo ADMIN del tenant). No se remedia.
- **Residual recomendado (no bloqueante):** documentar la *finalidad operativa* del tratamiento (base legítima Ley 1581) en el registro de tratamiento de datos, y no propagar la cédula fuera de la superficie ADMIN del tenant (coherente con E-06, que sí sale a la búsqueda global). La obligación regulatoria concreta **requiere verificación con fuente oficial** si se necesita una postura formal; la decisión de negocio ya está tomada.

Ninguna otra escalación: no hay vulnerabilidad crítica ni excepción de seguridad que aprobar.

---

## 5. Decisión de turno (go/no-go)

**Turno de auditoría backend/datos/migraciones: CERRADO.** Cumplió su objetivo (mapa completo, hallazgos verificados, sin críticos).

**Cierre del módulo Usuarios: NO-GO todavía.** Condiciones de cierre (deuda que debe pagarse antes de declarar "cerrado sin deuda"):

- **Bloqueante de cierre:** E-01 (cadena de toma de control peer-admin).
- **Requisito de merge-gate:** E-02 (audit CUD durable) y E-03 (OpenAPI con schema).
- **Recomendado antes de cierre:** E-04 (drift de tipo). ~~E-05~~ **resuelto** (CTO 2026-07-23: exposición de cédula necesaria para la operación → riesgo aceptado).
- **Diferible a limpieza:** E-06, E-07, E-08, E-09.

**Autoridad de la remediación E-01:** cerrar E-01 **enforce política ya aprobada** (RF-RBAC-04 + ADR-063 establecen que un ADMIN par no debe poder neutralizar a otro ADMIN / al principal; reset-de-clave, cambio-de-email y suspensión defraudan esa misma intención). Por tanto **no requiere ADR nuevo ni CTO** — es competencia de EM-ARCH. El fix es acotado: replicar la barrera de `remove()` (`target.role === ADMIN && actor !== SYSTEM_ADMIN` → Forbidden, y protección de admin principal) en `resetPassword`, `changeLoginEmailAsAdmin` y el cambio de `status`/`role` de `update`.

---

## 6. Prompts de ejecución (delegación — sin prompt no hay implementación, G4)

> Los ejecuta el usuario (rol CTO/orquestador) lanzando a los agentes entre turnos. Este informe es el handoff.

**[PROMPT DE EJECUCIÓN → AI-SR-FULL] — Prioridad 1: cerrar E-01**
- Alcance exacto: añadir barrera peer-admin/principal en `resetPassword`, `changeLoginEmailAsAdmin` y `update` (cambios de `status`/`role`) de `users.service.ts`, reutilizando el patrón de `remove()` (líneas 1140-1186) y la designación de admin principal (`isPrincipalAdminUser`).
- Regla: si `target.role === UserRole.ADMIN` y `actorRole !== PlatformRole.SYSTEM_ADMIN` → `ForbiddenException`; si el target es el admin principal → `ConflictException` con mensaje de transferencia previa (coherente con ADR-063). No aplicar a targets no-ADMIN (el flujo actual sobre no-admins es correcto).
- Entregables: código + tests que fijen el invariante (ADMIN no resetea/cambia-email/suspende a ADMIN par ni al principal; SYSTEM_ADMIN sí) + reporte de fase.
- Stop/go: no tocar otros módulos; no cambiar el contrato de respuesta salvo el nuevo 403/409.

**[PROMPT DE EJECUCIÓN → AI-SR-FULL] — Prioridad 2: E-02 + E-03**
- E-02: unificar durabilidad de auditoría CUD — emitir `auditService.log` **dentro** de la transacción `runInTenantSchema` (o `await` fuera del `fireAndForget`) en `create/update/remove/resetPassword`, igualando a `changeLoginEmail*`. Si se conserva best-effort por diseño, documentarlo explícitamente y hacerlo consistente.
- E-03: `type: UserResponseDto` (o `@ApiOkResponse`) en las respuestas; `@ApiBody` + `@ApiExtraModels`/clases o `zodToOpenAPI` para el contrato bulk. Objetivo: merge-gate "OpenAPI updated" con schema navegable.

**[PROMPT DE EJECUCIÓN → AI-SR-FULL / AI-DATA-ENG] — Prioridad 3: E-04 + E-06 + E-07 + E-09**
- E-04: alinear el `@Column` de `role`/`status`/`tenantId` de la entidad con el pgtype real (`varchar` + enum lógico / `type:'uuid'`), documentando que el modelo persiste `VARCHAR + CHECK`.
- E-06: indexar por `id`, no por email, en el `route` de `listForSearchIndex`.
- E-07: `ParseUUIDPipe` en `cursor`; `.strict()` en los esquemas Zod del bulk; validar longitud del `Idempotency-Key`.
- E-09: retirar índice `email_hash` redundante y evaluar los btree de nombre frente a los GIN trgm.

**[PROMPT DE EJECUCIÓN → AI-PLAT-OPS] — E-08**
- Derivar la IP de auditoría del proxy confiable (`trust proxy`/socket), no del header `x-forwarded-for` crudo.

---

## 7. Deuda diferida fuera de turno

Ninguna atribuible a otro módulo. El único punto de contacto con otra frontera (U-01, el processor pertenece conceptualmente a `@iwana/worker`) está declarado y reside dentro del módulo Usuarios → se trata en turno como E-info, no como deuda ajena. **Inventario y demás módulos: sin abrir** (fuera de turno).

## 8. Contabilidad de deuda por severidad (para el informe de sprint)

| Severidad | Abiertos | IDs |
| --- | --- | --- |
| Crítico | 0 | — |
| Alto | 1 | E-01 |
| Medio | 3 | E-02, E-03, E-04 |
| Bajo | 4 | E-06, E-07, E-08, E-09 |
| Info / aceptado | 3 | SEC-06, U-01, **E-05 (riesgo aceptado por CTO 2026-07-23)** |

E-05 cerrado por decisión de negocio: la exposición de la cédula es necesaria para la operación del sistema.

---

## 9. Re-auditoría post-remediación (2026-07-23)

Los ejecutores aplicaron correcciones (árbol de trabajo, sin commitear). AI-EM-ARCH **re-verificó cada finding contra el diff real y el repo**, no contra el reporte de los ejecutores. Resultado por finding:

| ID | Estado | Verificación |
| --- | --- | --- |
| **E-01** | ✅ **Resuelto** (con residual R-01) | Barrera peer-admin añadida en `update()` (users.service.ts ~888), `changeLoginEmailAsAdmin` (~1070) y `resetPassword` (~1283), replicando `remove()`. SYSTEM_ADMIN exento para ADMIN no-principal; **principal congelado incluso para SYSTEM_ADMIN** (decisión deliberada, cubierta por test nuevo "rechaza cambio de email del administrador principal incluso como SYSTEM_ADMIN"). Vulnerabilidad de toma de control **cerrada**. |
| **E-02** | ✅ **Resuelto** (residual bajo) | `create`/`update`/`remove`/`resetPassword` pasaron de `fireAndForget` a `await` dentro de `runInTenantSchema` → si la auditoría falla, la operación **hace rollback** (fail-closed, cumple el gate "audit log en CUD"). Residual: `updateMe()` (perfil propio, `@SkipAudit`) sigue `fireAndForget` — bajo impacto. |
| **E-03** | ✅ **Resuelto** (residual bajo) | `type: UserResponseDto` en las respuestas 200; `@ApiBody` con schema en el bulk. Residual: el envelope `{ data: … }` y la forma paginada de `findAll` no se modelan (el `type` es aproximado) — mejora documental válida, no bloqueante. |
| **E-04** | ✅ **Resuelto (3ª pasada)** | `tenantId` → `type:'uuid'` ✅. `role` → `varchar(20)` y `status` → `varchar(30)`, que **casan con el DDL real** (000; verificado por grep: ninguna migración las ensancha). El comentario falso fue corregido — ahora dice veraz "columna real VARCHAR(20)/(30); la 085 añade el CHECK, no ensancha". Sin drift, sin cita falsa. |
| **E-06** | ✅ **Resuelto** | `route` de `listForSearchIndex` usa `search: dto.id`, no el email → PII fuera de la ruta indexada. Nota: `search=<uuid>` no casa con la búsqueda trgm (email/nombre); verificar con la superficie de búsqueda que `openUser=id` sigue siendo el mecanismo de apertura (info, no bloqueante). |
| **E-07** | ✅ **Mayormente resuelto** | `cursor` con `ParseUUIDPipe({optional})` ✅; Zod `.strict()` en ambos schemas del bulk ✅; validación `Idempotency-Key ≤ 128` en los endpoints síncronos ✅. Residual: el endpoint bulk no valida los 128 chars; idempotencia read-then-write (E-07d) sigue no atómica (era bajo aceptado). |
| **E-08** | ✅ **Resuelto** | `app.set('trust proxy', true)` (main.ts), IP desde `req.ip ?? req.socket.remoteAddress` (no header crudo), y nginx dev+prod reescriben `X-Forwarded-For $remote_addr` (sobrescriben, no anexan) → un XFF inyectado por el cliente se descarta. Fix sólido. |
| **E-09** | ◑ **Parcial** | Se retiró el `@Index('idx_users_email_hash')` de la entidad (redundante con el unique). Pero el índice físico `idx_users_email_hash` creado por la migración 000 **sigue en la BD**; reclamar el coste de escritura exige una migración `DROP INDEX`. Unicidad case-sensitive de email (H-04) sin cambios (bajo/diferido). |

### Residual nuevo introducido por la remediación

| ID | Sev. | Archivo | Descripción | Recomendación |
| --- | --- | --- | --- | --- |
| ~~R-01~~ | ✅ Resuelto (3ª pasada) | `users.service.ts` `update()` | Exención self añadida: `user.id !== actorUserId && user.role === ADMIN && actorRole !== SYSTEM_ADMIN`. Un ADMIN vuelve a poder editar su propia fila. **Corner intencional restante:** la exención self no cubre el freeze del principal (`isPrincipalAdminUser`), por lo que el admin **principal** aún no auto-edita status/role/`isOperationalResource`/`mfaRequired` vía `update()` — consistente con la decisión deliberada de congelar al principal hasta transferir designación (misma política testeada para email). No es defecto; si se desea, eximir self también en ese bloque. |

### Veredicto de la re-auditoría (tras 3ª pasada, 2026-07-23)

- **Todos los hallazgos accionables del turno backend: cerrados.** E-01 (Alto), E-02, E-03, **E-04** y **R-01** resueltos y verificados contra el repo. La vulnerabilidad de seguridad Alta está cerrada.
- **Residuales bajos diferibles (deuda registrada, no bloqueante):** E-02 `updateMe` fire-and-forget; E-03 envelope no modelado; E-07 (bulk sin límite 128; idempotencia síncrona no atómica); E-09 (falta migración `DROP INDEX idx_users_email_hash`); H-04 (unicidad email case-sensitive); corner del freeze del principal en auto-edición.
- **E-05:** cerrado por decisión CTO (riesgo aceptado).

**Estado del turno backend/datos/migraciones: LISTO PARA CIERRE (GO).** 0 críticos, 0 altos, 0 medios abiertos; solo bajos diferibles con dueño. **El módulo Usuarios NO queda cerrado todavía** por completitud (ADR-016): falta su turno de frontend/UX (`/dashboard/users`), que el usuario conduce por separado.

**Verificación final sugerida antes de commit:** `pnpm --filter @iwana/api test` (suite del módulo) + `pnpm typecheck` (el cambio enum→varchar de la entidad es de metadatos TypeORM; conviene confirmar verde).

---

*Fin del informe (v1.1). Consolidado y verificado por AI-EM-ARCH. Cada finding y sus tres pasadas de re-verificación se comprobaron contra el diff y el repo antes de firmar; ninguna afirmación proviene del reporte de los ejecutores.*
