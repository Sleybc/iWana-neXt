# INFORME MOD04 — Auditoría integral del módulo de Usuarios Internos

**Versión:** 1.0
**Estado:** Vigente
**Fecha:** 2026-07-22
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Agentes participantes:** AI-SEC-ENG (explotabilidad), AI-SR-FULL (remediación Ola A)
**Alcance auditado:** `apps/api/src/modules/users`, entidad `User`, migraciones tenant, `apps/portal/dashboard/users`, `apps/web/(protected)/users`
**Commit base:** `94a4dde1` · **Commits de remediación:** `92e37014`, `49055520`

---

## 1. Resumen ejecutivo

35 hallazgos sobre 6.710 líneas de frontend y el módulo backend completo.

| Severidad | Backend | Frontend | Total | Estado |
| --- | --- | --- | --- | --- |
| Crítica | 2 | 0 | 2 | ✅ Cerradas (Ola A) |
| Alta | 6 | 4 | 10 | 1 cerrada, 9 abiertas |
| Media | 7 | 8 | 15 | Abiertas |
| Baja | 3 | 5 | 8 | Abiertas |

**Una vulnerabilidad crítica de escalación de privilegio cross-tenant fue encontrada, confirmada como explotable y remediada durante esta auditoría.** El resto de la deuda no bloquea despliegue.

El módulo funciona. Su deuda no es de funcionalidad sino de **estructura**, y se concentra en tres patrones que atraviesan ambas capas:

1. **Contratos duplicados que ya divergieron.** El mismo modelo de datos está escrito tres veces en backend (`CreateUserDto`, `UpdateUserDto`, `UpdateProfileDto`) y dos veces en frontend (`CreateUserModal`, `EditUserModal`), con validaciones que ya no coinciden entre sí.
2. **Reglas de negocio escritas N veces con N resultados.** `looksLikeEncryptedValue` existe cuatro veces; la regla RF-RBAC-04 de borrado existe tres veces y una de ellas es incorrecta; el concepto "rol de plataforma" existe tres veces.
3. **Diseños que no sobreviven a la escala declarada.** La búsqueda de usuarios carga la tabla completa en memoria del proceso Node y filtra con Levenshtein en TypeScript, para una escala objetivo de cientos de miles de usuarios.

**Prioridad recomendada tras la Ola A:** la búsqueda de usuarios (H-05 + FE-01). Es la operación más frecuente de un administrador y hoy no es fiable en ninguna de las dos capas.

---

## 2. Ola A — Seguridad (CERRADA)

### H-01 · Escalación de privilegio tenant → plataforma · CRÍTICA

**Confirmada explotable por AI-SEC-ENG.** El claim `type: 'platform' | 'tenant'` existía y estaba correctamente poblado, pero ningún guard de la cadena de autorización lo leía. `RolesGuard` comparaba solo el string del rol, y `PlatformRole`/`UserRole` comparten los literales `SYSTEM_ADMIN` e `IWANA_SUPPORT`. Ambos tokens se firmaban además con la misma clave RSA sin `issuer`/`audience` diferenciados.

Cadena verificada, precondición única una cuenta `ADMIN` de tenant: autopromoción a `SYSTEM_ADMIN` → re-login → enumeración de todos los tenants → `POST /tenants/:id/regenerate-admin-credentials` devuelve credenciales de administrador de tenants ajenos en texto claro.

**Agravante:** `TenantMiddleware` está excluido de `/tenants/**` y `AuditInterceptor` descartaba en silencio las peticiones sin `TenantContext` resoluble — el ataque no dejaba asiento de auditoría en ningún destino.

**Remediado** en `49055520`. Ver [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md).

> **Nota forense:** por el punto ciego de auditoría, la ausencia de registros no es evidencia de ausencia de explotación. El CTO confirmó el 2026-07-22 que no existe entorno productivo ni preproductivo desplegado, por lo que no procede investigación ni notificación regulatoria.

### H-02 · El audit trail de creación no identifica al actor · CRÍTICA

`create()` registraba `userId: user.id` — el usuario creado, no quien lo creó — y el controlador no propagaba actor ni IP. Con `@SkipAudit()` en la ruta, el interceptor tampoco lo cubría: **era imposible responder quién dio de alta a un usuario**. Impacto sobre trazabilidad Ley 1581.

