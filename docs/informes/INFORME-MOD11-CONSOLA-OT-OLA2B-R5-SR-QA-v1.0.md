# Informe R5 — Calidad, accesibilidad y regresión de la consola de OT (Ola 2b)

- **Versión:** 1.0
- **Fecha:** 2026-10-06
- **Estado:** **NO-GO de QA; evidencia parcial y bloqueos explícitos**
- **Agente:** AI-SR-QA (`sr-qa`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.0.md`
- **Fuentes:** plan MOD11 consola v1.2 · UX v1.1 · contrato de componente v1.0 · tablas operativas v1.2 · informes B0, R2 y R3 de Ola 2b.
- **Sin commit.** Este informe es el único archivo documental creado por R5.

## 1. Dictamen

Las verificaciones frías del portal, las pruebas focalizadas de `operations/`, la auditoría mecánica y los E2E de navegador pasan. La matriz por momento y lente, los permisos y los flujos de teclado tienen cobertura automatizada. **No emito GO:** no observé el lector de pantalla real; CA-09 no se recorrió contra el backend con una firma real y el E2E de navegador no se pudo arrancar con un servidor nuevo. Además, el historial MATERIAL no puede asociarse de forma verificable a cada requisito mientras el API no devuelva `requirementKey`.

No identifiqué un P1 visual en las capturas revisadas ni hallazgos de `audit-ui.mjs`. Eso no sustituye los gates pendientes ni declara conformidad total WCAG o readiness de producción. El p95 de R2 en un entorno compartido sigue como gate independiente.

## 2. Criterio ↔ evidencia

| Criterio | Evidencia ejecutada o inspeccionada | Resultado |
| --- | --- | --- |
| Cuatro momentos × tres lentes; acciones limitadas por `allowedActions` | `ExecutionOrderMomentContainer.spec.tsx`: matriz por estado/lente, captura permitida solo cuando el momento y la acción lo autorizan; cobertura adicional en `execution-order-moment.spec.ts`. | Cubierto en Jest frío. |
| Snapshots v1/v2 y degradación | Fixture E2E OLA 1 con snapshot v1; `execution-order-requirements.spec.ts` y `ExecutionOrderMomentContainer.spec.tsx` con snapshot v2 y falta de evaluaciones. E2E de degradación OLA 1. | Cubierto con fixtures, no con una OT real de cada versión. |
| Requisito opcional «Sin registrar» y estados textuales | `ExecutionOrderMomentContainer.spec.tsx`: «Cumplido», «Pendiente», «Sin registrar» y «Estado no disponible». | Cubierto en Jest. |
| Historial dentro de su requisito | Actividad y evidencia se verifican por clave en `ExecutionOrderMomentContainer.spec.tsx` y `ExecutionOrderEvidenceAction.spec.tsx`. `ExecutionOrderMaterialAction.spec.tsx` no puede probar atribución exacta: el modelo `ExecutionOrderItemUsage` no incluye `requirementKey`. | **No cumple para consumos cuando hay varios requisitos MATERIAL.** Deuda registrada en R3 §8–9; requiere decisión y ampliación backend, más política para registros antiguos sin procedencia. |
| Firma PNG, dimensiones, tipo, `requirementKey`, `expiresAt` y reintento del mismo asset | `ExecutionOrderSignatureCapture.spec.tsx`, `use-execution-order-evidence.spec.ts`, E2E R2 «lienzo, análisis y registro» y «si el análisis no termina… reanuda el mismo asset». | El cliente y el payload se verificaron en Chromium; la API está interceptada con `page.route`. **No demuestra que el backend real acepte el asset ni que el gate de cierre lo acepte.** |
| Controles de firma por teclado, foco, Escape y anuncios programáticos | `ExecutionOrderSignatureCapture.spec.tsx` (Tab, Enter, Espacio, región `status`/`alert`, axe); `RequirementActionSheet.spec.tsx` (Escape/foco); E2E R2 «firma: teclado y foco…»; E2E B0 «Escape devuelve foco». | Teclado/foco observados en automatización Chromium. **No equivale a lectura por NVDA, JAWS o VoiceOver.** La excepción WCAG 2.1.1 aplica solo al trazo dependiente de trayectoria. |
| Custodia bajo demanda, páginas y categoría | `use-execution-order-custody.spec.ts`, `ExecutionOrderMaterialConsole.spec.tsx` y E2E R3; comprueban que abrir la OT no consulta custodia, abrir el acto sí, y que el selector filtra los datos paginados. | Cubierto con API simulada; no ejecutado en una sesión real contra backend. |
| Refetch selectivo | `use-execution-order-refresh.spec.ts`, incluidos actividad sin releer consumos/evidencia/inventario/custodia y descarte de resultados obsoletos. | Cubierto en Jest. |
| Ventana nula en bandeja y detalle, estados abierto/terminal | `ExecutionOrdersTable.spec.tsx`, `ExecutionOrderSummary.spec.tsx`, `execution-order-window-copy.spec.ts`; tres capturas de E4 revisadas. | Cubierto en pruebas y captura existente. |

## 3. Verificaciones realizadas

Comandos desde `C:\appiw`:

| Comando | Resultado observado |
| --- | --- |
| `pnpm --filter @iwana/portal test -- src/components/operations --runInBand --no-cache` | **44 suites y 751 tests aprobados**, 0 fallidos, 0 omitidos. Corrida directa de Jest, sin Turbo y sin caché (`Cached: 0`). |
| `pnpm --filter @iwana/portal typecheck` | Exit 0. |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations --json` | Exit 0; P0=0, P1=0, P2=0, P3=0; `findings: []`. |
| `pnpm test:e2e:portal -- e2e/tests/portal-operations-consola-ot-b0.spec.ts e2e/tests/portal-operations-consola-ot-r2.spec.ts e2e/tests/portal-operations-consola-ot-r3.spec.ts e2e/tests/portal-operations-consola-ot-ola1.spec.ts` | **13/13 aprobados** en Chromium, con fixtures de consola y API simulada. |

El intento de cumplir el requisito de servidor nuevo con `PW_FORCE_FRESH_SERVER=1` terminó antes de ejecutar Playwright: `http://127.0.0.1:3002 is already used`. No detuve el proceso que ocupa el puerto porque puede ser el portal que el usuario tiene abierto. La corrida 13/13 reutilizó ese servidor local; por ello acredita comportamiento del navegador, pero no el gate de servidor nuevo.

## 4. Lector de pantalla y sesión de backend

### Lector de pantalla

No fue posible una prueba real con NVDA, JAWS o VoiceOver en este entorno. La sesión CUA de este agente mostró `apps: []` y ambos navegadores sin pestañas; intentar enlazar `http://localhost:3002/dashboard` respondió `Tab not found`. La prueba Jest con `jest-axe`, los roles ARIA, el árbol de accesibilidad del navegador y las assertions de Playwright no permiten afirmar qué voz, orden o interrupciones escucha una persona.

Pendiente una sesión manual con lector de pantalla para recorrer instrucciones de firma, controles Limpiar/Guardar/Cancelar, anuncio del análisis y errores, apertura/cierre del panel y retorno de foco. El canvas conserva únicamente la excepción del trazo por WCAG 2.1.1; botones, instrucciones, anuncios y navegación siguen siendo verificables.

### Sesión autenticada y backend

El orquestador observó en su CUA una sesión autenticada del portal real en `localhost:3002`: dashboard, bandeja `/dashboard/operations/execution-orders` y detalle de `OTE-20260828-001` con árbol de accesibilidad poblado. La OT consultada no tenía requisito MATERIAL ni una acción de escritura disponible. Esto acredita **lectura GET autenticada** de bandeja y detalle; no acredita POST de evidencia/consumo ni cierre.

Los 13 E2E de esta corrida interceptaron HTTP con `page.route`; no son pruebas contra backend real. No ejecuté `e2e/tests/api/execution-orders-operational.spec.ts`: su `beforeAll` inicia sesiones de plataforma y tenant con usuarios del entorno E2E y prepara/muta órdenes y recursos. Sin autorización para usar esas credenciales de prueba y tocar ese estado, el resultado del gate CA-09 en backend permanece desconocido. Se necesita una ejecución acordada contra tenant/base E2E y credenciales de prueba dedicadas; no usar la OT real observada para firmar, registrar o cerrar.

## 5. Revisión visual

Inspeccioné las **16 capturas existentes** de `docs/quality/mod11-ola2b/` y `docs/quality/mod11-e4/`: pre-inicio/progreso/actividad, firma (trazo, análisis, reintento, guardada y móvil/oscuro), custodia (cerrada, abierta, selector, error y vacío móvil), y ventana nula en bandeja/resumen abierto/terminal. No observé un P1 visual en los componentes. Varias capturas muestran la insignia de desarrollo «Cache disabled» sobrepuesta; se excluye como interfaz de producto. No se generó una captura nueva desde la sesión autenticada ni una comparación de píxeles con baseline.

La corrida E2E de R5 también ejecutó OLA 1 y sobrescribió temporalmente `docs/quality/evidencia-OTE-20260828-001.png`. Se repuso el blob de `HEAD` inmediatamente; el artefacto generado por esa corrida se excluye deliberadamente de la evidencia. La captura versionada queda sin diff.

## 6. Bloqueos y consultas

- **[BLOQUEO-R5-LECTOR]** Falta prueba manual con lector real; las comprobaciones de DOM/ARIA no la sustituyen.
- **[BLOQUEO-CA09-BACKEND]** Falta registrar la firma contra backend real y demostrar que el gate `close()` la acepta. La sesión disponible solo permitió GET; los E2E de R2 simulan la API.
- **[BLOQUEO-R5-SERVIDOR]** No se obtuvo servidor nuevo: el puerto 3002 estaba ocupado y no se detuvo la sesión existente.
- **[CONSULTA-HISTORIAL-MATERIAL]** El historial se repite bajo cada requisito MATERIAL porque el contrato/persistencia no conservan `requirementKey`. Backend y Producto deben decidir la extensión y el tratamiento de filas históricas sin origen.
- **[BLOQUEO-P95-R2]** Sigue faltando p95/p99 de análisis bajo carga en staging o producción, requerido por el informe R2 §12; los valores locales no cierran ese gate.

**Veredicto R5: NO-GO.** Los tests automáticos y la auditoría mecánica pasan, pero faltan evidencias y un criterio funcional del historial MATERIAL; no se recomienda cerrar R5, G6, G6.5 o G7 desde este informe. La decisión de esos gates corresponde al orquestador y debe registrarse por separado según ADR-069.
