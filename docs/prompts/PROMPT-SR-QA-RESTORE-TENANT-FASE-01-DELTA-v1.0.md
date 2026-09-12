# PROMPT DE EJECUCIÓN — Re-verificación delta del refactor DRY (Fase 01, delta)

**Versión:** 1.0
**Fecha:** 2026-09-12
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Destinatario:** **AI-SR-QA**
**Track:** T2-delta — verificación de un cambio posterior al GO de fase

## Contratos congelados

- **Contrato de la herramienta (sin cambios):** [`docs/specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md`](../specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md), v1.0. Este delta **no** modifica el contrato ni sus ocho criterios de aceptación; verifica que un refactor posterior sigue cumpliéndolos.
- **Informe de fase que este delta actualiza:** [`INFORME-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md`](../informes/INFORME-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md) — registra «GO de la fase» con los hashes del artefacto **anterior** a este refactor (§1: `backup-tenant.mjs` `F278A479…E20FD`, `restore-tenant.mjs` `B482799C…F099E`). Esos hashes quedan **invalidados** por el cambio descrito abajo.
- **Plan de fase:** [`docs/plans/2026-09-12-plat-ops-restore-por-tenant.md`](../plans/2026-09-12-plat-ops-restore-por-tenant.md)

## Origen de este delta

Tras el GO de fase, AI-EM-ARCH (bajo modelo Sonnet 5) auditó la entrega comparándola contra la spec y aplicó un refactor de eliminación de duplicación (DRY), **sin tocar el contrato ni el comportamiento observable declarado**. AI-EM-ARCH verificó su propio refactor —44 tests unitarios, `pnpm test:tooling` completo, y un ensayo propio de CA-7/CA-8/H-1 contra Postgres real, antes y después del cambio— pero **no puede autocertificarlo**: es el productor de este cambio, y el protocolo exige que el aprobador de un gate nunca sea su productor (protocolo §3). Este prompt pide la verificación independiente que falta.

## 1. Qué cambió (alcance exacto de este delta)

| Archivo | Estado | Qué cambió |
| --- | --- | --- |
| `scripts/db/backup-tenant.mjs` | Modificado | Consume infraestructura compartida en vez de duplicarla. Ninguna función exportada cambió de nombre ni de firma pública |
| `scripts/db/restore-tenant.mjs` | Modificado | Idéntico motivo |
| `scripts/db/lib/tenant-tooling.mjs` | **Nuevo** | `CliError`, carga de `.env`, loader de `isValidSchemaName` de `@iwana/db`, `assertContainerRunning`, `runPsqlQuery`, `sha256File` — antes duplicados casi verbatim en los dos scripts |
| `scripts/db/backup-tenant.test.mjs` | **Sin cambios** | Verificar por hash, no solo por inspección |
| `scripts/db/restore-tenant.test.mjs` | **Sin cambios** | Idem |

**Un cambio de comportamiento observable, declarado explícitamente, que debes verificar:** el mensaje genérico de fallo de `psql` cambió de dos redacciones distintas por script a una compartida con un `failureHint` opcional (`runPsqlQuery(env, sql, vars, { failureHint })`). `backup-tenant.mjs` pasa el hint que preserva su mensaje original ("Verifique que la base indicada tenga el esquema public y la tabla tenants"); `restore-tenant.mjs` no pasa hint. Ningún test ni documento de `docs/` cita el texto exacto anterior (verificado por AI-EM-ARCH con grep) — confírmalo tú también antes de aceptar el cambio como no disruptivo.

**Hashes SHA-256 del estado que entrego a revisión** (calcula los tuyos; deben coincidir exactamente o el árbol cambió entre que emito esto y que lo revisas):

```
scripts/db/backup-tenant.mjs         22a052607606ee46652c0fe398acc48e0b611b84095f97d4f07f2e7a716d154f
scripts/db/restore-tenant.mjs        1b7d93a6da724b8e4ae3f69a6ebd7bd90da5c27e27a1516f7ffc6b5057207213
scripts/db/lib/tenant-tooling.mjs    dcb9d1ecf8271aff8f2578d7ffcf02fa9a6dee620f03f89e1b97af4ca2968c40
scripts/db/backup-tenant.test.mjs    1db041c4843c11f44bdc7cae93e3cddea6569d3a0eaeb095f4306a083f231756
scripts/db/restore-tenant.test.mjs   5dc1a589a586c6bf2e8d0ae4e13dffbbc4fd466ec61555379c6d141faf2a3aad
```

## 2. Objetivo exacto

**Resultado esperado:** un veredicto GO / GO-CON-ENMIENDAS / NO-GO sobre si el refactor conserva íntegro el contrato de la spec, para poder sustituir los hashes «artefacto final verificado» del informe de fase por los de arriba.

