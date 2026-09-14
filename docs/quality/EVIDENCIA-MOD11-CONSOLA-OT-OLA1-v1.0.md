# Evidencia de calidad — MOD11 Consola de OT · Ola 1 · Regresión C5 (SR-QA)

**Versión:** 1.0
**Fecha:** 2026-09-14
**Agente:** AI-SR-QA (sr-qa)
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md` §3 (doce casos) + §5 (entregables)
**Informe de fase:** `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md`

Todos los conteos son reales: jest directo (`--ci --runInBand`, sin turbo,
sin `--passWithNoTests`) y Playwright directo contra su config (sin dev server
reusado como evidencia: el `webServer` de la suite levanta el portal para la
corrida). Ningún archivo de producción fue modificado; ningún test vigente fue
tocado para acomodar cambios.

## 1. Suites nuevas de regresión (doce casos)

| Suite | Archivo | Resultado |
| --- | --- | --- |
| Regresión backend (casos 1-6, 5-bis, 10, 11 + R-SCHEMA) | `apps/api/src/modules/tasks/tests/execution-orders.ola1-regression.spec.ts` | **14 passed / 14** |
| Regresión portal (casos 7-9 + R-OTE + R-S2) | `apps/portal/src/components/operations/ExecutionOrderConsolaOtOla1Regression.spec.tsx` | **7 passed / 7** |
| E2E navegador OTE-20260828-001 (casos 4/5, 7, 9) | `e2e/tests/portal-operations-consola-ot-ola1.spec.ts` | **2 passed / 2** |

Mapa caso → test:

| Caso | Test(s) | Veredicto |
| --- | --- | --- |
| 1. Responsable técnico (CA-01) | R1 | GO |
| 2. Responsable cuadrilla CREW (CA-02) | R2 | GO |
| 3. Coherencia listado-detalle | R3a, R3b | GO |
| 4. requirements[] real (CA-05) | R4 | GO |
| 5. COMPLIANCE satisfecho (CA-06) | R5 | GO |
| 5-bis. Cuarentena NO / AVAILABLE SÍ (ambos sentidos) | R5-bis/a, R5-bis/b | GO |
| 6. Agregado progress/completed/total | R6 | GO |
| 7. IN_PROGRESS sin alerta, técnico y supervisor (CA-03) | R7-técnico, R7-supervisor, R7-observador + E2E 1 | GO |
| 8. Supervisor sin copy de técnico (CA-04) | R8 | GO |
| 9. Degradación visible sin requirements[] | R9 + E2E 2 | GO |
| 10. BOLA listado verde sin tocar | R10a, R10b + vigentes sin tocar (abajo) | GO |
| 11. Sin ampliación @Roles/@Permissions | R11a (22 pares exactos), R11b | GO |
| Multi-tenancy (regla dura) | R-SCHEMA (schema por tenant + filtro tenant_id por entidad) | GO |
| Observación heredada S2 | R-S2 (deuda menor documentada, no P1) | GO con nota |

## 2. No regresión (suites vigentes, sin tocar)

| Suite | Resultado |
| --- | --- |
| `tasks` completo api (jest directo `--ci --runInBand`) | **26 suites, 564 passed** (550 heredados + 14 nuevos de esta fase) |
| BOLA vigente sin tocar: `tasks.boundary.spec.ts` + `execution-orders.controller.http.spec.ts` + `execution-orders.completion-requirements.spec.ts` | **3 suites, 86 passed** |
| `operations` completo portal (jest directo `--ci --runInBand`) | **27 suites, 364 passed** |
| E2E bandeja OT vigente (`portal-operations-bandeja-ot.spec.ts`, 15 tests) | **15 passed** |
| `eslint` sobre los 3 archivos nuevos | limpio |

## 3. Evidencia en navegador (stop/go C5, resuelve limitación L1)

- **Archivo:** `docs/quality/evidencia-OTE-20260828-001.png` (152 KB, captura
  automática del E2E 1, Chromium 1280×800, HTTP mockeado con datos
  equivalentes al seed 118 + `requirements[]` realista — misma sustitución
  declarada por fe-platform en su limitación L1, aquí ejecutada en navegador
  real como exige el stop/go).
- **Contenido verificado en la captura:** drawer `OTE-20260828-001` en
  `En progreso` con responsable `Técnico de campo`; `Checklist de
  instalación` con `Actividad de instalación: Cumplido` y dos pendientes con
  razón (`Evidencia fotográfica`, `Firma del cliente`); `Completados: 1 de 3`;
  cero renders de `No puedes iniciar esta orden` (afirmado por el test, no
  solo por la imagen).
- Nota: el badge `Cache disabled` visible abajo-izquierda es artefacto de la
  instrumentación de Playwright, no producto.

## 4. Contratos

Verificados contra `packages/shared/src/contracts/operations/` congelados y no
tocados por esta fase: `execution-orders-completion.ts` v1 +
`execution-orders.ts` v1.1 (`git status` no los lista como modificados).
