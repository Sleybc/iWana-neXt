# ADR-063 — Admin principal explícito en modelo de datos (MOD04 H-12)

**Estado:** Aprobado  
**Fecha:** 2026-07-22  
**Autor:** AI-DATA-ENG  
**Aprobado por:** CTO Humano (2026-07-22)  
**Origen:** [PROMPT-MOD04-OLA-C-v1.0](../prompts/PROMPT-MOD04-OLA-C-v1.0.md) H-12  
**Implementación:** habilitada — Ola D.

### Decisión EM-ARCH (2026-07-22)

**Recomendación:** opción **B** (`public.tenants.principal_admin_user_id`), alineada a DATA-ENG. Ratificada por el CTO el mismo día.

---

## Contexto

Hoy el «administrador principal» del tenant es una regla derivada en aplicación:

- `UsersService.isPrincipalAdminUser`: el `UserRole.ADMIN` activo con menor `createdAt`.
- Efecto: al cambiar su login email (con sync), se actualiza `public.tenants.contact_email`.

Riesgos:

1. Si se elimina el ADMIN más antiguo, el principal **cambia en silencio**.
2. No hay índice ni atributo auditable de la designación.
3. La regla no está en el PRD como invariante de modelo (solo comportamiento implícito).

Ola C documentó la regla en código (JSDoc) **sin** cambiar el modelo — correcto según stop condition.

## Opciones

| # | Opción | Cambio de modelo |
| --- | --- | --- |
| A | Mantener derivación por `createdAt` y documentar en PRD/HLD | No |
| B | `public.tenants.principal_admin_user_id UUID` (FK lógica al user del schema tenant) + transferencia controlada | Sí — schema public |
| C | Flag `users.is_principal_admin BOOLEAN` parcial único por tenant | Sí — schema tenant |

## Recomendación DATA-ENG

**Opción B** (columna en `public.tenants`):

- El contact email ya vive en `public.tenants`; el puntero al admin principal pertenece al mismo agregado.
- Evita constraint parcial por schema tenant y facilita auditoría de plataforma.
- Provisioning fija el valor al crear el primer ADMIN; cambio de principal = operación explícita (API + audit), nunca soft-delete implícito.
- Migración public: backfill = ADMIN más antiguo por schema (misma regla actual) + `NOT NULL` tras backfill o nullable con check operativo.

**Índice:** `principal_admin_user_id` no requiere índice de búsqueda caliente; opcional B-tree si hay lookups frecuentes.

## Condiciones de implementación (Ola D)

- El backfill usa la regla actual (ADMIN activo más antiguo por `createdAt`) para no alterar qué usuario es principal hoy en ningún tenant.
- La **transferencia de principal es una operación explícita con auditoría**, nunca un efecto colateral de un soft-delete. Eliminar al principal actual debe fallar mientras no se designe sucesor: el modo de fallo que motivó este ADR es precisamente el cambio silencioso.
- SEC-ENG debe revisar la transferencia: el UUID en `public` no es PII, pero designar principal es control de privilegio.

## Decisión

**Opción B aprobada** por el CTO el 2026-07-22: `public.tenants.principal_admin_user_id`, con migración de backfill y operación de transferencia auditada.
