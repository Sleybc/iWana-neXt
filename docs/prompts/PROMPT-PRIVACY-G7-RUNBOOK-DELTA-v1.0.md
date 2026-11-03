# PROMPT — `privacy` · G7: poner al día el runbook de despliegue por tenant

**Versión:** 1.0
**Estado:** Listo para lanzar. **No ejecuta G7:** solo deja el runbook al día. G7 sigue diferido hasta la beta mínima ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)) y no existe un entorno productivo donde correrlo
**Fecha:** 2026-11-03
**Emitido por:** AI-EM-ARCH
**Plantilla base:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Plan:** [`docs/plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md`](../plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md)
**Documento objetivo:** [`docs/runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md`](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md). Tiene ruta estable y la versión va en la cabecera (hoy 1.1); pasa a **1.2**. Se cambia con `Edit`, sin crear archivo nuevo.
**Fuentes:** [HLD Privacy v1.3](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.3.md) §5, §6.6, §6.7, §8 y §11 · [cierre de Fase 1b](../informes/INFORME-PRIVACY-FASE-1B-CIERRE-G6-v1.0.md) · [cierre de DT-3](../informes/INFORME-PRIVACY-DT3-RER-CIERRE-v1.0.md) · [cierre de O-1](../informes/INFORME-PRIVACY-O1-RETENCION-CIERRE-v1.0.md) · [verificación de la Ley 2573](../informes/INFORME-PRIVACY-LEY-2573-VERIFICACION-v1.0.md)

## Por qué

La v1.1 del runbook (30-oct) se escribió antes de la Fase 1b, de DT-3 y de O-1:
- su paso 2 solo nombra las migraciones 143 a 148;
- su paso 10 pone en vigor el **procedimiento manual** de supresión, que desde la Fase 1b (D-1B) es solo la vía de emergencia.

Si G7 se ejecutara hoy con este runbook, la verificación de la ventana omitiría los triggers de la 169 y la 171 y el conteo de backfill de la 170.

**Hecho a tener en cuenta:** la privacidad nunca ha corrido en producción. En el primer despliegue no puede haber titulares anonimizados ni retenciones calculadas con la lógica anterior. `--verify-only` y el conteo de contratos terminales sin fecha se corren como **comprobación de humo**, con resultado esperado 0.

## Encargo · `plat-ops`

Lee antes `AGENTS.md`, el runbook completo y las skills `iwana-tenant-migration`, `database-migration` y `postgresql`. Solo se edita el runbook; ni código ni otros documentos. Sin stash ni commit.

1. **Paso 2:** la lista de migraciones pasa a ser «todas las pendientes del runner, hasta la última registrada en `runner.ts` (hoy la 171)», citando las de privacidad: 146 a 152, 169, 170 y 171. Se añade como evidencia sin PII:
   - las cuatro líneas `[170] O1 backfill candidate=N count=M` de cada tenant;
   - la presencia de los triggers `trg_{subscribers,expediente_records,contracts}_prevent_anonymized_mutation` (169), `trg_contracts_preserve_retention_clock` (170) y `trg_contracts_require_retention_clock_insert` (171), comprobada en `pg_trigger` por esquema.
2. **Paso nuevo en el ciclo por tenant, tras el paso 6:** comprobaciones de privacidad en solo lectura, cada una con su condición de parada:
   - `anonymize-titular --verify-only` (esperado: 0 anonimizados y 0 residuales);
   - contratos `TERMINATED`/`ARCHIVED` con `terminated_at` nulo que no son de titular anonimizado (esperado: 0);
   - **`PII_ENCRYPTION_KEY` real y distinta de la MFA.** El CLI no puede caer en la clave MFA: si aparece su advertencia de respaldo, se para.
3. **Paso 10:** la supresión y el bloqueo se tramitan **por la aplicación** (HLD §6.6 y §6.7). El [runbook manual](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) queda como **vía de emergencia** (más de 500 expedientes o un participante no disponible). Se mantienen el Oficial, el registro restringido y el canal de incidente como condiciones de apertura.
4. **Paso 0, adjuntos de autoridad:** se añaden los dictámenes de ADR-094 §7.3, incluido el anclaje de los 20 días de la denuncia de la Ley 2573 y sus apartes de exequibilidad condicionada (verificación del 2026-11-02), como condición previa de la ventana. La fecha de entrada en vigor es la del informe: seis meses desde el 20-05-2026, con el 19-11-2026 como fecha interna.
5. **Paso 11, rollback:** la 169, la 170 y la 171 no se revierten como atajo, igual que las demás migraciones (el runbook ya prohíbe `down()`).
6. Cabecera: versión 1.2, fecha y una línea de historial con los cambios.

**Revisión:** `sec-eng` revisa el diff del runbook (controles, paradas y que la evidencia no lleve PII) y `docs-governance` revisa la forma. **Entrega:** diff del runbook y veredictos de las dos revisiones.
