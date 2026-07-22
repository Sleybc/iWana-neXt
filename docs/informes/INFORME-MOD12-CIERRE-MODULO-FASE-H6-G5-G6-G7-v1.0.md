# Informe de gates G5 / G6 / G7 — MOD12 Fase H6

**Version:** 1.2  
**Fecha:** 2026-07-21  
**Orquestador:** AI-EM-ARCH  
**Productores de código:** AI-SR-FULL · AI-FE-PLATFORM · AI-SR-QA (arnés) — **no** firmantes de este gate  
**Fase:** [INFORME-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md](INFORME-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md)  
**Cierre módulo:** [INFORME-MOD12-CIERRE-MODULO-v1.0.md](INFORME-MOD12-CIERRE-MODULO-v1.0.md)  
**ADR:** [ADR-060](../adrs/ADR-060-Control-Bajas-y-Consultas-Operativas-Inventario.md)  
**Remediación:** [PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md](../prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md)

---

## G5 — Review técnico de segunda capa (AI-EM-ARCH)

| Gate técnico | Resultado (entrega H6) | Re-verificación G7 |
| --- | --- | --- |
| Lint | 8/8 PASS | No cuestionado |
| Typecheck | 8/8 PASS | No cuestionado |
| Jest API inventory (`EV1_REAL_DB=1`) | 46 suites / 346 tests PASS | Confirmado por QA independiente |
| Jest portal inventory | 59 suites / 282 tests PASS | Confirmado por QA independiente |
| E2E `portal-inventory-scm` | 41/41 citado | **No reproducible** (Chromium ausente en re-ejecución QA) |
| Sin DDL | Cumple | Cumple |
| OpenAPI / SEC-ENG | Cumple | Controles RBAC verificados OK |

**Veredicto G5 (histórico entrega):** GO técnico sobre evidencia del productor.  
**Nota G7:** la evidencia E2E citada **no resiste verificación independiente** → condiciona el cierre.

---

## G6 — Review experiencia y calidad

| Rol | Veredicto | Notas |
| --- | --- | --- |
| AI-PROD-UX | GO con deuda | Microcopy no-ADMIN |
| AI-DS-OWNER | GO | Sin violación DS |
| AI-SR-QA (entrega) | GO con deuda | CA-H6-01…08 citados; cobertura % no medida |
| AI-SEC-ENG | Controles OK | ADMIN-only; SoD; sin bypass HTTP |

**Veredicto G6 consolidado (entrega):** GO con deuda.  
**Reapertura G7:** CA-H6-06 y evidencia de aislamiento **no sostienen** el GO — ver §G7.

---

## G7 — Veredicto CTO / revisor (2026-07-21)

### Decisión

| Dimensión | Estado |
| --- | --- |
| Cierre técnico MVP MOD12 | **NO-GO** |
| Arranque módulo N+1 | **Suspendido** hasta levantar NO-GO |
| Producción / despliegue | **NO-GO** (sin cambio — no desplegado) |

> La aprobación verbal previa de cierre/N+1 queda **revocada** por este veredicto. MOD12 **no** está cerrado.

### Hallazgos bloqueantes

#### B1 — Divergencia vida útil → falsos negativos / etiquetas cruzadas

| Caso | Ficha 360 (`calculateUsefulLife` month-diff) | Panel alertas (SQL INTERVAL) |
| --- | --- | --- |
| compra 2025-01-15 · 12 m · hoy 2026-01-01 | «Vencida» | aparece etiquetada «Vencida» bajo filtro Por vencer |
| compra 2026-04-30 · 6 m · hoy 2026-07-21 | «Por vencer» | **no aparece** |

El segundo es el grave: activo que el helper marca como atención **desaparece** del panel. Criterio stop del prompt H6 §6: *«SQL y calculateUsefulLife clasifican distinto algún borde → STOP»*. Se cerró en verde porque CA-H6-06 comparó una **reimplementación TS** del predicado contra el helper (Postgres no evalúa) y se acotó a **fechas día 1**.

**Decisión de arquitectura (AI-EM-ARCH / CTO, no menú):** semántica **día-exacta**. Vencimiento = `purchase_date + useful_life_months` (comportamiento date PG). `calculateUsefulLife` se reescribe para derivar meses restantes desde esa fecha de vencimiento; el helper queda fuente única; el predicado SQL conserva forma indexable. Enmienda **D-H6-5** / **CA-H6-06** — sin ADR nuevo.

