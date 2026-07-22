# ADR-063 (borrador) — Admin principal explícito en modelo de datos (MOD04 H-12)

**Estado:** Propuesto — pendiente CTO (recomendación EM-ARCH: opción B)  
**Fecha:** 2026-07-22  
**Autor:** AI-DATA-ENG  
**Origen:** [PROMPT-MOD04-OLA-C-v1.0](../prompts/PROMPT-MOD04-OLA-C-v1.0.md) H-12  
**No mergear sin aprobación CTO.** Este ADR **no** se implementa en Ola C (G5 cerrado 2026-07-22 con regla documentada en código).

### Decisión EM-ARCH (2026-07-22)

**Recomendación:** opción **B** (`public.tenants.principal_admin_user_id`), alineada a DATA-ENG.  
**No aprueba** el ADR (reservado al CTO). Ola C permanece cerrada sin este cambio de modelo.

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

## Fuera de alcance Ola C

- No emitir migración hasta GO.
- SR-FULL no mergea el atributo; solo la regla documentada.
- SEC-ENG debe revisar: el UUID de user en public no es PII, pero la transferencia de principal es control de privilegio.

## Decisión

_Pendiente CTO / EM-ARCH._
