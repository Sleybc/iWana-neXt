# INFORME DE CIERRE DE MÓDULO — MOD04 Usuarios Internos

**Versión:** 1.1
**Estado:** Vigente
**Fecha:** 2026-07-22 (rev. 1.1, mismo día)
**Modo activo:** EM + Architect
**Autor:** AI-EM-ARCH
**Etapa:** 7 del workflow ([Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md))
**Commit de cierre:** `df8a2195` · **Rango auditado:** `94a4dde1..df8a2195`

### Historial de revisiones

| Rev. | Veredicto | Motivo |
| --- | --- | --- |
| 1.0 (`b48e3d62`) | **Cierre condicionado** | Cobertura del módulo en 66.2 % / 56.1 %, bajo el gate de ≥80 %. El hueco era el flujo asíncrono de `bulkCreate`. |
| 1.1 (este) | **Cierre sin condiciones** | Olas E y F ejecutadas. Cobertura 94.13 % / 85.81 %. Los cinco defectos que la cobertura destapó, corregidos. |

> El veredicto anterior se conserva en este historial y en el commit `b48e3d62`. Una decisión formal que cambia de sentido debe dejar rastro de por qué, no sustituirse en silencio.

---

## 1. Decisión de cierre

> **CIERRE SIN CONDICIONES.** El módulo es funcionalmente completo, cumple todos los gates de merge de `AGENTS.md` y no tiene deuda crítica ni alta abierta.

La condición que bloqueaba la revisión 1.0 —cobertura bajo el gate en el flujo asíncrono de `bulkCreate`— quedó subsanada por la **Ola E** (cobertura) y la **Ola F** (corrección de los defectos que esa cobertura destapó).

**La condición valió la pena.** Cubrir ese flujo no subió un número: descubrió cinco defectos, uno de ellos de seguridad —el reclamo "one-time" de credenciales no era atómico, y dos peticiones concurrentes revelaban las contraseñas de hasta 100 usuarios—. Declarar el cierre en la revisión 1.0 habría dejado ese fallo en producción, en el código que nadie vuelve a mirar una vez el módulo se da por cerrado.

Queda levantada la Regla de Completitud (ADR-016): el módulo N+1 puede iniciarse.

## 2. Alcance auditado y resultado

36 constataciones sobre `apps/api/src/modules/users`, entidad `User`, migraciones tenant, `apps/portal/dashboard/users` y `apps/web/(protected)/users`.

| Severidad inicial | Cantidad | Estado final |
| --- | --- | --- |
| Crítica | 2 | ✅ Cerradas |
| Alta | 10 | ✅ Cerradas |
| Media | 15 | ✅ 13 cerradas · 2 declaradas |
| Baja | 9 | ✅ 7 cerradas · 2 declaradas |

**Deuda al cierre: 0 críticas · 0 altas · 2 medias · 2 bajas.** Ninguna sin dueño.

### Olas ejecutadas

| Ola | Contenido | Commit |
| --- | --- | --- |
| **A** — Seguridad | H-01 (crítica), H-04 | `49055520` |
| **B1–C** — Bugs, DRY, datos y escala | 24 hallazgos | `c60aa39a` |
| **D** — Cierre estructural del modelo de roles | ADR-061 §4, ADR-063, H-14, regla de roles | `c1f4c0f0` |
| Colaterales | Time bomb de agenda, renumeración `pg_trgm` | `08f83664`, `57aea47e` |

## 3. Evidencia funcional

**Vulnerabilidad crítica encontrada, confirmada explotable y remediada.** H-01 permitía a un `ADMIN` de cualquier tenant escalar a `SYSTEM_ADMIN`, enumerar todos los tenants de la plataforma y obtener credenciales de administrador de **tenants ajenos en texto claro** — en cuatro llamadas HTTP y sin dejar asiento de auditoría. Cerrada en dos capas independientes (frontera de audiencias JWT + coherencia rol↔token) y después estructuralmente en la Ola D, sacando los roles de plataforma del enum de tenant.

