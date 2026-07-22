# PROMPT — MOD12 · Remediación G7 — Fase H6-R2

> **Estado: Emitido — EJECUTABLE.** Origen: re-verificación post-H6-R1 (2026-07-21). H6-R1 **no** levantó el NO-GO: evidencia Chromium retractada; deuda ~29 sin dueño real; cobertura del util de remediación incompleta.

## Vinculos

- NO-GO vigente: `docs/informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md`
- R1 retractado (PlatOps): `docs/informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-R1-PLATOPS-v1.0.md` v1.1
- Spec: D-H6-5 / CA-H6-06 / CA-H6-07 (enmiendas R1 siguen vigentes)

## Destinatarios

| Track | Agente | Alcance |
| --- | --- | --- |
| Browsers | **AI-PLAT-OPS** | Borrar `b`, instalar Chromium real, resumen Playwright de **ejecución** |
| Backend higiene | **AI-SR-FULL** | Borrar `matchesUsefulLifeAlertSqlPredicate`; cubrir clamp `addMonthsUtc`; `coverageThreshold` |
| Deuda E2E | **AI-SR-QA** | Tabla ~29 fallo a fallo (causa, módulo, dueño, ID deuda) — tras browsers OK |
| Informes | **AI-EM-ARCH** | Corregir afirmaciones verdes no reproducibles (este prompt + retractaciones) |

---

## Paso 1 — Chromium real · AI-PLAT-OPS

1. Inspeccionar `%USERPROFILE%\AppData\Local\ms-playwright` (o `PLAYWRIGHT_BROWSERS_PATH`).  
2. **Borrar** el directorio basura `b` (y cualquier residuo de redirect).  
3. Instalar de verdad: `pnpm exec playwright install chromium` desde `c:\appiw` (sin redirecciones rotas).  
4. Verificar con **código que lance el browser**, no `--list`:
   ```powershell
   node -e "const {chromium}=require('playwright'); (async()=>{const b=await chromium.launch({headless:true}); console.log('LAUNCH_OK', await b.version()); console.log('PATH', chromium.executablePath()); const fs=require('fs'); console.log('exists', fs.existsSync(chromium.executablePath())); await b.close();})().catch(e=>{console.error(e); process.exit(1);})"
   ```
5. Ejecutar (o coordinar con QA) y **adjuntar el resumen completo** de:
   ```powershell
   npx playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-inventory-scm.spec.ts
   ```
   Salida: totales pass/fail, exit code, duración. **Prohibido** citar solo `--list` como evidencia.
6. Informe: `docs/informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-R2-PLATOPS-v1.0.md` — si no puedes reproducir launch, declara **FALLO**, no remediado.

---

## Paso 2 — Util + coverage · AI-SR-FULL

1. **Borrar** `matchesUsefulLifeAlertSqlPredicate` de `serialized-asset-useful-life.util.ts` y toda referencia.  
2. Cubrir el clamp de fin de mes en `addMonthsUtc` (línea del `setUTCDate(0)`): casos donde el día de la fecha de referencia (o purchase) provoca clamp al sumar meses (p. ej. 31 → mes corto). Exponer vía tests de `calculateUsefulLife` / `usefulLifeExpiryDate` (no hace falta exportar `addMonthsUtc` si se cubre por esos caminos).  
3. En `apps/api/jest.config.js`, armar `coverageThreshold` — como mínimo path-specific ≥80 % stmts/branches sobre `modules/inventory/services/serialized-asset-useful-life.util.ts` (evitar umbral global que rompa el monorepo sin baseline). Documentar en el informe R2.  
4. Verificar:  
   `$env:EV1_REAL_DB='1'; pnpm --filter @iwana/api test -- src/modules/inventory --coverage --coverage=false`  
   y una corrida con coverage del util que demuestre ≥80 % en ese archivo.

---

## Paso 3 — Deuda ~29 con dueño · AI-SR-QA

Tras Paso 1 en verde (o con log de fallos reales de la suite portal completa):

Emitir tabla en `docs/informes/INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md`:

| ID deuda | Spec | Test name | Error observable | Causa raíz | Módulo dueño | Agente / equipo responsable | Severidad |

- Un ID por fallo (p. ej. `DEUDA-E2E-PORTAL-001` …).  
- Prohibido: «ajeno», «preexistente», o solo códigos MOD09/MOD06 sin fila por fallo.  
- Si la suite completa no puede correr aún: **BLOQUEO** explícito — no inventar filas.

---

## Paso 4 — Informes · AI-EM-ARCH

Ya en curso: retractar PlatOps R1 y marcar R1 consolidado como **no evidencia** de B2/CA-H6-08 hasta R2.

---

## Stop/go

| Stop | Go (listo re-G7) |
| --- | --- |
| Caché sin `chromium-*` ejecutable | Launch real + resumen Playwright de inventario |
| Informes que afirmen 41/41 sin corrida | Informes alineados a evidencia reproducible |
| Deuda ~29 como lista de siglas | Tabla por fallo con ID |
| `matchesUsefulLifeAlertSqlPredicate` sigue en código | Borrada; util ≥80 % en threshold |

**Aprobador G7 ≠ productor.** No auto-cerrar.
