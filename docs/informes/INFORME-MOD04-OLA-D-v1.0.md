# INFORME MOD04 — Ola D: cierre estructural del modelo de roles

**Versión:** 1.0
**Estado:** Vigente
**Fecha:** 2026-07-22
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH (consolidación) · AI-SR-FULL (implementación) · AI-FE-PLATFORM (scheduling)
**Origen:** decisiones del CTO del 2026-07-22 sobre los 5 puntos abiertos de la auditoría de cierre
**Informe padre:** [INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0](INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0.md)

---

## 1. Alcance

Ola posterior al cierre de las olas A–C. Ejecuta las cuatro decisiones que el CTO firmó y corrige un hallazgo residual detectado en la auditoría de cierre.

| # | Asunto | Decisión CTO | Estado |
| --- | --- | --- | --- |
| 1 | [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) §4 — roles de plataforma fuera de `UserRole` | Firmado | ✅ Implementado |
| 2 | [ADR-063](../adrs/ADR-063-Admin-Principal-Explicito-MOD04.md) — admin principal explícito | Firmado, opción B | ✅ Implementado |
| 3 | H-14 — scan de residuales cifrados | Ejecutar | ✅ Ejecutado, `residual=0` |
| 4 | Regla de borrado ciega a roles de plataforma | Corregir | ✅ Corregido |
| 5 | 3 suites rojas en `scheduling` | Corregir | ✅ Corregido |

## 2. ADR-061 §4 — cierre estructural de H-01

`SYSTEM_ADMIN` e `IWANA_SUPPORT` salen de `UserRole` y quedan exclusivamente en `PlatformRole`. Con esto la contención de la vulnerabilidad crítica H-01 deja de ser perimetral: hasta ahora la allowlist impedía **asignar** esos roles, pero la columna `users.role` seguía admitiéndolos a nivel de tipo.

**Migración `tenant/085_narrow_users_role_to_tenant_domain.ts`.** Verifica y **aborta** (`RAISE EXCEPTION`) ante filas fuera de dominio **antes** de emitir el `ALTER`. La verificación **no filtra por `deleted_at`**: un CHECK aplica a la fila exista o no soft-delete. El runner propaga el fallo y detiene los demás schemas, que es lo que hace efectiva la condición "en todos los schemas" que exigía el ADR.

**Expresión de "ADMIN de tenant o SYSTEM_ADMIN de plataforma":** no hizo falta tocar el decorador ni el guard. `@Roles(...roles: string[])` ya acepta ambos dominios; se pasó a `@Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)` en 23 controladores (~170 referencias). La coherencia rol↔tipo de token la sigue dando `RolesGuard` (Ola A).

**`platform-roles.ts` se conserva.** En runtime el rol es un `string` (`JwtPayload.role`), así que la separación de tipos no es comprobable en el límite: `PLATFORM_ONLY_ROLES` sigue siendo la frontera real. `isTenantAssignableRole` pasa de "no está en la lista negra" a **pertenencia positiva a `UserRole`** — antes devolvía `true` para cualquier literal desconocido.

**Consolidación de la tercera copia de la regla** (exigida por el ADR): `access-control.service.ts:438,687`, `visit-requests.service.ts:964` y el nuevo `assertTargetIsNotPlatformUser` en `users.service.ts:194-213`.

## 3. Divergencia latente descubierta al consolidar

Al unificar la regla apareció un hueco que ninguna de las auditorías previas había visto:

> Las comprobaciones de `remove()`, `changeLoginEmailAsAdmin()` y `resetPassword()` solo contemplaban `SYSTEM_ADMIN`. **`IWANA_SUPPORT` nunca estuvo protegido en ninguna de las tres.**

Es el valor esperado de la consolidación DRY, materializado: cada copia eliminada saca a la luz una divergencia. Corregido en las dos capas dentro del mismo cambio (`users.service.ts:1017,1116,1177` y `portal/components/users/can-delete-user.ts:43,73`), vía un único predicado que cubre **cualquier** rol de plataforma.

Sobre el hallazgo residual original (regla ciega a `SYSTEM_ADMIN`): parte desaparece por construcción con el enum estrechado y el CHECK de `085`, pero no toda — el CHECK es por schema y lo aplica una migración, así que un schema creado fuera del runner no lo tiene, y `remove()` opera sobre el literal leído de la base, no sobre el tipo.

## 4. ADR-063 — admin principal explícito

`public.tenants.principal_admin_user_id` (migración `public/019`), con backfill usando la regla anterior exacta para no alterar quién es principal en ningún tenant existente.

Decisiones que preservan el invariante del ADR:

- **`remove()` sobre el principal lanza 409 y no reasigna nada**, sea quien sea el actor. Reasignar "amablemente" habría reintroducido el cambio silencioso por otra puerta — que es justo el modo de fallo que motivó el ADR.
- Transferencia explícita y auditada vía `PUT /users/:id/principal-admin`, validando que el sucesor existe, está activo, no está soft-deleted y es `ADMIN`.
- El provisioning (`worker/tenant-seed.service.ts`) designa al primer ADMIN. Sin esto, la columna nacería `NULL` en todo tenant posterior al backfill.
- Boundary respetado: `UsersService` no toca `public.tenants`; pasa por `TenantService`.

## 5. H-14 — evidencia y hallazgo colateral

