# INFORME DE FASE — MOD12 Salidas · Captura de línea, seriales múltiples y coherencia del maestro (Fase S2)

**Versión:** 1.0
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias y Catálogo maestro
**Autor:** AI-EM-ARCH (modos EM + Orchestrator; ejecución por tracks delegada)
**Spec:** [SPEC S2 v1.0](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) *(Aprobado — G1 GO, registro en §11)*
**Plan:** [plan de orquestación S2](../plans/2026-09-05-mod12-salidas-captura-linea-seriales-multiples.md)
**Prompts:** [Maestro](../prompts/PROMPT-MOD12-SALIDAS-S2-MAESTRO-v1.0.md) · [BE](../prompts/PROMPT-MOD12-SALIDAS-S2-BE-v1.0.md) · [FE](../prompts/PROMPT-MOD12-SALIDAS-S2-FE-v1.0.md)
**Evidencia QA:** [verificación de fase](../quality/2026-09-05-mod12-s2-fase-s2-verificacion.md)
**Sucede a:** [INFORME-MOD12-SALIDAS-PICKING-S1-v1.0](INFORME-MOD12-SALIDAS-PICKING-S1-v1.0.md)
**Estado:** Fase consolidada — G6 **GO con pendientes** · G6.5 **pendiente** (2 bloqueantes de plataforma preexistentes, ajenos a S2) · G7 no aplica (fase, no cierre de módulo)

---

## 1. Entregables

| Track | Responsable | Contenido | Commit |
|---|---|---|---|
| 0 · Artefactos | AI-EM-ARCH | Spec, 3 prompts y plan con G1 incorporado | `97592083` |
| A · Coherencia del maestro | AI-SR-FULL (+ copy AI-PROD-UX) | A1 validación cruzada `itemKind`↔`trackingMode` (create/update, `safeParse` merged incluye `itemKind`), A2 guía proactiva bidireccional en drawer, A3 bloqueo de cambio con saldo/activos, A4 diagnóstico de datos **ejecutado** (1 producto inconsistente: `CFO-SER-ROGPN-TPL-XC220`, coincide con la spec) | `a21149c8` |
| B1 · Contrato | AI-SR-FULL | `serializedAssetIds[]` en `StockIssueLineSchema` con normalización singular→arreglo; contrato extendido en `@iwana/shared` | `5ffad7c0` |
| B2–B5 · Seriales múltiples | AI-SR-FULL (+ diseño migración AI-DATA-ENG) | Tabla `stock_issue_line_serials` + migración tenant 126 (backfill, enum, `updated_at`, RESTRICT), reglas por grupo (reserva/liberación/integridad keyed al tamaño del grupo), despacho con explosión N×ledger/N×eventos, lectura con `serializedAssets{id,serialNumber}`, traducción `23505`→400 | `699b1bde` |
| C · Panel lateral | AI-FE-PLATFORM | `StockIssueLineSidePeek`, apertura por clic en el nombre, tabla del borrador sin controles inline con Modificar/Quitar, grilla `lg`, pie de paginación por `meta.capabilities`, escaneo conservado, badge "falta configurar" | `f79ca1b4` |
| Remediación CI | AI-PLAT-OPS + AI-SR-FULL + AI-EM-ARCH | Specs fuera del build tsc de `shared`, mock de rol en `layout.spec.tsx`, esperas del test A3 del drawer, marcadores `(propuesto)` en citas de ADR-082 (propuesto) | `ff7025e7` · `0ef8b88d` · `e2e11b40` |

## 2. Gates

