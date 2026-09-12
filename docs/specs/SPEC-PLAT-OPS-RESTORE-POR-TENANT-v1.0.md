# SPEC — Backup y restore por tenant

**Versión:** 1.0
**Estado:** Propuesto — contrato congelado para la fase (protocolo §3bis)
**Fecha:** 2026-09-12
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Módulos:** Plataforma transversal · Base de datos multi-tenant
**Relacionado:** [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía de gates) · [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) (expediente de producción reabierto, Aprobado 2026-09-12) · [RUNBOOK-RELEASE-ROLLBACK-v1.0](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md) §6.2–§6.3
**Destinatario de ejecución:** AI-PLAT-OPS (R) · AI-SR-QA (verificación) · AI-EM-ARCH (A)

---

## 1. Problema

`restore por tenant` es una de las cinco condiciones de **G7** (ADR-069: «restore global y restore por tenant verificados»). Hoy **no existe la capacidad**, y no por falta de procedimiento sino de herramienta:

| Pieza | Estado |
| --- | --- |
| Procedimiento documentado | Existe — `RUNBOOK-RELEASE-ROLLBACK-v1.0` §6.2 (backup) y §6.3 (restore y criterios de PASS) |
| Herramienta de backup por tenant | **Ausente** — `scripts/db/backup.mjs` ejecuta `pg_dump -Fc -d <DB_NAME>` de la base completa, sin `--schema` |
| Herramienta de restore por tenant | **Ausente** — `scripts/db/restore.mjs` no tiene noción de schema |
| Ensayo ejecutado | **Ninguno** — el drill global figura marcado solo en `dev` |

La plataforma aísla cada tenant en su propio schema (`^tenant_[a-z][a-z0-9_]{0,54}$`). Sin esta capacidad, la única recuperación posible ante la pérdida de datos de **un** tenant es restaurar la base entera, lo que revierte también a los demás. En una plataforma multi-inquilino eso no es una degradación: es un incidente de disponibilidad provocado por el propio remedio.

## 2. Alcance

**Entra:**

1. Backup de un tenant: dump del schema del tenant **más** el material global mínimo para reinyectarlo.
2. Restore de un tenant en una base **aislada** (ensayo).
3. Restore de un tenant sobre una base que contiene otros tenants, con las guardas que exige §6.3 del runbook.
4. Evidencia archivable conforme a ADR-069: conteos, duración, checksum, base destino y operador — **nunca** datos de negocio ni PII.

**No entra:**

- Backup/restore de MinIO y política de Redis: son condiciones hermanas de G7 con su propio track.
- Decidir RPO/RTO. Son decisión pendiente del CTO (§7).
- Ejecutar un restore destructivo en producción. Esta fase construye y ensaya la capacidad; usarla en producción exige ventana y autorización del CTO.

## 3. Contrato de la herramienta

Dos comandos nuevos, alineados con los existentes de `package.json` (`db:backup`, `db:restore`).

### 3.1 `pnpm db:backup:tenant`

| Aspecto | Contrato |
| --- | --- |
| Entrada | `--tenant <uuid\|slug>` (obligatorio). Acepta identificador de negocio, **nunca** el nombre de schema |
| Resolución | El `schema_name` se obtiene consultando `public.tenants`; jamás se deriva del argumento ni se concatena input sin validar (runbook §6.2) |
| Validación | El `schema_name` resuelto debe cumplir `^tenant_[a-z][a-z0-9_]{0,54}$`. El regex ya existe en `packages/database/src/data-source.ts` — se **reutiliza**, no se reescribe |
| Salida | Dos artefactos correlacionados: el dump del schema (`--schema=<resuelto> --format=custom --no-owner --no-privileges`) y un **sidecar** con la fila de `public.tenants` del tenant |
| Nombre | `<schema_name>-<utc>.dump` y `<schema_name>-<utc>.tenant.json`, en el directorio de backups ya usado por `backup.mjs` |
| Código de salida | `0` solo si ambos artefactos quedaron escritos y `pg_dump` terminó en `0` |

**Por qué el sidecar.** El propio runbook §6.2 advierte que «un backup tenant no contiene por sí solo la fila de `public.tenants`». Sin ella, un dump restaurado es un schema huérfano: la aplicación no puede resolver el tenant y el `TenantMiddleware` lo rechaza. Hoy esa fila queda al criterio del operador; el contrato la vuelve parte del artefacto.

### 3.2 `pnpm db:restore:tenant`

