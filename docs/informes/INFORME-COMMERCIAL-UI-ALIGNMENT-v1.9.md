# INFORME — Comercial UI: auditoría integral UI/UX + remediación

**Versión:** 1.9
**Fecha:** 2026-08-14
**Estado:** **GO**
**Módulo:** MOD06 — Comercial
**Modo:** Auditoría UI/UX (skill iwana-identity-ui-review, modo review) + remediación multiagente
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.8](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.8.md)
**Rama:** `feat/portal-commercial-ui-audit` (sin commit; consolidación pendiente de merge)

---

## Resumen ejecutivo

Auditoría integral de `apps/portal/src/app/dashboard/commercial` (28 archivos, 9 tabs, 8 listados cursor-based, 3 formularios). El módulo ya estaba alineado a iWana en tokens, primitives y semántica del lima (0 hallazgos deterministas del script). Se encontraron 2 P1, 6 P2 y 7 P3 — concentrados en experiencia de paginación repetida, accesibilidad de formularios y vocabulario. Todos los P1/P2 se cerraron en esta iteración con el protocolo multiagente; el puntaje pasó de 55/100 a **100/100** según la fórmula de la skill (0 hallazgos abiertos en el alcance auditado).

| Métrica | Antes | Después |
| --- | --- | --- |
| Puntaje skill | 55/100 (0 P0, 2 P1, 6 P2, 7 P3) | 100/100 |
| `audit-ui.mjs` deterministas | 0 | 0 |
| Jest módulo commercial | 114 (13 suites) | **124 (14 suites)** |
| Jest portal completo | — | 1300/1302 (1 falla preexistente, aislada) |
| Typecheck portal + ui | — | limpio |
| Lint portal / ui | — | 0 errores / 0 warnings |

---

## Agentes (protocolo multiagente)

| Rol | Entregable |
| --- | --- |
| EM-ARCH (orquestador) | Auditoría (skill iwana-identity-ui-review), informe, consolidación |
| AI-FE-PLATFORM (Track A) | 13 fixes del módulo (16 archivos) |
| AI-FE-PLATFORM (Track B) | Fix a11y + tokens de `MultiSelect` en `@iwana/ui` |
| AI-PROD-UX (Track C) | Auditoría de vocabulario visible (25 hallazgos + postura de errores de API) |
| AI-FE-PLATFORM (Track E) | 11 correcciones de vocabulario alta/media |
| AI-SR-QA (Track D) | 10 specs de regresión |

Contratos congelados respetados: `portal-ui.tsx`, `globals.css`, `commercial-tab-params.ts` (sin cambios en ninguno).

---

## Hallazgos cerrados

### P1
- **Flicker de «Cargar más»** — 6 de 7 listados reemplazaban tabla+filtros por skeleton al paginar. Separado `loading`/`loadingMore` siguiendo el patrón de `TaxCatalogManager` (Promotions, Bundles, Compatibility, TaxApplicationRules, AdditionalProducts, AdditionalServices).
- **MultiSelect sin nombre accesible ni foco** — label asociado (`useId` + `aria-labelledby`), anillo `focus-visible` en chip «Quitar» y buscador, hex de marca tokenizados (`iwana-primary`, `iwana-primary-50/100`), `z-[1200]` → `z-(--z-popover)` (ADR-075).

### P2
- Errores de campo sin `aria-describedby`/`role="alert"` → prop `error` del DS en Input/DatePicker/Select; asociación manual para textarea.
- Error de `validTo` duplicado → eliminado el residual (DatePicker ya lo muestra).
- Radiogroup «Modalidad de velocidad» sin teclado → roving tabindex + flechas + Home/End.
- Copy «1 oferta vence pronto o están…» → concordancia singular completa.
- Cambio de tab con `replace` → `push` cuando cambia `tab`; `replace` para `status`/`focus`.
- Total duplicado (header + strip) en Products/Services → eliminado badge «X total».

