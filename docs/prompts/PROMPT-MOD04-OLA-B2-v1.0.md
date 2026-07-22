# PROMPT DE EJECUCIÓN — MOD04 Ola B2: consolidación DRY

**Versión:** 1.0
**Fase:** Ola B2 (posterior a B1)
**Emitido por:** AI-EM-ARCH · 2026-07-22
**Agentes destinatarios:** AI-FE-PLATFORM (líder) + AI-SR-FULL (backend), consulta a AI-DS-OWNER
**Informe origen:** [INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0](../informes/INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0.md)
**Prioridad:** media — deuda estructural, sin defecto observable

---

## Objetivo

Eliminar duplicación que **ya causó divergencias reales**. No es limpieza cosmética: cada duplicado de esta lista tiene copias que dejaron de coincidir entre sí, y esa es exactamente la mecánica que produjo el bug FE-03 y el defecto H-04 de la Ola A.

**Regla dura de esta ola: cambio de comportamiento cero.** Si un refactor altera lo que el usuario ve o lo que la API responde, se ha ido de alcance. La única excepción es corregir una divergencia donde una de las copias era objetivamente incorrecta, y en ese caso debe declararse en el informe.

## Precondición

**La Ola B1 debe estar cerrada y mergeada.** B1 toca `UsersClient`, `UsersTable` y `users.service`; ejecutar B2 en paralelo garantiza conflictos.

## Entradas obligatorias

