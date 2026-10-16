# SPEC — Backup y restore por tenant

**Versión:** 1.1
**Estado:** Propuesto — contrato congelado para la fase (protocolo §3bis)
**Fecha:** 2026-10-16
**Modo activo:** Executor (AI-PLAT-OPS)
**Autor:** AI-PLAT-OPS
**Módulos:** Plataforma transversal · Base de datos multi-tenant
**Relacionado:** [SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0](SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md) (vigente salvo §3.2, superada por esta versión en el punto del rollback) · [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía de gates) · [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) (expediente de producción reabierto, Aprobado 2026-09-12) · [RUNBOOK-RELEASE-ROLLBACK-v1.0](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md) §6.2–§6.3 · [RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md) §11 · [PROMPT-MOD05-PRIVACY-G7-v1.0](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) §6.1 (M1-G2, G7-4) y §6.2 M4
**Destinatario de ejecución:** AI-PLAT-OPS (R) · AI-SEC-ENG (revisión) · AI-EM-ARCH (A)

---

## 1. Problema

`restore por tenant` es una de las cinco condiciones de **G7** (ADR-069: «restore global y restore por tenant verificados»). La v1.0 definió la herramienta y sus ocho criterios; el ensayo M2b y el informe [INFORME-MOD05-G7-M3-v1.0](../informes/INFORME-MOD05-G7-M3-v1.0.md) mostraron que el contrato v1.0 no cubre el rollback de un tenant **sobre su propio registro**: tras el `RENAME` aprobado del schema (`<t>` → `<t>__pre_rollback_<ts>`), la fila de `public.tenants` sigue vigente con el mismo `id` y `slug`, por lo que `assertNoRegistryConflicts` rechaza antes de `pg_restore`, e `injectTenantRow` reinsertaría la fila con un `INSERT` simple después. Sin un modo explícito para este caso, el rollback por tenant no es ejecutable (M1-G2 en NO-GO).

## 2. Alcance

**Entra** (único cambio respecto a v1.0):

1. Modo `--rollback-in-place` de `pnpm db:restore:tenant` para el rollback sobre el schema renombrado (§3.2).
2. Sus criterios de aceptación CA-9 (camino feliz) y CA-10 (rechazos sin escrituras) (§4).

**No entra:** todo lo demás sigue en v1.0 sin cambios (backup por tenant, restore de ensayo, invariantes de seguridad §3.3, CA-1 a CA-8, fuera de contrato §6, RPO/RTO §7).

## 3. Contrato de la herramienta

Sin cambios respecto a v1.0 salvo §3.2, que se extiende con el modo rollback.

### 3.1 `pnpm db:backup:tenant`

Sin cambios (v1.0 §3.1).

### 3.2 `pnpm db:restore:tenant`

Sin cambios en el modo normal (v1.0 §3.2). Se añade:

| Aspecto | Contrato `--rollback-in-place` |
| --- | --- |
| Entrada | `--file <ruta.dump> --into <base> --force-same-database --rollback-in-place`. El sidecar junto al dump sigue siendo obligatorio (CA-8) y su `dump_sha256` debe coincidir |
| Precondiciones (todas, verificadas solo con lectura antes de cualquier escritura) | 1. El schema destino **no existe** (se renombró antes con el RENAME aprobado). 2. La fila de `public.tenants` **existe y coincide exactamente** con el sidecar en `id`, `slug` y `schema_name`. 3. El tenant está `SUSPENDED` |
| Comportamiento | Omite `assertNoRegistryConflicts` e `injectTenantRow`; **todo lo demás sigue igual**: validación dump↔sidecar, checksum, `pg_restore --exit-on-error --no-owner --no-privileges`, grants H-1 (paso post-restore externo) y verificación con conteos |
| Rechazos | Si una precondición no se cumple (schema presente, fila ausente, fila distinta en `id`/`slug`/`schema_name`, tenant no suspendido, base destino inexistente), aborta **sin escribir nada**. Nunca modifica `public.tenants`. Nunca elimina schemas |
| Salida | Resumen sanitizado con `reinyeccion public.tenants: conservada (modo --rollback-in-place)`; sin filas de negocio |

### 3.3 Invariantes de seguridad

Sin cambios (v1.0 §3.3). Se subraya para este modo: el registro vigente no se toca por ningún camino del CLI (no hay `UPDATE`/`DELETE` sobre `public.tenants` en `restore-tenant.mjs`), y el schema renombrado se conserva hasta autorización expresa del CTO; para revertir el rollback se invierte el `RENAME`, nunca se borra.

## 4. Criterios de aceptación

CA-1 a CA-8 sin cambios (v1.0 §4). Se añaden:

| # | Criterio | Verificación |
| --- | --- | --- |
| **CA-9** | Camino feliz en base desechable: `RENAME` → restore `--rollback-in-place` → grants H-1 → conteos iguales al manifiesto → reactivar → **deshacer** con el `RENAME` inverso | Ensayo M4 con conteos antes/después; la fila de `public.tenants` queda intacta en todo el recorrido; base desechable eliminada al cerrar |
| **CA-10** | Cada precondición incumplida aborta sin escrituras: schema presente, fila ausente, fila distinta (`id`, `slug`, `schema_name` por separado), tenant no `SUSPENDED` | Tests unitarios del gate puro (`assertRollbackInPlacePreconditions`) + test estructural de que el gate precede en `main` a `createDatabase`, `runPgRestore` e `injectTenantRow` |

## 5. Impacto declarado

Sin cambios respecto a v1.0 §5, más: el modo nuevo **reduce** la superficie de error del rollback (antes exigía DML manual o relajar guardas) al convertir las tres precondiciones en verificaciones fail-closed de la propia herramienta.

## 6. Fuera de contrato

Sin cambios (v1.0 §6).

## 7. Dependencia declarada: RPO/RTO

Sin cambios (v1.0 §7).
