# INFORME DE CIERRE DE MÓDULO — MOD04 Usuarios Internos

**Versión:** 1.0
**Estado:** Vigente
**Fecha:** 2026-07-22
**Modo activo:** EM + Architect
**Autor:** AI-EM-ARCH
**Etapa:** 7 del workflow ([Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md))
**Commit de cierre:** `c1f4c0f0` · **Rango auditado:** `94a4dde1..c1f4c0f0`

---

## 1. Decisión de cierre

> **CIERRE CONDICIONADO.** El módulo es funcionalmente completo y no tiene deuda crítica ni alta abierta. **Un gate de merge no se cumple**: la cobertura del módulo es **66.2 %** de sentencias y **56.1 %** de ramas, frente al ≥80 % que `AGENTS.md` exige en módulos core.
>
> No apruebo excepción a ese gate — mantener los quality gates y bloquear lo que no los cumple es responsabilidad de este rol (§3.3 del perfil). El módulo **no debe declararse cerrado sin condiciones** hasta subsanar el punto §5.

Esta decisión no bloquea el trabajo hecho, que está mergeado y verificado. Bloquea la **declaración formal de cierre** y, con ella, el inicio del módulo N+1 bajo la Regla de Completitud (ADR-016), salvo que el CTO decida lo contrario con la información de §5 a la vista.

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
| `pnpm test` | ✅ 8/8 — API 2050 · portal 696 (148/148) · worker 46 · web 76 · shared 4 |
| Invariante de seguridad Ola A | ✅ 134/134, sin derogar aserciones |
| `pnpm lint` / `pnpm typecheck` | ✅ 8/8 cada uno |
| Migraciones `019`, `083`, `084`, `085` | ✅ `up` / `down` / `re-up` sobre `tenant_iwana` real |
| Aborto de `085` ante datos sucios | ✅ Probado con fila real y con fila en soft-delete |
| Scan de residuales cifrados (H-14) | ✅ `schemas_with_residual=0` |
| **Cobertura ≥80 % en core** | ❌ **66.2 % stmts / 56.1 % branches** |

**El invariante de la Ola A es el activo más valioso del cierre.** Los 134 tests leen la metadata real de las rutas vía `Reflector`, así que **una ruta de plataforma nueva entra automáticamente en la regresión**. El modo de fallo por olvido quedó eliminado, no solo la instancia. Sobrevivió intacto a las olas B1, C y D.

## 5. Gate incumplido — cobertura

`users.service.ts`: **67.24 %** stmts / **55.64 %** branches. El hueco no está repartido: son **230 líneas seguidas (575-806)** que corresponden a `bulkCreate`, `getBulkJobStatus`, `claimBulkJobResult` y `executeBulkCreateJob`.

Es decir: **el código más nuevo y más sensible del módulo es el menos cubierto.** `claimBulkJobResult` es el endpoint que entrega credenciales temporales de hasta 100 usuarios; hoy no tiene prueba de que el reclamo sea efectivamente único, ni de qué ocurre en un segundo intento.

Contraste: `users.controller.ts` está al 92.3 % y `user.dto.ts` al 100 %. El problema es acotado y nombrado, no difuso.

**Remediación exigida antes de declarar el cierre sin condiciones:** cobertura del flujo asíncrono de `bulkCreate`, con foco en la unicidad del reclamo de credenciales, el contexto de tenant en el job (recordar que `AsyncLocalStorage` no propaga a BullMQ) y el fallo parcial del lote.

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
| 1 | Flujo asíncrono de `bulkCreate` sin cobertura | Media | §5 — bloquea el cierre incondicional |
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

**Los gates hay que ejecutarlos, no leerlos.** La suite del portal llevaba tres suites en rojo seis días; los informes de ola la daban por verde. Todos los gates de este informe los ejecuté yo. La cobertura de §5 apareció precisamente por eso: nadie la había medido.

---

## 10. Recomendación al CTO

Cerrar MOD04 **condicionado** a la remediación de §5, con una ola E acotada — es un encargo de un solo agente sobre una superficie nombrada, no un frente abierto.

Si prefieres iniciar el módulo siguiente en paralelo, es una excepción a la Regla de Completitud (ADR-016) que **corresponde decidir a ti, no a mí**. Mi recomendación es cerrarlo antes: el flujo sin cubrir entrega credenciales, y es el tipo de código que nadie vuelve a mirar una vez el módulo se declara cerrado.
