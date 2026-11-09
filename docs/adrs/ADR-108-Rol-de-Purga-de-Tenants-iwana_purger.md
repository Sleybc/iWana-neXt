# ADR-108: Rol de base `iwana_purger` para la purga de tenants

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-11-09 — «Apruebo ADR-108» (confirmado por el usuario en la sesión de R7)
**Fecha:** 2026-11-09
**Autor:** AI-PLAT-OPS · **Revisión:** AI-SEC-ENG
**Modo activo:** Architect
**Módulos:** MOD01 Tenants / Plataforma · worker `tenant-schema-purge` · roles de base (SEC-04)
**Enmienda:** el modelo de roles de SEC-04 ([RUNBOOK-DB-LEAST-PRIVILEGE-v1.0](../runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md)), que hasta hoy tenía dos roles de aplicación: `iwana_app` e `iwana_migrator`.
**Relacionado:** [spec R7](../specs/2026-11-09-plat-ops-r7-purga-tenants-rol-de-produccion-spec.md) (G0 del CTO el 2026-11-09, D-4) · [ADR-033](ADR-033-Ciclo-Vida-Tenant-Purga-Diferida-Limites-Nullable.md) (purga diferida) · [ADR-094](ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (iWana es Encargado)

---

## 1. Contexto

La purga programada de tenants nunca ha podido borrar un esquema. Se conecta como `iwana_app`, y los esquemas `tenant_%` pertenecen a `iwana_migrator`. SEC-04 separó esos dos roles a propósito: un `iwana_app` comprometido no debe poder destruir la auditoría. La spec R7 §3.1 evaluó seis alternativas por mínimo privilegio.

## 2. Decisión

1. Se crea un tercer rol de aplicación, **`iwana_purger`**: `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`, sin membresías y sin `TEMP`. Solo tiene `CONNECT` a la base, `USAGE` en `public` y `EXECUTE` sobre dos funciones. No tiene privilegios sobre tablas.
2. Las dos funciones son `SECURITY DEFINER`, cuyo dueño es `iwana_migrator` y cuyo `search_path` es `pg_catalog, public, pg_temp`:
   - `public.iwana_list_purge_candidates(int, int)` lista los candidatos;
   - `public.iwana_purge_tenant_schema(uuid, int)` purga un tenant.

   Imponen en la base las reglas de elegibilidad: tenant marcado, piso de 30 días, nombre válido, esquema del migrator, exclusión de `tenant_iwana` y ausencia de dependencias externas.
3. Solo el worker recibe la credencial (`DB_PURGER_USER` y `DB_PURGER_PASSWORD`). La API no la recibe. En producción el worker no arranca sin ella.
4. Un trigger `SECURITY INVOKER` en `public.tenants` protege el reloj de retención para los roles que no pertenecen al migrator:
   - fija la fecha de la marca en `now()`;
   - impide cambiar `id` y `schema_name`;
   - impide dar de alta un tenant sobre un esquema que ya existe;
   - audita cada marca.
5. GSEC-N1 (`docker/postgres/init/01-create-roles.sh`) verifica también que `iwana_purger` no esté elevado ni tenga `TEMP`, y que no haya membresías entre los roles `iwana_*`.

## 3. Alternativas descartadas

| Alternativa | Motivo |
| --- | --- |
| Hacer a `iwana_app` miembro de `iwana_migrator`, o dueño de los esquemas | Anula SEC-04. |
| Que la purga use la credencial del migrator, en el worker o en un proceso aparte | La purga tendría todo el poder del migrator y la base no impondría las reglas. Queda como contingencia. |
| Conceder `EXECUTE` a `iwana_app` | Daría poder de purga a la API expuesta (AI-SEC-ENG). |
| Ceder la propiedad del esquema al marcar el tenant | Necesita muchas piezas y no impone la retención. |

## 4. Consecuencias

- **A favor.** La purga funciona con el mínimo poder posible, y la base, no el código del worker, decide qué se puede borrar. Una API comprometida ya no puede adelantar una purga.
- **En contra.** Hay una credencial más que gestionar: un secreto en producción, el init, el script para volúmenes existentes, Compose y CI. El worker sigue guardando la credencial del migrator por el aprovisionamiento; esa es la deuda R7-d de la spec.
- **Operación.** Si el rol no existe cuando se aplica la migración, las funciones quedan sin `EXECUTE` y la purga falla de forma visible. Nunca se abren permisos por omisión.