| Aspecto | Contrato |
| --- | --- |
| Entrada | `--file <ruta.dump>` y `--into <nombre-base>` (ambos obligatorios) |
| Modo por defecto | **Ensayo**: exige que la base destino sea distinta de `DB_NAME`. Restaurar sobre la base de origen requiere `--force-same-database` y una confirmación interactiva explícita |
| Reinyección | Si existe el sidecar junto al dump, restaura también la fila de `public.tenants`; si no existe, **falla con mensaje accionable** en vez de dejar un schema huérfano |
| Prohibido | `DROP SCHEMA ... CASCADE` como atajo. Si el schema ya existe en destino, aborta e indica el procedimiento con ventana del runbook §6.3 |
| Salida | Resumen sanitizado: duración, checksum del dump, base destino, schema restaurado, conteo de tablas. **Sin filas de negocio** |

### 3.3 Invariantes de seguridad

Aplican a ambos comandos y son condición de aceptación, no recomendaciones:

1. **El schema nunca proviene del input.** Se resuelve desde `public.tenants` y se valida contra el regex antes de interpolarse en cualquier comando.
2. **Sin PII en logs ni en nombres de archivo.** El identificador visible es el `schema_name`, que es dato de infraestructura, no personal.
3. **Sin credenciales en la línea de comandos.** Se usan las variables de entorno que ya emplean `backup.mjs` y `restore.mjs`.
4. **Fail-closed.** Ante cualquier ambigüedad —tenant no encontrado, dos coincidencias de slug, schema que no valida, sidecar ausente— el comando aborta. No adivina.

## 4. Criterios de aceptación

Los seis primeros son los criterios de PASS que el runbook §6.3 ya fija; los dos últimos los añade esta spec porque §6.3 no los cubre.

| # | Criterio | Verificación |
| --- | --- | --- |
| CA-1 | `pg_restore` termina en `0` sin errores ocultos | Código de salida + ausencia de `error:` en la salida |
| CA-2 | En la base de ensayo existe `public` y **únicamente** el schema objetivo | `SELECT nspname FROM pg_namespace` |
| CA-3 | Las tablas de migraciones y el estado esperado están presentes | Conteo de tablas del schema restaurado |
| CA-4 | La API conecta con el usuario de runtime, sin privilegios de migración | Conexión con `DB_APP_USER` |
| CA-5 | Una transacción aplica `SET LOCAL search_path` al schema restaurado y revierte al fallar | `runInTenantSchema` contra la base de ensayo |
| CA-6 | Se registra duración, checksum, base destino y operador, sin datos de negocio | Inspección del resumen emitido |
| **CA-7** | **No-afectación:** con ≥2 schemas tenant en la base destino, restaurar uno deja el otro **byte a byte idéntico** | Checksum de las tablas del segundo tenant antes y después |
| **CA-8** | El restore de un dump **sin** sidecar falla con mensaje accionable, en vez de dejar un schema huérfano | Ejecución deliberada sin el `.tenant.json` |

**CA-7 es el criterio que define la capacidad.** Restaurar un tenant en una base vacía es un caso fácil y no demuestra aislamiento; lo que G7 exige es recuperar uno *sin tocar a los demás*. Un ensayo que no siembre un segundo tenant no acredita nada.

## 5. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Central. La herramienta existe para preservar el aislamiento durante una recuperación, que es justo cuando más fácil es romperlo. CA-7 lo convierte en criterio verificable |
| **Seguridad** | El vector es la interpolación de un nombre de schema no validado en un comando de shell. Se cierra reutilizando el regex y la resolución vía `public.tenants` que el código ya aplica en `runInTenantSchema` |
| **Escala** | El dump por schema crece con el tenant, no con la plataforma: es la única estrategia que sigue siendo viable con miles de tenants, donde un dump global deja de caber en la ventana |
| **Regulación** | Ley 1581 exige poder responder sobre los datos de un titular. Un backup que solo se restaura en bloque obliga a tocar datos de terceros para atender a uno. *Requiere verificación con fuente oficial* si la norma impone un plazo de recuperación concreto |

## 6. Fuera de contrato (decisiones que no toma esta spec)

- **Cifrado del dump en reposo.** Los backups contienen PII real (ADR-078). Si se decide cifrarlos, es una decisión de seguridad con su propio ADR.
- **Destino remoto de los backups.** Hoy quedan en disco local. Llevarlos fuera del VPS es parte del track de DR, no de éste.
- **Retención.** Cuántas copias y por cuánto tiempo depende de RPO, que está sin decidir.

## 7. Dependencia declarada: RPO/RTO

Los criterios CA-1 a CA-8 son de **corrección**, no de tiempo. La herramienta puede construirse y ensayarse sin RPO/RTO, y sus ensayos **miden y reportan** la duración.

Lo que no puede hacerse sin esos targets es **declarar PASS de tiempo**: sin un RTO no existe umbral contra el que comparar la duración medida, ni un RPO que fije cada cuánto debe tomarse un backup. Es decisión del CTO (F0.2) y bloquea el cierre de la condición de G7, no la construcción de la capacidad.

Mientras no existan, el informe de fase reporta la duración como **medida, no evaluada**.