**Cuatro defectos latentes descubiertos de paso**, ninguno reportado por usuarios:

1. El provisioning escribía el email cifrado tras retirarse la ruta de lectura: **cada tenant nuevo habría nacido con un criptograma en `users.email`** devuelto en crudo por la API.
2. `IWANA_SUPPORT` **nunca estuvo protegido** en `remove()`, `changeLoginEmailAsAdmin()` ni `resetPassword()` — apareció al consolidar la regla duplicada.
3. Un token de reset sobrevivía a la resurrección de un usuario borrado, y de paso impedía el login del usuario recreado.
4. La migración `pg_trgm` reintroducía un defecto de ordenación ya documentado en el repo: en CI limpio habría corrido antes que la creación del schema.

**Búsqueda de usuarios reconstruida.** Antes: hidratar la tabla completa del tenant en memoria del proceso Node y filtrar con Levenshtein en TypeScript, con el cursor aplicado antes del filtro (paginación incorrecta, no solo lenta). Ahora: SQL con `pg_trgm`, paginación correcta y sin Levenshtein.

**`bulkCreate` pasó de bloquear ~30 s** a job BullMQ con entrega de credenciales por reclamo único, en vez de 100 contraseñas en claro en un body.

## 4. Evidencia de calidad

Gates ejecutados por AI-EM-ARCH, **no leídos de los informes de los productores**:

| Gate | Resultado |
| --- | --- |
| `pnpm test` (API) | ✅ **2162 pasan**, 0 fallan |
| `pnpm test` (resto) | ✅ portal 696 (148/148) · worker 46 · web 76 · shared 4 |
| Invariante de seguridad Ola A | ✅ 134/134, sin derogar aserciones |
| `pnpm lint` / `pnpm typecheck` | ✅ 8/8 cada uno |
| Migraciones `019`, `083`, `084`, `085` | ✅ `up` / `down` / `re-up` sobre `tenant_iwana` real |
| Aborto de `085` ante datos sucios | ✅ Probado con fila real y con fila en soft-delete |
| Scan de residuales cifrados (H-14) | ✅ `schemas_with_residual=0` |
| **Cobertura ≥80 % en core** | ✅ **94.13 % stmts / 85.81 % branches** |

**El invariante de la Ola A es el activo más valioso del cierre.** Los 134 tests leen la metadata real de las rutas vía `Reflector`, así que **una ruta de plataforma nueva entra automáticamente en la regresión**. El modo de fallo por olvido quedó eliminado, no solo la instancia. Sobrevivió intacto a las olas B1, C, D, E y F.

## 5. Olas E y F — el gate de cobertura y lo que destapó

La revisión 1.0 bloqueó el cierre con la cobertura en 66.2 % / 56.1 %. El hueco eran **230 líneas seguidas** de `users.service.ts` correspondientes al flujo asíncrono de `bulkCreate` — el código más nuevo y más sensible del módulo, y el menos cubierto.

**Ola E — cobertura.** 66.2 % → **94.26 %** stmts, 56.1 % → **85.28 %** branches. Cero archivos productivos modificados: solo seis specs. Los tests usan `TenantContext` y `runInTenantSchema` **reales**, con doble solo del `DataSource` — mockear el contexto habría escondido justo lo que había que probar, y la aserción de aislamiento multi-tenant se hace sobre el `SET LOCAL search_path` realmente emitido.

**Cinco defectos destapados, ninguno consagrado en un test.** La instrucción a AI-SR-QA fue explícita: *si un test revela un defecto, repórtalo, no ajustes el test*. Donde el comportamiento era incorrecto, no se escribió aserción que lo bendijera.

