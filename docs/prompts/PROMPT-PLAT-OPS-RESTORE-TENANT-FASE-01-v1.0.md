# PROMPT DE EJECUCIÓN — Capacidad de backup y restore por tenant (Fase 01)

**Versión:** 1.0
**Fecha:** 2026-09-12
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Destinatario:** **AI-PLAT-OPS**
**Track:** T1 — Capacidad

## Contratos congelados

- **Contrato de la herramienta:** [`docs/specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md`](../specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md), versión **1.0**, congelado el 2026-09-12. Es la fuente de verdad de esta fase: si algo de este prompt y la spec discrepan, **manda la spec** y se emite `[BLOQUEO]`.
- **Plan de fase:** [`docs/plans/2026-09-12-plat-ops-restore-por-tenant.md`](../plans/2026-09-12-plat-ops-restore-por-tenant.md)

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que la plataforma pueda respaldar y restaurar **un** tenant sin tocar a los demás, con una herramienta versionada en el repositorio y cubierta por tests.

**Lo que sí entra:**

- Los dos comandos de la spec §3: `db:backup:tenant` y `db:restore:tenant`.
- Sus cuatro invariantes de seguridad (spec §3.3), como comportamiento verificado, no como comentario.
- Tests de la lógica de resolución y validación, y de las rutas de fallo.
- Actualización del `RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §6.2–§6.3 para que apunte a los comandos en lugar de a invocaciones manuales de `pg_dump`.

**Lo que NO entra:**

- Ejecutar el ensayo de aceptación: lo verifica AI-SR-QA en el track T2. Tú entregas la capacidad, no su PASS.
- MinIO, Redis, registro de imágenes, TLS o dominio: son condiciones hermanas con su propio track.
- Decidir RPO/RTO, retención, cifrado del dump o destino remoto: fuera de contrato (spec §6 y §7).
- Cualquier operación destructiva sobre la base de desarrollo del CTO.

## 2. Artefactos de entrada obligatorios

| Artefacto | Ruta |
| --- | --- |
| Contrato congelado | `docs/specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md` |
| Procedimiento y criterios de PASS | `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §6.2 y §6.3 |
| Herramientas existentes a imitar | `scripts/db/backup.mjs`, `scripts/db/restore.mjs` |
| Regex y resolución de schema ya implementados | `packages/database/src/data-source.ts` (`runInTenantSchema`) |
| Gobernanza | `AGENTS.md`, `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` §4 |
| Skills | `.agents/skills/INDEX.md` → `postgresql`, `docker-expert` |

## 3. Instrucciones

1. **Lee primero `backup.mjs` y `restore.mjs` enteros.** Los comandos nuevos deben ser hermanos de esos, no un diseño paralelo: mismo estilo de carga de entorno, misma resolución Docker/host (`DB_BACKUP_MODE`), mismo tratamiento del directorio de backups y de su exclusión de git.
2. **Reutiliza el regex de schema de `packages/database/src/data-source.ts`.** No lo copies ni lo reescribas: si diverge, un día validarán cosas distintas. Si no es importable desde un script `.mjs`, plantéalo como `[BLOQUEO]` con tu propuesta en vez de duplicarlo por tu cuenta.
3. **Implementa `db:backup:tenant`** conforme a spec §3.1, incluido el **sidecar** con la fila de `public.tenants`. Sin sidecar el backup está incompleto, aunque `pg_dump` termine en 0.
4. **Implementa `db:restore:tenant`** conforme a spec §3.2, con el modo ensayo por defecto, la reinyección del sidecar y la negativa explícita a usar `DROP SCHEMA ... CASCADE`.
5. **Escribe tests** de: resolución de tenant por uuid y por slug; slug ambiguo con dos coincidencias; tenant inexistente; `schema_name` que no valida contra el regex; dump sin sidecar. **Las rutas de fallo importan tanto como la feliz**: son las que impiden que un error se convierta en un schema huérfano o en una inyección.
6. **Actualiza el runbook §6.2–§6.3** para que el procedimiento cite los comandos. Deja constancia de que el sidecar es ahora parte del artefacto, porque §6.2 hoy advierte del problema sin resolverlo.

## 4. Restricciones no negociables

1. **El `schema_name` jamás procede del argumento.** Se resuelve consultando `public.tenants` y se valida contra el regex antes de interpolarse en ningún comando. Es el vector de inyección que esta fase cierra; incumplirlo es STOP de fase.
2. **Sin PII ni credenciales** en logs, nombres de archivo, mensajes de error o tests. El identificador visible es el `schema_name`.
3. **Fail-closed siempre.** Ante ambigüedad, el comando aborta con mensaje accionable. No adivina, no elige «el primero», no continúa «best effort».
4. **Nada destructivo por defecto.** El restore exige base destino distinta de `DB_NAME`; sobrescribir el origen requiere bandera explícita y confirmación interactiva.
5. **No ejecutes un restore sobre la base de desarrollo del CTO.** Para probar, crea una base de ensayo desechable y elimínala al terminar.
6. **Evidencia sanitizada** (ADR-069): conteos, duración, checksum, base destino y operador. Nunca filas de negocio, tokens ni payloads.
7. Español en comentarios y mensajes; identificadores técnicos sin traducir.

## 5. Entregables

| Entregable | Formato |
| --- | --- |
| Los dos comandos | `scripts/db/*.mjs` + entradas en `package.json` |
| Tests | Junto a la suite que corresponda, ejecutables con jest directo |
| Runbook actualizado | `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §6.2–§6.3 |
| Informe de entrega | Qué construiste, decisiones tomadas, conteos reales de tests, y qué queda para T2 |

## 6. Criterio stop/go

**GO** cuando los dos comandos existan, sus invariantes estén cubiertos por tests con conteo real, y el runbook los cite.

**STOP y emite `[BLOQUEO]`** si: el regex no es reutilizable sin duplicarlo; la resolución del tenant exige un privilegio que el rol de backup no tiene; o descubres que el procedimiento del runbook §6.2–§6.3 es inejecutable tal como está escrito.

**Verificación obligatoria** — jest **directo, nunca vía turbo**, porque su caché reporta éxito sin ejecutar:

```
node ../../node_modules/jest/bin/jest.js --config jest.config.js --testPathPattern "<tu patrón>"
```

Reporta **conteos reales**; un «verde» sin número no es evidencia (protocolo §4).

## 7. Lo que NO debes dar por hecho

- **No asumas que un restore en base vacía demuestra aislamiento.** No lo demuestra, y CA-7 existe por eso. Tu herramienta debe funcionar con otros tenants presentes; QA lo verificará.
- **No asumas que `pg_dump` en 0 significa backup completo.** Sin el sidecar, el dump no es restaurable a un sistema funcional.
- **No declares PASS de duración.** No hay RTO definido; mide y reporta (spec §7).