| Gate | Veredicto | Evidencia |
|---|---|---|
| **G1** | **GO CON AJUSTES** — no autofirmado. Productor AI-EM-ARCH; revisores AI-SR-FULL (factibilidad) y AI-PROD-UX (viabilidad UX + copy) | 8 ajustes incorporados antes de publicar; registro completo en [spec §11](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md). Los 2 hallazgos bloqueantes de diseño (índice parcial inimplementable; aritmética keyed al singular) se resolvieron sin cambiar el diseño de fondo |
| **Revisión de datos (migración 126)** | **APRUEBA CON AJUSTES** — AI-DATA-ENG, antes de escribirse | 4 ajustes obligatorios aplicados: backfill del singular, `issue_status` con enum, `updated_at`, FK a cabecera RESTRICT. Up/down verificados en DB local; backfill coherente (0 filas origen) |
| **G6** | **GO CON PENDIENTES** — AI-SR-QA | API 605/613 · portal 507/508 · db 253/253 · shared 104/104 (0 fallos, conteo real, sin caché). `audit-ui` P0-P2: 0. Typecheck 4/4 y lint 0 errores. Espejo de la migración reconciliada: 0 divergentes. Matriz CA-S2-01..11 con cobertura en el [archivo de evidencia](../quality/2026-09-05-mod12-s2-fase-s2-verificacion.md) |
| **G6.5** | **PENDIENTE (NO-GO para merge)** — foto histórica: corrida Linux por SHA `e2e11b40`, run [`33978689453`](https://github.com/Sleybc/iWana-neXt/actions/runs/33978689453) | Jobs **verdes** entonces: Integridad de citas ADR ✓, Build y validación de imágenes production ✓ (ambos rojos antes de esta fase). Jobs **rojos por deuda preexistente ajena a S2**: (1) `SchedulingClient.spec.tsx` — 3 tests que esperan una UI de toolbar que ya no existe (módulo scheduling; exigen rediseño de assertions — decisión de QA); (2) provisioner E2E R4.1 — `E2E_SETUP=FAILED: No se encontró el perfil 'Monitoreo operativo' en el tenant` (harness/seed; capa inalcanzable en corridas anteriores porque el build de imágenes fallaba antes). Además, el workflow separado *E2E Web Admin Smoke* es crónicamente rojo desde 2026-08-18 (bootstrap MFA admin; falla incluso en commits solo-de-docs) |
| **G6.5-S2.1** | **PENDIENTE (NO-GO para merge)** — corrida Linux por SHA `6400ddb9` (`chore(s2.1): higiene pre-G6.5`), CI run [`34030242880`](https://github.com/Sleybc/iWana-neXt/actions/runs/34030242880) + smoke run [`34030242881`](https://github.com/Sleybc/iWana-neXt/actions/runs/34030242881) — detalle en §9 | 3 de 4 jobs CI en verde sobre el mismo SHA (citas ✓, production-images ✓, lint+typecheck+build+unit con `Cached: 0 cached` ✓) + smoke admin en verde ✓. E2E R4.1 rojo por **segunda causa**: `E2E_SETUP=OK` (canon V2 + `UNIT` verificados), pero el test `1f. Cerrar OT` responde 422 y el modo serial del spec salta los 22 restantes (`PASSED=7 FAILED=1 SKIPPED=0→22 DID_NOT_RUN=0 FLAKY=0`, `E2E_CLEANUP=OK`). `[CONSULTA]` a dueños MOD09-11/SR-FULL + `[ESCALACION AL CTO]` con opciones de §7 |
| **G7** | No aplica | Fase, no cierre de módulo |

## 3. Decisiones de orquestación registradas

1. **Enmienda de contrato pre-consumo (paso 0 del track B):** la lectura expone `serializedAssets: Array<{id, serialNumber}>` en lugar de `serializedAssetIds: string[]` — autorizada por AI-EM-ARCH antes de que el track C la consumiera; no requirió re-sync (protocolo §3bis regla 1).
2. **`requestedQty` de entrada como `string | number`:** aceptado — el schema real usa `z.coerce.number()` y el FE envía números; las lecturas siguen en decimal string. Publicar `string` estricto habría sido un contrato falso.
3. **Desviación ADR-065 §9 aceptada:** la paginación del selector de captura vive en estado del composer, no en URL — es una lista efímera de un flujo de creación, no un directorio navegable. Sujeta a review futuro.
4. **Copy A3 corregido:** "Regulariza con **salidas o ajustes**" (la recepción no vacía saldo) — decisión AI-EM-ARCH sobre observación de AI-PROD-UX en G1.
5. **Alcance ampliado, justificado:** la remediación de plataforma (§1, commits `ff7025e7`/`0ef8b88d`/`e2e11b40`) no estaba en el plan; se asumió dentro de la fase porque el gate G6.5 exige CI y la CI llevaba roja desde antes de S2 por causas ajenas. Se eliminaron 4 de las 6 causas crónicas de rojo; las 2 restantes quedan documentadas con dueño.

## 4. Calidad

- **Tests nuevos S2:** ~40 (A: 29 entre unit/service/HTTP/componente; B: 14 de grupos + 13 de integridad + 5 de migración + 2 de contrato; C: 6 de SidePeek + aditivos).
- **Criterios:** CA-S2-01..11 con cobertura automatizada en verde; CA-S2-07/08/09 evidenciados además en navegador (snapshots de interacción del track C); CA-S2-11 verificado en vivo.
- **Pendientes de validación en vivo (no bloquean G6, declarados):** data-fix del operador sobre `CFO-SER-ROGPN-TPL-XC220` + entrada con seriales; sesión de navegador autorizada para el recorrido §5.4 del plan; verificación HTTP con credenciales de prueba; segunda página con >25 ítems reales.

## 5. Deuda

| Severidad | Ítem | Dueño sugerido |
|---|---|---|
| **Alta** | `itemKind` y `trackingMode` se solapan y ambos se editan — unificarlos o derivar uno requiere **ADR propio** (spec §9) | AI-EM-ARCH propone, CTO aprueba |
| **Alta** | `SchedulingClient.spec.tsx`: 3 tests rojos en CI (bloquean el job de tests) — assertions contra una toolbar que ya no existe; exigen rediseño, no parche | Dueños de scheduling + AI-SR-QA |
| **Alta** | Provisioner E2E R4.1 espera el perfil «Monitoreo operativo» que el seed no crea (bloquea el job E2E operativo) | Plataforma / dueños MOD09-MOD11 |
| Media | Workflow *E2E Web Admin Smoke* crónicamente rojo desde 2026-08-18 (bootstrap MFA) | Plataforma |
| Media | `StockIssueLine.serializedAssetId` queda como campo de transición junto a la tabla hija; retiro en fase de limpieza | MOD12 futura fase |
| Media | Recepciones y traslados siguen capturando lote/serial como texto libre | MOD12 futura fase |
| Media | E2E de navegador para la UI S2 (hoy cubierta por tests de componente) | AI-SR-QA |
| Baja | Etiqueta `REFURBISHED` ("Reacondicionado" vs "retoma") — consulta registrada a `system-vocabulary-review` | AI-PROD-UX |
| Baja | `useMinWidth` duplicado (`StockIssueComposer.tsx` / `PurchaseRequestComposer.tsx`) — plan de dedup 2026-09-01 | MOD12 |
| Baja | `InventoryCreateProductDialog` (alta) expone ambos campos sin guía proactiva; la barrera A1 de API lo cubre | MOD12 |
| Baja | Mismatches de atribución ADR-068/ADR-085 en PRDs de MOD09/MOD11/MOD12 y spec F1 (AVISOS `[revisar]`, no bloquean el gate) | Owners documentales |

## 6. Bloqueos

Ningún `[BLOQUEO]` de track durante la fase. Los stop/go del plan no se dispararon: el diagnóstico A4 confirmó un solo ítem inconsistente (volumen muy bajo del umbral), la reserva por grupo no tocó `applyDeltaWithManager`, el kardex preservó granularidad por serial y el contrato B1 bastó al FE.

## 7. Escalación

**[ESCALACIÓN AL CTO]** Prioridad: alta · Contexto: el gate G6.5 lleva imposible de cerrar desde el 2026-08-18 por deuda de plataforma ajena a las fases de producto (hoy: 2 causas precisas + 1 workflow crónico) · Opciones: (1) mini-fase de remediación de CI antes del próximo módulo (recomendada — ~1 sesión: rediseño de 3 tests de scheduling con QA + seed del perfil E2E + smoke MFA); (2) seguir acumulando fases con G6.5 pendiente y cerrar todo al final (riesgo: los bloqueantes se arrastran al primer despliegue real); (3) desacoplar formalmente el E2E Web Admin Smoke del estándar G6.5 vía ADR (requiere justificar por qué un smoke rojo no es señal de merge-readiness) · Recomendación: opción 1 · Decisión requerida antes de: iniciar la siguiente fase de MOD12.

## 8. Conclusión

La fase entrega lo que el operador pidió: la combinación contradictoria del maestro ya no es guardable ni editable con saldo, la línea de salida se configura en un panel con seriales múltiples y cantidad ligada al grupo, el borrador es revisable con Modificar, y la paginación por página reemplaza un "Cargar más" que nunca funcionó. La compatibilidad con el flujo S1 está probada (payload singular sigue despachando igual). El gate de calidad G6 está en GO con pendientes de validación en vivo del operador; G6.5 queda registrado por separado y pendiente, con sus dos bloqueantes preexistentes identificados, cuantificados y con dueño — la fase deja la CI materialmente más sana de como la encontró.

## 9. Registro G6.5 S2.1 — corrida por SHA `6400ddb9` (2026-09-06, AI-PLAT-OPS)

Higiene previa (`6400ddb9`, mensaje `chore(s2.1): higiene pre-G6.5 — registro hija, UNIT, marcador (propuesto)`): registro `StockIssueLineSerial` en `inventory.module.ts` (BE, solo inclusión verificada — entidad existe y se exporta desde `@iwana/db`), `unit`→`UNIT` en el provisioner (canon UOM verificado contra `inventory-unit-of-measure.ts` y migración 122) y marcador `(propuesto)` en la cita de ADR-082 (propuesto). Verdes locales focales antes del push: `SchedulingClient.spec` 22/22, `stock-issue-serial-groups.service.spec` 9/9, `node --check` del provisioner + gate de marcadores OK, `audit:doc-locations` 0 bloqueantes. El único bloqueante de `audit:adr-citations` en local vive en el prompt S2.1-G65 sin trackear (`(propuesto) ADR-082` antepuesto; la convención exige `ADR-082 (propuesto)`) — fuera del SHA, no afecta la corrida; EM-ARCH debe corregirlo antes de commitear los prompts.

| Dato | Valor (sanitizado: sin tokens, cookies ni payloads) |
|---|---|
| SHA | `6400ddb9b35771b50b14a9aa86a4f57bf642f3f3` (`7cb64446..6400ddb9`, en `origin/main`) |
| CI run | [`34030242880`](https://github.com/Sleybc/iWana-neXt/actions/runs/34030242880) (`push`, `main`, runner Linux X64, node v24.13.1, pnpm 10.32.1) |
| Smoke run | [`34030242881`](https://github.com/Sleybc/iWana-neXt/actions/runs/34030242881) — mismo SHA (ADR-069) |
| Job Integridad de citas ADR | success |
| Job Build y validación de imágenes production | success |
| Job Lint + Typecheck + Build + Unit tests | success — lint 8/8, typecheck 8/8, build 7/7, unit 6/6, todo con `Cached: 0 cached`; gate de cobertura verificado (CA-S2.1-G03 ✓) |
| Job E2E operativo R4.1 | **failure** — `E2E_SETUP=OK`, `E2E_CLEANUP=OK`, `E2E_TOTAL_DURATION_MS=183920` |
| Conteos Playwright (artefacto `e2e-r41-summary`, 698 bytes) | `PASSED=7 FAILED=1 SKIPPED=22 DID_NOT_RUN=0 FLAKY=0 EXIT=1 DURATION_MS=5639` (requerido: `PASSED≥30`, `FAILED=0 SKIPPED=0`) |
| Smoke Admin bootstrap | success (~1m21s); segundo verde consecutivo tras el copy-fix (CA-S2.1-G04 ✓ como señal) |
| Veredicto G6.5 | **NO-GO para merge** (E2E R4.1 rojo). Sin merge, sin despliegue. |

**Segunda causa (nueva, no relajar gates):** con el setup ya en OK (canon RBAC V2 + `UNIT` confirmados — el `E2E_SETUP=FAILED|POST /inventory/items HTTP 400` del SHA anterior desapareció), el test `1f. Cerrar OT exitosamente` (`e2e/tests/api/execution-orders-operational.spec.ts:1095`) recibe 422 con cuerpo vacío en `POST /tasks/execution-orders/:id/close`. El spec corre en modo serial (`test.describe.configure({ mode: 'serial' })` líneas 540/687): ese único fallo salta en cascada los 22 tests restantes — el `SKIPPED=22` es efecto, no causa adicional. Dominio del fallo: validación de cierre de órdenes de ejecución (MOD09-11 / backend), fuera de la superficie de plataforma.

```text
[CONSULTA] De: AI-PLAT-OPS → A: AI-SR-FULL + dueños MOD09-11
Contexto: MOD12 S2.1 / G6.5 / E2E R4.1 sobre SHA 6400ddb9 (CI run 34030242880)
Pregunta concreta: ¿por qué POST /tasks/execution-orders/:id/close responde 422 con cuerpo vacío en el test 1f con el fixture E2E (ítem UNIT, evidencia de firma registrada), y qué cambio de backend lo corrige sin tocar el gate (PASSED≥30, FAILED=0, SKIPPED=0, cleanup OK)?
Bloqueante: Sí | Supuesto mientras tanto: ninguno — no se relaja el workflow ni se reinterpreta el skip serial como verde
```

**[ESCALACION AL CTO]** Prioridad: alta · Contexto: G6.5 vuelve a quedar pendiente por deuda ajena a plataforma (primero perfiles V1 + UOM + toolbar, ahora validación de cierre en 1f) · Opciones: (1) mini-fase de remediación antes del próximo módulo (recomendada — corrección del 422 de cierre con dueños MOD09-11/SR-FULL + re-corrida G6.5); (2) seguir acumulando fases con G6.5 pendiente y cerrar todo al final (riesgo: los bloqueantes se arrastran al primer despliegue real); (3) desacoplar formalmente el E2E operativo del estándar G6.5 vía ADR (requiere justificar por qué un E2E rojo no es señal de merge-readiness) · Recomendación: opción 1 · Decisión requerida antes de: iniciar la siguiente fase de MOD12.