#### B2 — Evidencia E2E no reproducible

Re-ejecución independiente: falta binario Chromium; tests mueren en `browserType.launch`. Los números 41/41 del informe **no son reproducibles** en el entorno de verificación. El gate exige evidencia validada por quien no la produjo.

**Justicia al triaje G6-P2-01:** los 11+1 heredados sí se triaron con causa raíz, clasificación y diff. G6-P2-01 queda **saldada**. Lo que no vale: despachar ~29 fallos ajenos con tabla de «naturaleza» (sustituir «preexistente» por «ajeno») — D-H6-8 lo prohíbe.

#### B3 — Prueba de aislamiento no prueba aislamiento

El mock implementa el filtrado por tenant que el test dice verificar; `where` → `mockReturnThis()`. Pasaría si el servicio omitiera `tenant_id`. El predicado real existe en código; la **spec citada como evidencia** no lo demuestra.

### Lo que sí sostiene verificación

- SEC-ENG: approve/reject ADMIN; sin ruta HTTP alterna al ledger; SoD también en reject; SQL parametrizado; `tenant_id` en consulta; sin DDL.
- Jest API 346 + portal 282 confirmados por QA.
- Informe declara explícitamente que MOD12 no está desplegado.
- Controles ADR-060 (D-060-1/2/4 a nivel de diseño) no están comprometidos en RBAC/DDL; falla la **evidencia** y un defecto que debió atrapar.

### Condiciones para levantar el NO-GO

1. Unificar semántica día-exacta; reescribir CA-H6-06 **contra Postgres real** (patrón EV-1) con casos día 28/29/30/31.  
2. Reescribir aislamiento contra dos schemas reales **o** assertar el predicado SQL emitido.  
3. Instalar Chromium (AI-PLAT-OPS) y re-ejecutar suite; evidencia reproducible por no-productor.  
4. **Enmienda firmada CA-H6-07:** alcance = suite/cluster E2E propio MOD12 (`portal-inventory-scm` / cluster compras-RFQ-proveedores-comodato). Los ~29 ajenos → deuda cross-módulo con dueño (no «ajeno» sin atribución).  
5. Menores: test autorrechazo; desacoplar `canApprove` de `canAdjustStock`; marcar `recordWriteOff` como interno.

**Prompt de remediación:** `PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md`.

### Estado remediación H6-R2 (2026-07-21)

| Condición | Estado | Evidencia |
| --- | --- | --- |
| B2 Chromium real + suite inventario | Remediado (filesystem + corrida) | `chromium-1208\chrome-win64\chrome.exe` existe; PlatOps **41/41** 56.3s; re-corrida EM-ARCH **exit 0** con `PLAYWRIGHT_BROWSERS_PATH` canónico. Causa R1 falso: sandbox `PLAYWRIGHT_BROWSERS_PATH` |
| Deuda ~29 → tabla por fallo | Remediado | `INFORME-MOD12-DEUDA-E2E-PORTAL-CROSS-MODULO-v1.0.md` — **DEUDA-E2E-PORTAL-001…030** |
| Borrar espejo TS + clamp + threshold | Remediado | R2-BACKEND: función eliminada; util 100 % cov; `coverageThreshold` path-specific en `jest.config.js` |
| Informes R1 falsos | Retractados | PlatOps R1 v1.1; informe R1 v1.2 |

**NO-GO sigue vigente hasta decisión del aprobador G7.** Condiciones de cierre del revisor: cumplidas en artefactos R2 — pendiente verificación humana del entorno.

Prompt R2: `PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R2-v1.0.md`

---

## Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-21 | v1.0 — G5 GO · G6 GO con deuda · G7 pendiente. |
| 2026-07-21 | v1.1 — G7 CTO preliminar (cierre/N+1); producción NO-GO. |
| 2026-07-21 | v1.2 — **G7 NO-GO** por B1/B2/B3; abre H6-R1. |
| 2026-07-21 | v1.2+ — H6-R1 retractado (Chromium falso); abre **H6-R2**. |
| 2026-07-21 | v1.3 — H6-R2 tracks ejecutados; condiciones revisor cubiertas en artefactos; **NO-GO pendiente levantamiento**. |