### P3
- `tabular-nums` en celdas de descuento; labels de formulario unificados; `formatCompactNumber` → `formatGroupedNumber`; error de `installationRule` conectado al Select; catch silencioso del simulador → `PortalAlert` warning + «Reintentar»; sugerencias `WIFI6/WIFI5` → «WiFi 6»/«WiFi 5» (solo defaults).

### Vocabulario (Track C + E)
- «tenant» → «de tu empresa»; «Override» → «Tasa personalizada»; «∞» → «Sin límite»; «Acciones destructivas» → «Eliminar plan»; «motor tributario» → «cálculo de impuestos»; «aplicaciones tributarias» → «reglas de aplicación»; «Preset del sistema» → «Definición incluida por el sistema»; fallbacks «Error al…» → «No fue posible…»; «SOHO» → «SOHO (oficina pequeña)» (solo label; key de enum intacta).

---

## Verificación

- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial packages/ui/src/components/MultiSelect.tsx --json` → **0 deterministas**.
- `pnpm --filter @iwana/portal exec jest src/components/commercial --silent` → **14 suites / 124 tests PASS**.
- `pnpm --filter @iwana/portal test` → 184/185 suites, 1300/1302. La falla (`GoodsReceiptPanel.spec.tsx:141`) es **preexistente y ajena a esta rama**: se reproduce con los cambios de esta auditoría aislados vía `git stash` (causa: trabajo MOD02 sin commit en el árbol, `portal-ui.tsx` compartido).
- Typecheck portal + `@iwana/ui`: limpio. Lint portal: 0 errores (52 warnings preexistentes ajenos). Lint `@iwana/ui`: limpio.

---

## Decisiones y consultas pendientes (no bloqueantes)

1. **[CONSULTA → AI-SR-FULL]** `meta.capabilities` (`randomAccess`/`sortableFields`) existe en el tipo pero el FE no lo consume; los 8 listados operan cursor-only por contrato actual. Decidir si se implementa paginación numerada/orden en estos recursos o se declara cursor-only permanente (ADR-065 §17).
2. **[CONSULTA → AI-SR-FULL]** Regla de errores de API: postura PROD-UX registrada — no exponer `error.message` sin canal validado (mapeo por status + fallback genérico). Requiere garantía backend de mensajes amigables; mientras tanto el comportamiento actual se conserva.
3. **[DS-OWNER]** Drift del DS detectado en Track B: `Select.tsx` `zIndex: 11000` inline, `Input.tsx` anillo huérfano en toggle de contraseña, `MultiSelect` sin `role="listbox"`/`aria-haspopup` explícitos — candidatos a contrato del carril rápido.
4. **Backlog vocabulario (baja/decidible):** «ítem(s)» por contexto, «HFC (coaxial)», flechas `↓/↑` en velocidad, «altas», «TvBox» → «TV Box», patrón `{n} activo{'s'}` → pluralización declarativa, «SOHO» también en CRM (fuera de scope del módulo).

---

## Veredicto

**GO** — auditoría integral cerrada sin rediseño: identidad iWana confirmada en el módulo, 15 hallazgos corregidos con evidencia verificada y regresión cubierta. Las consultas pendientes son de contrato backend/DS y no bloquean el módulo.

---

## Adenda de sesión 2026-08-14 — CTAs fuera del título (U-B0bis)

El responsable observó que los botones «Actividad» y «Actualizar» seguían dentro del bloque de título (`PageHeader.actions`). Aplicada al módulo Comercial la dirección congelada **U-B0bis** (spec UX del Inicio, 2026-08-13): el H1 no contiene controles; las acciones viven en la capa de contenido.

- `CommercialClient.tsx` — `PageHeader` queda solo con título + subtítulo; «Actividad» (con badge de atención) y «Actualizar» se renderizan en una fila compacta `flex flex-wrap justify-end` sobre la franja de alertas, fuera de la card del título.
- Verificado en vivo (portal :3002): `insideTitleCard: false`; navegación por tab genera entrada de historial (`?tab=taxation`).
- Jest commercial 14/14 suites · 124 tests · typecheck limpio · `audit-ui.mjs` 0 hallazgos.