| # | Sev. | Defecto |
| --- | --- | --- |
| D-1 | **Alta, seguridad** | El reclamo "one-time" de credenciales **no era atómico**. `claimBulkJobResult` hacía read-modify-write sobre Redis: dos peticiones concurrentes leían ambas `credentialsClaimed: false` y **ambas devolvían las contraseñas en claro de hasta 100 usuarios**. No requería atacante: bastaba un doble clic o dos pestañas. |
| D-2 | Media | El job encolaba con `attempts: 3` pero llamaba a `create()` **sin la `Idempotency-Key` que el propio payload traía**. Un reintento reportaba como duplicadas las filas que el intento anterior sí creó, y sus contraseñas temporales quedaban **irrecuperables** (solo se persiste el hash). |
| D-3 | Media | Un lote que agotó sus reintentos se anunciaba `queued`. Con `jobId` determinista, BullMQ deduplicaba y el cliente polleaba indefinidamente un job en `failed`. |
| D-4 | Baja | El motivo de fila fallida propagaba `error.message` literal al cliente: un schema inválido devolvía por HTTP el nombre del schema y la regla interna de aislamiento. |
| D-5 | Baja | El job no validaba que `schemaName` correspondiera a `tenantId`, siendo el **único camino de escritura del módulo que no pasa por `TenantMiddleware`**. |

**Ola F — corrección.** Los cinco cerrados (`df8a2195`). D-1 pasa a decidirse con `SET NX` sobre clave dedicada; vivir en su propia clave cerró además un **segundo bug latente**: con el flag dentro del store, un reintento del job lo reescribía a `false` y **des-reclamaba credenciales ya entregadas**.

**Verificación por mutación.** No basta con que un test pase; hay que probar que detecta el fallo. Neutralizando el `SET NX`, los tests de concurrencia reportan **4 de 4 y 10 de 10 revelaciones**. Con la corrección, 1 de 4 y 1 de 10.

**Decisión de contrato (D-3):** un lote fallido **no se reencola**; reintentar exige clave nueva. Reenviar con la misma `Idempotency-Key` significa, por definición, *"dame el desenlace de aquella petición"* — y el desenlace fue un fallo. Reencolar convertiría un endpoint idempotente en no idempotente y volvería a recorrer las filas ya creadas.

## 6. Evidencia de despliegue

**No existe entorno productivo ni preproductivo desplegado** (confirmado por el CTO el 2026-07-22). En consecuencia:

- H-01 se trató como hallazgo bloqueante de release, **no como incidente**. No procedió investigación forense ni notificación a la SIC.
- La evidencia del scan H-14 se sostiene por **ausencia de datos, no por validación sobre volumen**: `tenant_iwana` tiene un solo usuario. No prueba que un corpus grande esté limpio.

**Condiciones para el primer despliegue con datos reales:**

1. Re-ejecutar `scripts/db/mod04-ola-c-h14-scan.sql`. `residual > 0` → **BLOCKED**.
2. Los access tokens emitidos antes de `49055520` no validan (sin `iss`/`aud` → 401). Requiere re-login en `web` y `portal`.
3. Verificar en staging que el planificador elige GIN en consultas trigram cortas (§7, punto 3).

## 7. Riesgos post-producción

| # | Riesgo | Severidad | Mitigación |
| --- | --- | --- | --- |
| 1 | Contraseñas del intento previo con TTL vencido: si un reintento del job cae fuera de la ventana de 24 h, la fila vuelve como exitosa **sin** `temporaryPassword` | Media | El operador usa restablecer contraseña para esas filas. No resoluble sin persistir secretos, que no se hará |
| 2 | Cobertura del scan H-14 delgada | Media | Re-ejecutar antes de desplegar; `residual > 0` → BLOCKED |
| 3 | Planificador no elige GIN en trigram cortos (~134 ms) | Baja | Monitorizar `EXPLAIN` en staging |
| 4 | CHECK de `085` enumera `UserRole` en positivo | Baja | Un rol de tenant nuevo exige migración propia o falla con `23514`. Cubierto por test, no por el compilador |
| 5 | Processor de bulk vive en `@iwana/api`, no en el worker | Declarada | Mover cuando el alta se extraiga a dominio compartido |