**Scan ejecutado por AI-EM-ARCH** (`scripts/db/mod04-ola-c-h14-scan.sql` contra `dbiw`): `schemas_scanned=2, schemas_with_residual=0`.

**Declaración honesta de la evidencia:** la retirada de la ruta legacy se sostiene por **ausencia de datos, no por validación sobre volumen**. `tenant_iwana` tenía **un solo usuario** y el otro schema era sintético. No prueba que un corpus grande esté limpio; prueba que casi no hay corpus. Aceptable únicamente porque no existe entorno productivo. **Si aparece un entorno con datos reales, el scan se re-ejecuta antes de desplegar; `residual > 0` → BLOCKED.**

**Hallazgo colateral corregido.** La ruta de lectura legacy ya se había retirado en `c60aa39a`, pero `worker/tenant-seed.service.ts:80` seguía escribiendo `email: this.encryptValue(adminEmail)`. Con la lectura retirada, **cada tenant provisionado nacía con un criptograma en `users.email` que la API devolvía en crudo**. Defecto preexistente, latente, que habría roto el primer login de todo tenant nuevo. Corregido a texto plano.

## 6. Scheduling — time bomb, no regresión

Tres suites en rojo (`ScheduleEventForm`, `RescheduleEventDialog`, `VisitRequestRecommendationPanel`). Se descartó que fueran regresión de MOD04 con tres pruebas: revertir la consolidación que tocaba `scheduling-ui.ts`, forzar `TZ=UTC`, y retroceder a `94a4dde1` — recuento idéntico en los tres casos.

**Causa raíz:** los fixtures agendan para `2026-07-15` y el guard `isScheduleStartInPast` compara contra `new Date()`. Guard y fixtures entraron en el **mismo commit el 2026-06-30**, cuando esa fecha era futuro. **Empezaron a fallar solos el 2026-07-16**, sin que nadie tocara nada.

Corregido fijando el reloj con el patrón que ya existía en tres specs del repo. **30 inserciones, 0 eliminaciones**: ninguna aserción tocada, cero código productivo. La regla de negocio "no agendar en el pasado" sigue viva.

## 7. Correcciones adicionales

**Bug de ordenación en migraciones public.** `EnablePgTrgm` nació con sufijo `0180000000000`, **inferior a toda la cadena** (`1741766400000`..`1784419206000`). TypeORM ordena por el timestamp del nombre de clase, así que en CI limpio o bootstrap nuevo habría corrido antes que `CreatePublicSchema`. Es la reintroducción del defecto ya documentado en `013_add_tenant_admin_email.ts`. Renumerada a `1784419207000` siguiendo el mismo precedente; la condición necesaria (idempotencia, `CREATE EXTENSION IF NOT EXISTS`) se cumple. Verificado reejecutando la cadena real.

**Consecuencias de ADR-061 actualizadas:** la sección afirmaba que la deuda del §4 permanecía abierta. Ya no. En su lugar queda declarado el coste real: el CHECK de `085` enumera `UserRole` en positivo, así que un rol de tenant nuevo exige su propia migración o las escrituras fallan con `23514`.

## 8. Verificación de gates (ejecutada por AI-EM-ARCH, no reportada por el productor)

| Gate | Resultado |
| --- | --- |
| `pnpm test` | ✅ 8/8 — API 2050, portal **696 (148/148)**, worker 46, web 76, shared 4 |
| Invariante Ola A (134 tests) | ✅ 134/134, sin derogar aserciones |
| `pnpm lint` / `pnpm typecheck` | ✅ 8/8 cada uno |
| Migraciones `085` / `019` | ✅ `up`, `down` y `re-up` sobre `tenant_iwana` real |
| Aborto de `085` con datos sucios | ✅ Probado con fila real y con fila en soft-delete |

El portal pasó de 145/3 a 148/148.

## 9. Deuda al cierre

| Severidad | Cantidad |
| --- | --- |
| Crítica | 0 |
| Alta | 0 |
| Media | 2 |
| Baja | 2 |

**Abiertas:**

1. **Cobertura del scan H-14** — declarada arriba. Re-ejecutar ante cualquier entorno con datos reales.
2. **Acoplamiento del CHECK `085`** — el dominio de roles vive en la base; un rol nuevo exige migración. Cubierto por test, no por el compilador.
3. **`isScheduleStartInPast` sin tests** — una regla de negocio que tumbó tres suites por efecto colateral no está cubierta en positivo (ajena a MOD04).
4. **Fixtures con fecha absoluta** — riesgo sistémico en el portal: el patrón "fecha hardcodeada + validación contra `new Date()`" volverá a explotar en otras suites cuando crucen el umbral. Merece un helper compartido de "ahora fijado" (ajeno a MOD04).

**Pendiente operativo:** `tenant_bench_h05` — **resuelto 2026-07-22** (`DROP SCHEMA … CASCADE`). El script de bench ahora elimina el schema al terminar (salvo `KEEP_BENCH_SCHEMA=1`).

## 10. Trazabilidad

- [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) — Aprobado 2026-07-22, §4 implementado
- [ADR-063](../adrs/ADR-063-Admin-Principal-Explicito-MOD04.md) — Aprobado 2026-07-22, opción B implementada
- [ADR-062](../adrs/ADR-062-Extension-pg-trgm-Busqueda-Usuarios.md) — extensión `pg_trgm`
- [INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0](INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0.md) — auditoría origen