**Estado:** el punto ciego de auditoría quedó cerrado en la Ola A; la propagación del actor en `create`/`bulkCreate` **sigue abierta** y se traslada a la Ola B1.

### H-04 · Token de reset sobrevive a la resurrección de un usuario borrado · MEDIA

La rama de restauración de soft-delete reinicializaba ~20 campos a mano y omitía los tres de reset. Explotable con ventana de 60 minutos y control del buzón (escenario realista: insider recién dado de baja, o buzón de rol reasignado). **Remediado**, junto con un bug funcional derivado que impedía el login del usuario resucitado, y el almacenamiento en claro del token de reset.

---

## 3. Backend — hallazgos abiertos

### Altos

| # | Hallazgo | Ubicación |
| --- | --- | --- |
| **H-03** | **Drift entidad ↔ DDL.** `000_initial_tenant_schema` crea `users` con `email VARCHAR(512)`, sin `UNIQUE(email)` y sin `idx_users_first_name`/`idx_users_last_name`; la entidad declara lo contrario. Causa: las migraciones `003`, `004` y `005` son **huérfanas** — no están en `TENANT_MIGRATIONS` ni las invoca ningún script. Las columnas de `003`/`004` fueron reabsorbidas en `000`; el DDL estructural de `005` no. Atenuante: `uq_users_email_hash` sí existe, así que no hay agujero de integridad, sino de contrato. | `tenant/000:60-98`, `tenant/005`, `runner.ts:80` |
| **H-05** | **`findAll` con `search` no sobrevive a la escala objetivo.** Carga la tabla completa del tenant, mapea cada fila a DTO con intento de descifrado, y filtra en Node con Levenshtein. Sin `take`, sin índice. Además el cursor se aplica **antes** del filtro (paginación incorrecta, no solo lenta) y `total` cambia de semántica entre ramas. | `users.service.ts:120-143` |
| **H-06** | **`bulkCreate` bloquea ~30 s sin idempotencia.** Hasta 100 items, cada uno en su transacción con bcrypt cost 12. Sin `Idempotency-Key` (el resto del módulo sí la exige). Devuelve 100 contraseñas temporales en claro en un body. `createdAt` se fabrica en vez de leerse del registro. | `users.service.ts:325-381` |
| **H-07** | **`USERS_READ` existe, está asignado en tres perfiles y ningún endpoint lo exige.** `GET /users` y `GET /users/:id` solo llevan `@Roles`. La capa de perfiles de acceso es decorativa para lectura, y el contrato RBAC está roto en las dos direcciones. | `users.controller.ts:70`, `access-control.constants.ts:257` |
| **H-08** | **Autorización duplicada y divergente.** `findOne` valida en el controlador y lanza `BadRequestException` (400) donde corresponde 403. `changeLoginEmail` valida la misma regla dos veces — 400 en el controlador, 403 en el servicio — y el controlador gana, así que el 403 es código muerto. | `users.controller.ts:207`, `:300` vs `users.service.ts:467` |
| **H-19** | **`Idempotency-Key` exigida pero no usada (descubierta en preflight B1).** El controlador valida presencia del header en create/update/resetPassword/changeLoginEmailAsAdmin y **no lo pasa al servicio**. Sin deduplicación: dos POST con la misma clave crean dos usuarios. Ampliación de Ola B1. | `users.controller.ts:149-156` |

### Medios y bajos