**No entra:** re-abrir el diseño de la spec (no cambió), ni volver a ejercitar los 8 CA desde cero con el mismo detalle exhaustivo del ensayo original — este es un delta de regresión, no una fase nueva. Sí entra confirmar que nada se rompió y que la superficie de seguridad centralizada no introdujo un riesgo nuevo.

## 3. Instrucciones

1. **Verifica los cinco hashes de §1.** Si alguno no coincide, detente y emite `[BLOQUEO]`: no audites un árbol distinto del que se te describe.
2. **Diff de comportamiento, no solo de forma.** Lee `scripts/db/lib/tenant-tooling.mjs` completo y compáralo función por función contra lo que antes vivía inline en cada script (el propio informe de auditoría de AI-EM-ARCH, resumido en §1, te da el mapeo). Confirma en particular:
   - `runPsqlQuery` compartido sigue pasando las variables por `-v key=value` + `:'var'` en el SQL — nunca concatenación.
   - `loadSchemaValidator` sigue cargando `isValidSchemaName` desde `dist/data-source.js` compilado, no una copia del regex.
   - `assertContainerRunning` y `sha256File` son funcionalmente idénticos a como estaban.
3. **Regresión unitaria**, runner directo (nunca vía turbo, nunca vía jest):
   ```
   node --test scripts/db/backup-tenant.test.mjs scripts/db/restore-tenant.test.mjs
   pnpm test:tooling
   ```
   Deben dar 44/44 y 124/124 respectivamente, ambos con 0 fallos y 0 skips. Cualquier otro número es motivo de `[BLOQUEO]`, no de nota.
4. **Repite el ensayo de CA-7 con tus PROPIOS datos sintéticos**, no reutilices los míos: crea dos tenants sintéticos en bases desechables (uno de control, uno a restaurar), calcula checksum del tenant de control antes y después de restaurar el otro, y confirma identidad byte a byte. Es exactamente el ensayo que hizo T2 en la fase original; repetirlo con datos propios es lo que hace de esto una verificación independiente y no una repetición de mis pasos.
5. **Repite CA-8** (restore de un dump sin su sidecar): confirma que aborta antes de crear la base destino.
6. **Repite H-1**: conecta con el rol de runtime contra el schema recién restaurado antes de `apply-least-privilege`, confirma `permission denied`; aplica el paso del runbook §6.3; confirma lectura posible y `CREATE` seguir denegado.
7. **Revisión de seguridad del módulo nuevo.** `tenant-tooling.mjs` centraliza la superficie que antes estaba duplicada: si tiene un defecto, afecta a los dos scripts a la vez. Aplica la misma óptica del dictamen SEC-ENG original (schema nunca del input, sin `shell: true` ni `eval`, credenciales solo por variables de entorno del child process). Si tienes acceso a AI-SEC-ENG, pide una segunda lectura del archivo; si no, hazla tú y documenta que la hiciste.
8. **Registra los hashes finales** (los tuyos, recalculados tras tu propia verificación) como el nuevo «artefacto verificado» que reemplaza al del informe de fase original.

## 4. Restricciones no negociables

1. **No corrijas código.** Eres verificador, no productor; si encuentras un defecto, repórtalo y clasifícalo (bloqueante / importante / deuda), no lo arregles.
2. **Evidencia sanitizada** (ADR-069): conteos, duración, checksums, base destino, operador. Nunca PII, tokens ni payloads. Tus propios datos sintéticos, no los del ensayo original.
3. **Un criterio sin comando ejecutado no está verificado.** No aceptes «AI-EM-ARCH ya lo probó» como evidencia propia — es exactamente lo que este delta existe para no permitir.
4. Español; identificadores técnicos sin traducir.

## 5. Entregables

| Entregable | Contenido |
| --- | --- |
| Veredicto delta | GO / GO-CON-ENMIENDAS / NO-GO |
| Confirmación de hashes | Los cinco de §1, coincidentes o no |
| Regresión | Conteos reales de las dos suites |
| CA-7 / CA-8 / H-1 | Repetidos con datos propios, resultado y evidencia sanitizada |
| Revisión del módulo compartido | Hallazgos, si los hay, clasificados por severidad |
| Recomendación sobre el informe de fase | Si el veredicto es GO: los nuevos hashes que deben sustituir a los registrados en `INFORME-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md` §1 |

## 6. Criterio stop/go

**GO del delta** si los hashes coinciden, las dos suites dan 0 fallos/0 skips, CA-7/CA-8/H-1 se repiten con datos propios y pasan, y el módulo compartido no introduce un defecto de seguridad nuevo.

**NO-GO** si cualquier hash no coincide (árbol distinto al descrito), si CA-7 falla con datos propios, o si el módulo compartido resulta ser una superficie de inyección que no lo era antes de fusionarse.

**`[BLOQUEO]` a AI-EM-ARCH** si no puedes reproducir el entorno de ensayo (Docker/Postgres no disponible) — no declares el delta verificado por inspección de código únicamente.