1. `AGENTS.md`.
2. El informe origen, secciones 3 y 4.
3. `.agents/skills/INDEX.md` → `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `nestjs-expert`, `codebase-cleanup-deps-audit`.
4. Para FE-08: consultar a **AI-DS-OWNER** sobre el contrato de `Button` antes de sustituir nada.

---

## Backend — AI-SR-FULL

### H-09 · Helpers criptográficos duplicados

`looksLikeEncryptedAesGcm` **ya está exportado** en `apps/api/src/common/crypto/aes-gcm.util.ts:19`, y aun así se reimplementa en privado en:

- `users.service.ts:905`
- `platform-users.service.ts:307`
- `crm/expedientes/expediente.service.ts:2327`
- `packages/database/src/migrations/tenant/005_simplify_user_fields.ts:25`

Las copias privadas usan `expectedLength &&` (truthiness) donde el original usa `!== undefined`. Hoy coinciden porque `expectedLength` nunca vale 0, pero es una divergencia latente.

`hashEmail` está duplicado idéntico en cuatro servicios: `users.service.ts:800`, `auth.service.ts:1035`, `platform-users.service.ts:281`, `platform-bootstrap.service.ts:68`.

**Alcance:** consolidad en la utilidad compartida. **Excepción: no toquéis la migración `005`** — una migración ya aplicada debe permanecer congelada aunque duplique código; su copia local es correcta precisamente porque no debe cambiar si cambia la utilidad.

### H-10 · Un solo contrato de perfil

Tres definiciones del mismo modelo: `CreateUserDto`, `UpdateUserDto`, `UpdateProfileDto` (`users/dto/user.dto.ts`). `UpdateProfileDto` es subconjunto exacto de `UpdateUserDto`, que repite los campos de `CreateUserDto`.

**Ya divergieron:** `UpdateUserDto.phone` perdió el `@MaxLength(20)` que la columna sí impone. Al consolidar, la validación resultante debe ser la **más restrictiva** de las existentes, no la más laxa — y hay que declarar en el informe qué endpoints se vuelven más estrictos.

Conviven además dos motores de validación sobre el mismo modelo: class-validator en `users.controller` y Zod en `users-bulk.controller`. **Decisión de AI-EM-ARCH:** class-validator es el estándar del repo; Zod se conserva solo donde ya está. No migréis `bulkCreate` en esta ola — pero el esquema Zod debe derivar del mismo contrato, no repetirlo.

Usad las utilidades de Nest (`PickType`, `PartialType`, `OmitType`), no herencia manual.

### H-11 · Contrato HTTP consistente

`findAll` devuelve `{data:{data,meta}}` doblemente anidado (`users.controller.ts:122`); `bulkCreate` devuelve el objeto crudo sin envelope (`users-bulk.controller.ts:40`).

**Antes de tocar nada, verificad qué consume cada forma** en `apps/portal` y `apps/web`. Este es el único punto de la ola con riesgo real de romper al cliente: si la corrección obliga a cambiar el frontend, coordinadlo con AI-FE-PLATFORM en el mismo cambio, nunca por separado.

Si el envelope doble resulta ser el estándar de facto del repo, **la corrección correcta puede ser documentarlo en vez de cambiarlo** — comprobadlo antes de decidir.

### H-13 · Promesas flotantes

`void this.auditService.log(...)` y `void this.searchQueueService...` en `users.service.ts:296,311,431,444`. `void` silencia el lint pero no resuelve nada: si el audit falla, se pierde sin rastro, y precisamente en las operaciones que más lo necesitan.

**Comportamiento correcto:** el fallo se registra. No se pide que interrumpa la petición (ese es el contrato existente de `AuditService`), sí que deje de ser invisible.

### H-17 y H-18 · Documentación que miente

- `users.controller.ts:95` documenta `search` como "Busqueda ILIKE". No hay ILIKE en ninguna parte. Corregid el `@ApiQuery` para que describa el comportamiento real.
- `user.entity.ts:161` afirma que `documentNumber` "NUNCA se retorna en DTOs públicos" y el DTO lo retorna (`user.dto.ts:354`). El código es el correcto; el comentario debe morir.

---

## Frontend — AI-FE-PLATFORM

### FE-05 · Una sola fuente para "rol de plataforma"

`PORTAL_PLATFORM_ROLES` y `PORTAL_TENANT_ASSIGNABLE_ROLES` (`portal/src/lib/user-labels.ts:38-45`) son el mismo concepto que `PLATFORM_ONLY_ROLES` y `TENANT_ASSIGNABLE_ROLES`, añadidos a `@iwana/shared` por la Ola A.

**El duplicado lo introdujo esta auditoría**, no una sesión anterior. El de `@iwana/shared` es el canónico por ser frontera de seguridad; el portal debe importarlo y las constantes locales desaparecer.

### FE-06 y FE-17 · Las dos `UsersTable`

**No unifiquéis las dos tablas todavía.** Está pendiente una decisión del CTO sobre si `portal` y `web` deben compartir componente o son superficies deliberadamente distintas (informe §6, decisión 5).

**Sí está en alcance:**

- Llevar a `portal/UsersTable` los patrones que `web/UsersTable` ya resuelve mejor: headers declarativos en vez de 7 `<th>` con la misma clase repetida, y ocultación responsive por breakpoint en vez de solo `overflow-x-auto`.
- FE-17: `web/UsersTable` mapea roles con literales `'ADMIN'`, `'NOC'`. Sustituid por el enum `UserRole`.
- Los dos módulos de etiquetas (`PORTAL_*` / `WEB_*`) traducen los mismos enums. Consolidad lo que sea idéntico; **conservad lo que difiera de forma deliberada** — el vocabulario de un tenant no tiene por qué ser el de la consola de plataforma. Ante la duda, consultad a AI-EM-ARCH antes de fusionar vocabulario visible.

### FE-07 · Los dos modales

`EditUserModal` (886 líneas) y `CreateUserModal` (625) repiten los mismos 7 campos de perfil, distinguidos solo por el prefijo `create-`/`edit-` del `id`.

**Alcance:** extraer los campos compartidos a un componente de formulario reutilizable. **Conservad la diferencia legítima**: `EditUserModal` tiene además `status` y cambio de email, que `CreateUserModal` no.

886 líneas en un componente es señal de que hay más de una responsabilidad dentro. Descomponed, pero **sin cambiar ni un comportamiento** — los specs existentes de ambos modales deben seguir pasando sin tocarlos. Si un spec necesita cambiar, es que se cambió comportamiento: parad.

### FE-08 · Volver al design system

Consultad **primero** a AI-DS-OWNER sobre el contrato de `Button`.

- Dos botones con `className` inline de ~500 caracteres (`UsersClient.tsx:348`, `:375`) donde existe `Button` de `@iwana/ui`.
- Tres `<svg>` dibujados a mano (más, subir, copiar) y un spinner (`UsersTable.tsx:208`) en archivos que **ya importan `lucide-react`**. Equivalentes directos: `Plus`, `Upload`, `Copy`, `Loader2`.

Si `Button` no cubre alguna variante que hoy se logra con clases inline, **eso es un hallazgo del design system**: reportadlo a AI-DS-OWNER en vez de dejar la clase inline.

### FE-09 a FE-16 · Correcciones puntuales

| # | Qué |
| --- | --- |
| FE-09 | El debounce de `UsersClient.tsx:79` debe cancelarse al desmontar. |
| FE-10 | "Limpiar filtros" dispara dos peticiones (`UsersTable.tsx:161`). Debería quedar resuelto por FE-01 de la Ola B1; **verificadlo y, si persiste, corregidlo**. |
| FE-11 | `openEdit` espera `getEffectivePermissions()` sin indicador (`UsersClient.tsx:263`). Pulsar "Editar" debe producir feedback inmediato. |
| FE-12 | `initialUsers`/`initialMeta` son API muerta: o `page.tsx` precarga en el servidor y los pasa, o las props se eliminan. **Recomendación: precargar** — es un Server Component desaprovechado. Si optáis por eliminar, justificadlo. |
| FE-13 | `PAGE_SIZE` duplicado en tres sitios (constante en `UsersClient`, literal `20` dos veces en `UsersTable`). Una sola fuente. |
| FE-14 | `navigator.clipboard.writeText` con `void` traga el rechazo (`UsersClient.tsx:477`): en HTTP o sin permiso el usuario cree que copió. Debe haber feedback real de éxito o fallo. |
| FE-15 | Tabla sin `scope` en `<th>`, sin `<caption>`, sin `aria-live` en la carga. Aplicad `wcag-audit-patterns`. |
| FE-16 | `mapError` (`UsersClient.tsx:33`) devuelve `error.message` crudo del backend para status no contemplados. No debe filtrar internos a la UI. |

---

## Restricciones transversales

- `AGENTS.md` manda.
- **Cambio de comportamiento cero.** Los specs existentes deben pasar **sin modificarse**. Un spec que hay que tocar es la señal de que se cambió comportamiento: parad y evaluad.
- Texto visible y comentarios de negocio en **español**, sentence case.
- **No toquéis** la superficie de la Ola A (`roles.guard.ts`, `jwt.strategy.ts`, `auth.constants.ts`, `platform-roles.ts`, `user-role.enum.ts`) ni la migración `005`.
- **No abordéis hallazgos de la Ola C** (H-03, H-05, H-06, H-12, H-14, H-15): están bloqueados por decisiones del CTO.
- Tailwind v4 CSS-first: sin `tailwind.config.js`. Para texto sobre blanco, `iwana-secondary-700` (contraste AA).
- No commitear ni hacer push salvo petición explícita.

## Entregables

1. Los hallazgos listados, consolidados.
2. **Métrica de reducción**: líneas antes/después por área consolidada, y número de copias eliminadas por regla duplicada. Es el indicador de esta ola.
3. Informe final con: qué se consolidó y dónde, **qué divergencias aparecieron al unificar** (esto es lo más valioso: cada una es un bug latente que nadie había visto), qué se decidió conservar duplicado y por qué, salida real de tests sin maquillar, y riesgos residuales.

## Stop / Go

**Gates obligatorios:**

- Todos los tests existentes pasan **sin haber sido modificados**.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` en verde.
- Cobertura no baja respecto al baseline previo.
- Los 134 tests de regresión de la Ola A siguen pasando.

**Parad y escalad a AI-EM-ARCH si:**

- H-11 obliga a un cambio coordinado de contrato entre backend y frontend.
- Al consolidar aparece una divergencia donde no está claro cuál copia era la correcta — esa es una decisión de producto.
- FE-06 tienta a unificar las dos tablas: está bloqueado por decisión del CTO.
- La consolidación de vocabulario visible afectaría a lo que ve el usuario.