| # | Sev | Hallazgo |
| --- | --- | --- |
| **H-09** | Medio | `looksLikeEncryptedAesGcm` ya está exportado en `common/crypto/aes-gcm.util.ts:19`, pero se reimplementa en privado en `users.service`, `platform-users.service`, `expediente.service` y otra vez en la migración `005`. `hashEmail` duplicado idéntico en cuatro servicios. |
| **H-10** | Medio | Tres definiciones del mismo contrato de perfil (`CreateUserDto`, `UpdateUserDto`, `UpdateProfileDto`). Ya divergieron: `UpdateUserDto.phone` perdió el `@MaxLength(20)` que la columna impone. Conviven dos motores de validación (class-validator y Zod) sobre el mismo modelo. |
| **H-11** | Medio | Contrato HTTP inconsistente: `findAll` devuelve `{data:{data,meta}}` doblemente anidado; `bulkCreate` devuelve el objeto crudo sin envelope. |
| **H-12** | Medio | "Administrador principal" es una regla implícita — el `ADMIN` más antiguo por `createdAt`, sin índice y sin documentar en el PRD. Si se elimina, el principal cambia en silencio y con él el email de contacto del tenant. |
| **H-13** | Medio | Promesas flotantes silenciadas con `void` en audit y search-queue dentro de la transacción. Si el audit falla, se pierde sin rastro. |
| **H-14** | Medio | `decodeLegacyValue` es deuda con TODO abierto y sin fecha de retiro. La migración `005` ya descifró todo; la ruta legacy obliga a `UsersService` a cargar `MFA_ENCRYPTION_KEY` que de otro modo no necesitaría. |
| **H-15** | Medio | El audit de cambio de email registra `{loginEmailChanged: true}` — un booleano sin valor anterior ni nuevo, forensemente inútil. Requiere decisión: hash o últimos-4, nunca PII en claro. |
| **H-16** | Bajo | `?limit=abc` → `parseInt` da `NaN`, que no es nullish y esquiva el `?? 50` → `take: NaN`. Falta `ParseIntPipe`. |
| **H-17** | Bajo | `@ApiQuery` documenta `search` como "Busqueda ILIKE". No hay ILIKE en ninguna parte: OpenAPI miente al consumidor. |
| **H-18** | Bajo | La entidad afirma que `documentNumber` "NUNCA se retorna en DTOs públicos" y el DTO lo retorna. El código parece correcto; el comentario debe morir. |

---

## 4. Frontend — hallazgos abiertos

### Altos

| # | Hallazgo | Ubicación |
| --- | --- | --- |
| **FE-01** | **Buscar y filtrar se borran mutuamente.** El estado está partido: `statusFilter`/`roleFilter` en `UsersTable`, `searchValue` en `UsersClient`, sin conocerse. `handleStatusChange` omite `search`; `handleSearchChange` omite `status` y `role`. Reproducible: filtra por "Suspendido", escribe en el buscador → el filtro desaparece de la petición pero **el `<select>` lo sigue mostrando**. La UI miente sobre lo que el usuario está viendo. | `UsersTable.tsx:72`, `UsersClient.tsx:161` |
| **FE-02** | **La `Idempotency-Key` no aporta idempotencia.** Se genera con `crypto.randomUUID()` en el momento de cada llamada. Una clave nueva por intento es lo contrario de una clave de idempotencia: dos pulsaciones de "Crear" producen dos usuarios. El header cumple el contrato sintáctico y falla el semántico. | `UsersClient.tsx:174`, `:206`, `:251` |
| **FE-03** | **`canDelete` contradice al backend.** El backend permite que un `SYSTEM_ADMIN` elimine a un `ADMIN`; el frontend lo prohíbe a cualquiera sin mirar el rol del actor. Tercera copia de RF-RBAC-04 y la única incorrecta. El tooltip afirma algo falso para el SYSTEM_ADMIN. | `UsersTable.tsx:86` vs `users.service.ts:615` |
| **FE-04** | **Fallo parcial silencioso.** `handleCreate` encadena `create()` + `replaceUserProfiles()`. Si la segunda falla, el usuario ya está creado pero sin perfiles, y el mensaje genérico hace que el admin reintente y choque con un 409. Mismo patrón en `handleEdit`. | `UsersClient.tsx:174-177`, `:205-210` |

### Medios y bajos