**Ajenas a MOD04, detectadas durante la auditoría y sin dueño asignado:**

- `isScheduleStartInPast` no tiene tests propios pese a ser una regla de negocio activa.
- **Riesgo sistémico:** el patrón *fecha absoluta en fixture + validación contra `new Date()`* volverá a romper otras suites del portal cuando crucen su umbral. Estas tres llevaban rojo seis días sin que nadie lo notara. Merece un helper compartido de "ahora fijado".
- `tenant_bench_h05`: schema huérfano con 50.000 filas sintéticas en la BD de desarrollo, no registrado en `public.tenants` — por eso el runner no lo alcanza y no tiene el CHECK de `085`.

## 8. Decisiones de arquitectura emitidas

| ADR | Asunto | Estado |
| --- | --- | --- |
| [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) | Frontera de audiencias JWT y procedencia de roles | Aprobado 2026-07-22 · §4 implementado |
| [ADR-062](../adrs/ADR-062-Extension-pg-trgm-Busqueda-Usuarios.md) | Extensión `pg_trgm` para búsqueda | Aprobado |
| [ADR-063](../adrs/ADR-063-Admin-Principal-Explicito-MOD04.md) | Admin principal explícito | Aprobado 2026-07-22 · implementado |

## 9. Lecciones para los módulos siguientes

**La duplicación no es deuda estética; es el mecanismo que produjo los defectos.** Cada regla escrita N veces divergió: `IWANA_SUPPORT` sin proteger en tres métodos, `canDelete` contradiciendo al backend, tres DTOs con validaciones distintas para la misma columna. Consolidar no fue limpieza — fue el acto que sacó los bugs a la luz.

**Un claim que nadie lee no es un control.** El JWT llevaba `type: 'platform' | 'tenant'` correctamente poblado desde el principio. La vulnerabilidad crítica no fue una omisión de diseño, sino un dato correcto que ningún guard consultaba.

**Los gates hay que ejecutarlos, no leerlos.** La suite del portal llevaba tres suites en rojo seis días; los informes de ola la daban por verde. Todos los gates de este informe se ejecutaron, no se leyeron. La cobertura que bloqueó la revisión 1.0 apareció precisamente por eso: nadie la había medido.

**La cobertura no es una métrica, es un método de búsqueda.** Subir de 66 % a 94 % no hizo el módulo "más probado": destapó cinco defectos, uno de seguridad. El valor no estuvo en el número sino en el acto de escribir tests contra código que nadie había ejercitado. Un gate de cobertura que se cumple sin encontrar nada probablemente se cumplió mal.

**Un test que pasa no es un test que sirve.** La verificación por mutación —neutralizar la corrección y comprobar que el test se pone rojo— fue lo que confirmó que la regresión de D-1 tiene dientes. Sin ese paso, un test verde solo demuestra que el código no lanza excepciones.

**No verifiques destructivamente sobre trabajo sin commitear.** Durante la verificación de la Ola F, un `git checkout --` destruyó la implementación aún no commiteada. Se reaplicó guiada por los tests supervivientes, que eran su especificación exacta — pero la lección es de orden, no de comando: commitear primero, verificar después.

---

## 10. Cierre

MOD04 queda **cerrado sin condiciones** por decisión del CTO del 2026-07-22, con todos los gates de merge de `AGENTS.md` cumplidos y verificados.

**Deuda al cierre: 0 críticas · 0 altas · 2 medias · 2 bajas**, ninguna sin dueño. La Regla de Completitud (ADR-016) queda levantada: el módulo N+1 puede iniciarse.

**Pendiente operativo, no bloqueante:** eliminar el schema huérfano `tenant_bench_h05` de la base de desarrollo (§7).