| # | Sev | Hallazgo |
| --- | --- | --- |
| **FE-05** | Medio | **Tres fuentes de verdad para "rol de plataforma".** `PORTAL_PLATFORM_ROLES`/`PORTAL_TENANT_ASSIGNABLE_ROLES` ya existían en el portal, y la Ola A añadió `PLATFORM_ONLY_ROLES`/`TENANT_ASSIGNABLE_ROLES` a `@iwana/shared` sin reutilizarlos. Duplicado introducido por esta misma auditoría; el de `shared` es el canónico por ser frontera de seguridad. |
| **FE-06** | Medio | Dos `UsersTable` divergentes, y la de `web` está mejor construida (headers declarativos, `Card` del DS, ocultación responsive). La de `portal` hardcodea 7 `<th>` con la misma clase repetida y no oculta ninguna columna en móvil. |
| **FE-07** | Medio | `EditUserModal` (886 líneas) y `CreateUserModal` (625) repiten los mismos 7 campos de perfil, distinguidos solo por el prefijo `create-`/`edit-` del `id`. Espejo exacto de H-10: la duplicación atraviesa las dos capas. |
| **FE-08** | Medio | Bypass del design system: dos botones con `className` de ~500 caracteres inline donde existe `Button` de `@iwana/ui`, y tres `<svg>` dibujados a mano en un archivo que ya importa `lucide-react`. |
| **FE-09** | Medio | Debounce sin limpieza en desmontaje → `setState` sobre componente desmontado si se navega antes de 300 ms. |
| **FE-10** | Medio | "Limpiar filtros" dispara dos peticiones: una inmediata y otra por el debounce. |
| **FE-11** | Medio | `openEdit` espera `getEffectivePermissions()` antes de abrir el modal, sin indicador. En red lenta, pulsar "Editar" no produce nada visible. |
| **FE-12** | Medio | `initialUsers`/`initialMeta` son API muerta: `page.tsx` renderiza `<UsersClient />` sin props. Server Component que no precarga nada. |
| **FE-13** | Bajo | `PAGE_SIZE` duplicado en tres sitios (constante en `UsersClient`, literal `20` dos veces en `UsersTable`). |
| **FE-14** | Bajo | `navigator.clipboard.writeText` con `void` que traga el rechazo: en HTTP o sin permiso, el usuario cree que copió. |
| **FE-15** | Bajo | Tabla sin `scope` en `<th>`, sin `<caption>`, sin `aria-live` para anunciar la carga. |
| **FE-16** | Bajo | `mapError` devuelve `error.message` crudo del backend para cualquier status no contemplado. |
| **FE-17** | Bajo | `web/UsersTable` mapea roles con literales `'ADMIN'`, `'NOC'` en vez del enum `UserRole`. |

---

## 5. Lectura de conjunto

Las dos capas cuentan la misma historia:

| Patrón | Backend | Frontend |
| --- | --- | --- |
| Contrato duplicado que ya divergió | H-10 (3 DTOs) | FE-07 (2 modales) |
| Regla de negocio escrita N veces | H-09 (`looksLike…` ×4) | FE-03, FE-05 (×3 cada una) |
| Autorización en dos capas divergentes | H-08 (400 vs 403) | FE-03 (frontend vs backend) |
| Búsqueda no fiable | H-05 (cursor, `total`) | FE-01 (filtros que se borran) |

**H-05 y FE-01 juntos hacen que la búsqueda de usuarios sea poco fiable de punta a punta.** Es la operación más frecuente de un administrador de tenant.

---

## 6. Plan de remediación

| Ola | Contenido | Agentes | Estado |
| --- | --- | --- | --- |
| **A — Seguridad** | H-01, H-04 | AI-SEC-ENG → AI-SR-FULL | ✅ Cerrada y verificada |
| **B1 — Bugs funcionales** | H-02, H-07, H-08, H-16, **H-19**; FE-01…04 + residuales G5 | AI-SR-FULL + AI-FE-PLATFORM | ✅ Cerrada G5 (2026-07-22) — sin commit; deuda: replay sin temporaryPassword; `PATCH /me` no consume key; bulk → C |
| **B2 — Consolidación DRY** | H-09, H-10, H-11, H-13, H-17, H-18; FE-05…FE-15, FE-17 | AI-FE-PLATFORM + AI-SR-FULL, consulta AI-DS-OWNER | ✅ Cerrada G5 (2026-07-22) — BE [informe](./INFORME-MOD04-OLA-B2-BACKEND-v1.0.md); FE residuales H-11/FE-08 aplicados; sin commit |
| **C — Datos y escala** | H-03, H-05, H-06, H-12, H-14, H-15; FE-12 | AI-DATA-ENG + AI-SR-FULL + FE-PLATFORM | ✅ Cerrada G5 (2026-07-22) — [SR-FULL](./INFORME-MOD04-OLA-C-SR-FULL-v1.0.md) · [DATA-ENG](./INFORME-MOD04-OLA-C-DATA-ENG-v1.0.md); sin commit |

### Orquestación 2026-07-22 (AI-EM-ARCH)

**Modo:** Orchestrator + Architect + EM.

Preflight B1 cerrado antes de despachar:

| Gate | Veredicto |
| --- | --- |
| **H-07** | **GO.** Añadir `@Permissions(USERS_READ)` en lecturas conservando `@Roles(ADMIN, SYSTEM_ADMIN)`. No expandir a SUPPORT/HR/AUDITOR (PRD CA-01). Quienes tienen `USERS_READ` en matriz sin rol ADMIN siguen sin listado — deuda de producto aparte, no bloquea. |
| **FE-02 / H-19** | **Hallazgo nuevo.** El controlador exige `Idempotency-Key` pero no la pasa al servicio ni deduplica. Ampliación autorizada de B1: SR-FULL implementa idempotencia real; FE-PLATFORM fija ciclo de vida de la clave en UI. |
| **RF-RBAC-04** | **Congelada.** Autorización en servicio; 403 no 400; SYSTEM_ADMIN puede eliminar ADMIN; FE refleja la misma regla. |
| **Ola B2** | **GO G5.** BE+FE DRY; H-11 bulk `returnFullResponse`; FE-08 `lime`/`outline` (DS CUBRE). |
| **Ola C** | **GO G5.** H-03/05/06/14/15 cerrados; H-12 regla documentada (modelo diferido); FE-12 sin precarga (token localStorage). Deuda: processor bulk en API; banner sessionStorage. |

### Cierre de sesión orquestación (2026-07-22)

| Ola | G5 | Siguiente |
| --- | --- | --- |
| A | ✅ | — |
| B1 | ✅ | Working tree; commit a petición |
| B2 | ✅ | Idem |
| C | ✅ | Idem |

**Deuda residual aceptada:** replay create sin `temporaryPassword`; `PATCH /users/me` sin consumir Idempotency-Key; processor bulk en API (no worker); banner job solo pestaña; H-12 → [ADR-063](../adrs/ADR-063-Admin-Principal-Explicito-MOD04.md) **Propuesto** (EM recomienda B; sin merge hasta CTO); FE-12 sin RSC; labels portal/web duales (D-5=B); ADR-061 §4 paralelo.

**Acta CTO:** D-1A · D-2A (PLAT GO) · D-3A · D-4A (SEC A) · D-5B.

Prompts de ejecución: [B1](../prompts/PROMPT-MOD04-OLA-B1-v1.0.md) · [B2](../prompts/PROMPT-MOD04-OLA-B2-v1.0.md) · [C](../prompts/PROMPT-MOD04-OLA-C-v1.0.md)

### Decisiones pendientes del CTO

Paquete formal (opciones, recomendaciones e impacto): [INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0](./INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0.md). Resumen:

1. **[ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) §4** — sacar `SYSTEM_ADMIN` e `IWANA_SUPPORT` del enum `UserRole` (carril paralelo; no desbloquea Ola C).
2. **D-1 / H-03** — drift entidad↔DDL: migración nueva idempotente (p. ej. `083`); no editar `000`.
3. **D-2 / H-05** — `pg_trgm` + ADR, condicionado a GO de AI-PLAT-OPS.
4. **D-3 / H-06** — ¿`bulkCreate` asíncrono (BullMQ)? Requiere AI-PROD-UX.
5. **D-4 / H-15** — formato del asiento de cambio de email (hashes; nunca PII en claro sin SEC-ENG).
6. **D-5 / FE-06** — informativa para B2: ¿unificar `UsersTable` portal/web o declarar superficies distintas?

---

## 7. Deuda declarada al cierre

| Severidad | Cantidad | Plan de pago |
| --- | --- | --- |
| Crítica | 0 | — |
| Alta | 0 (olas A–C) | Residuos no bloqueantes abajo |
| Media | residual | Processor bulk→worker; H-12 atributo explícito; FE-12 auth server |
| Baja | residual | `PATCH /me` idempotency; banner multi-pestaña; ADR-061 §4 |

Olas A, B1, B2 y C cerradas en G5 (working tree, sin commit). No procede escalación por acumulación (ADR-016).

## 8. Trazabilidad

- `PRD-MOD04-USUARIOS-INTERNOS-v1.1.md` — RF-RBAC-01 a RF-RBAC-06
- `HLD-MOD04-USUARIOS-INTERNOS-v1.1.md` — modelo de datos y endpoints
- [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) — frontera de audiencias JWT (Propuesto)
- `AGENTS.md` — gates de merge
