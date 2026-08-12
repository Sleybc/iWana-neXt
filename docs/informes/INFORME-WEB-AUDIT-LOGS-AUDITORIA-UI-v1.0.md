# Review UI — Historial de cambios (`apps/web` `/audit-logs`)

**Fecha:** 2026-08-11  
**Versión:** 1.0 (+ **adenda v1.1** filtro resumen · **adenda v1.2** fuente lote resumen — ver cierre)  
**Estado:** Emitido — desbloqueante para A+B (protocolo v1.5 §3bis); delta FR **GO** (v1.1); fuente lote **GO** (v1.2)  
**Modo de sesión:** AI-EM-ARCH Orchestrator + review identidad/vocabulario  
**Prompt:** [`PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md) · delta [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md) · fuente [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md)  
**Padre (portada):** [`INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md`](INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md)  
**Hermano (Empresas):** [`INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md`](INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md)

---

## Resumen ejecutivo

Pantalla de gobierno para revisar **qué cambió** en plataforma y por empresa. La arquitectura aguanta: dos pestañas, H1 humano, frases narrativas (`describePlatformActivityLine`), filtros en URL, tamaño 10/20/50. El daño está en el **chrome todavía de auditoría técnica** (Técnico, Actor, CSV, `24h`/`7d`, Metadata técnica, Slug) y en un **resumen de 4 cards** que no es la receta ya aceptada en el centro / Empresas.

**Modo:** código  
**Script:** `audit-ui.mjs` sobre `audit-logs` + `components/audit` → 0 P0/P1 deterministas; 1 heurístico confirmado (`bg-iwana-secondary-50` en pozo de card). El script no cubre copy, `role="button"` en `<tr>` ni `text-[10px]`.  
**Puntaje:** 53/100 (P0: 0, P1: 3, P2: 5, P3: 2)

## Hallazgos críticos (P0)

Ninguno.

## Hallazgos

### [P1][Vocabulario] El modo diario sigue hablando de auditoría interna

- **Evidencia:**
  - `AuditLogsTable.tsx:206-235` — conmutador `Básico` / `Técnico`; `aria-label="Modo de vista"`.
  - `:277-285` — `Exportar CSV`, title «Exportar registros…».
  - `:193-196` — «Export limitado a 5000 registros.» / «No se pudo exportar el CSV.»
  - `AuditSummary.tsx:353-366` — botones literales `24h` / `7d`.
  - `:371-435` — «Eventos críticos», «Top actores» / «Actores — {nombre}», «Empresas activas» (colisiona con el chip Activas del directorio).
  - `AuditExpandedDetails.tsx:172-189` — «Metadata técnica», «ID de actor», «Timestamp UTC» **también en modo Básico**.
  - `computeDiff.ts:55-60` — `formatFieldName('slug')` → `Slug`; `schemaName` → `Schema Name`; `mfaEnabled` → `Mfa Enabled`.
  - `AuditRowBasic.tsx:71-73` — tooltip `Actor: … · ID {uuid}`.
  - `page.tsx:364` — filename `platform-audit-logs-…csv`.
- **Impacto:** Quien llega desde «Abrir historial» del centro no reconoce el mismo lenguaje. «Técnico», «actor», «CSV», «slug» y «metadata» son jerga de producto interno (`system-vocabulary-review`).
- **Recomendación:** Un catálogo en `PLATFORM_UI_COPY.audit`. Modo diario = `Lectura` (o sin etiqueta). Modo denso = `Detalle`. Descargar, no CSV. Ventana `Últimas 24 h` / `Últimos 7 días`. IDs y UTC solo en Detalle. Mapa de campos de producto (nombre, correo, estado, verificación en dos pasos) — no camelCase ni `slug`.
- **Esfuerzo:** S–M

### [P1][Accesibilidad] Fila clicable anidada y targets de ventana < 44 px

- **Evidencia:** `AuditRowBasic.tsx:78-89` — `<tr role="button" tabIndex={0}>` y, dentro, `:159-174` otro `<button>` Detalles/Ocultar. `AuditSummary.tsx:354-366` — chips `24h`/`7d` con `px-3 py-1` (≈ 24 px de alto).
- **Impacto:** Control anidado (axe `nested-interactive`, mismo patrón D-8 del home). La ventana temporal no cumple target táctil. El lector anuncia la fila como botón y luego otro botón.
- **Recomendación:** Un solo control de expansión por fila (`button` en la frase o chevron; el `<tr>` no es botón). Ventana `min-h-11`. Foco `interactiveFocusClassName`.
- **Esfuerzo:** S

### [P1][UX] «Ver críticos» no filtra el historial: recorta la página actual

- **Evidencia:** `AuditLogsTable.tsx:160-174` — `actionSet` / `severity` se aplican en cliente sobre `entries` ya paginadas. Pie `:393-396` admite: «El filtro del resumen aplica solo sobre esta página». El API no tiene query `actions` ni `severity`.
- **Impacto:** El operador pulsa «Ver críticos» y cree que eso es todo el historial crítico. Es el mismo defecto que el KPI filtrado del directorio (lote ≠ parque).
- **Recomendación:** Sin endpoint nuevo: o el chip del resumen **no finge filtro de listado** (solo ancla/foco a la tabla + copy honesto), o se reutiliza el filtro de acción ya existente en servidor cuando el chip mapea 1:1 (`LOGIN_FAILED`, `TENANT_SUSPENDED`, …). Prohibido dejar el texto actual como disculpa permanente.
- **Esfuerzo:** S

### [P2][Identidad] Resumen de 4 cards ad hoc

- **Evidencia:** `AuditSummary.tsx:117-203` — `rounded-xl`, `animate-pulse`, cifra `text-2xl` sin `font-mono tabular-nums`, `text-[10px]`, delta rojo = «más actividad». `:434` — `bg-iwana-secondary-50` (heurístico confirmado: pozo lima como acento de card, no de interacción).
- **Impacto:** Otra piel que SignalChips / Empresas por estado. El lima en «Top actores» no es avance. Subir accesos pinta rojo (urgencia falsa).
- **Recomendación:** Cáscara `rounded-2xl` + `shadow-iwana-card` o teselas DS-S. `SkeletonBlock`. Cifras mono. Delta: más críticos = `error`; más actividad neutra ≠ rojo. Lima fuera de urgencia. Sin `iwana-secondary-50` de fondo.
- **Esfuerzo:** S–M

### [P2][UX] Párrafos bajo las pestañas + error a mano

- **Evidencia:** `page.tsx:454-456` y `:515-518` — `text-slate-500` con subtítulo de sección. `:485-488` / `:555-558` — caja `border-red-200` en vez de `Alert`.
- **Impacto:** Prosa extra antes de la tabla; token `slate` fuera de la escala iWana; el error no usa la primitive ya canónica en Empresas.
- **Recomendación:** Quitar los párrafos (el H1 + tabs bastan). `Alert variant="error"` + `loadError`.
- **Esfuerzo:** S

### [P2][Copy] Dos diccionarios de entidad + campos crudos

- **Evidencia:** `entityLabel.ts:3-21` mapa local PascalCase; `platform-ui-copy.ts` `entityTypeLabels` en minúsculas. `formatFieldName` no consulta copy.
- **Impacto:** Misma entidad, dos sitios. Un `slug` o `schemaName` llega al modo Lectura.
- **Recomendación:** Un helper de campo/entidad desde `PLATFORM_UI_COPY.audit`. El mapa local se retira o reexporta.
- **Esfuerzo:** S

### [P2][Identidad] Tabla `rounded-xl` y spinner/`pulse` de carga

- **Evidencia:** `AuditLogsTable.tsx:203` cáscara `rounded-xl` (Firma: superficie `2xl`). Carga `:314-322` / `:347-364` `animate-pulse` suelto, no `SkeletonBlock`.
- **Recomendación:** `rounded-2xl` + `shadow-iwana-card`. Skeleton con forma de fila.
- **Esfuerzo:** S

### [P2][Seguridad UX] UUID e IP en la lectura diaria

- **Evidencia:** `AuditRowBasic.tsx:71-73`, `:148-153` (IP en fila básica si AUTH). Resumen `:258-262` puede pintar fragmento de `userId`/IP como «fallos».
- **Impacto:** Identificadores internos en el modo que debía ser humano. Riesgo de PII operativa en captura.
- **Recomendación:** Nombre visible o «Alguien del equipo». IP y UUID solo en Detalle.
- **Esfuerzo:** S

### [P3] Tipo < 12 px y cifras sin tabular

- **Evidencia:** `text-[10px]` (`AuditSummary:165`, `AuditRowBasic:155`). Cifras del resumen sin `tabular-nums`.
- **Esfuerzo:** S

### [P3] «Informativo» como criticidad

- **Evidencia:** `deriveSeverity.ts:90-92`. En producto suena a log, no a «Sin alerta».
- **Recomendación:** `Normal` o ocultar el badge en severidad info.
- **Esfuerzo:** S

## Quick wins

1. Renombrar Técnico → Detalle; CSV → Descargar; `24h`/`7d` → frases.
2. Sacar «Metadata técnica» del modo Lectura.
3. `Alert` en errores; quitar párrafos bajo tabs.
4. Fila: un solo botón de expansión.
5. Ventana temporal `min-h-11`.

## Mejoras estratégicas

- Agregación de resumen en servidor (comentario vivo en `AuditSummary`: «Fase 5»). Fuera de este carril: exige contrato API.
- Pager numerado ADR-065. Hoy: cursor + tamaño 10/20/50. Deuda declarada.

## Criterios de aceptación (si se remedia)

| ID | Criterio |
| --- | --- |
| **CA-AUD-01** | Chrome diario sin «Técnico», «Actor», «CSV», «24h», «7d», «Top actores», «Metadata técnica», «tenant», «slug». Sí: Historial, Detalle, Descargar, Últimas 24 h. |
| **CA-AUD-02** | Frases, acciones y entidades salen de `PLATFORM_UI_COPY.audit`. Campos visibles: nombre de producto, no camelCase/`Slug`/`Schema Name`. |
| **CA-AUD-03** | Error de listado = `audit.loadError` en `Alert`. |
| **CA-AUD-04** | Empty sin filtros ≠ empty con filtros. Copy ya canónico; no unificar. |
| **CA-AUD-05** | Descarga: «Descargar»; error `No pudimos descargar el archivo. Reintenta en unos minutos.`; recorte `La descarga se limitó a 5000 cambios.` |
| **CA-AUD-06** | Un H1. Tabs `Cambios de plataforma` / `Cambios por empresa`. Sin párrafo bajo las tabs. |
| **CA-AUD-07** | Un control de expansión por fila; ventana temporal ≥ 44 px; foco visible. |
| **CA-AUD-08** | Resumen: 4 señales con receta de superficie iWana; cifras mono; lima ≠ urgencia; labels §7 del prompt. |
| **CA-AUD-09** | Chip del resumen no recorta en silencio la página. O aplica filtro de acción servidor 1:1, o solo enfoca la tabla. |
| **CA-AUD-10** | IDs, IP, UTC y user-agent solo en modo Detalle. |

## Por verificar

1. Si el API envía `action` en `LOGIN` o `login` (los `Set` del resumen usan mayúsculas).
2. Contraste runtime de `text-green-500` / `text-red-500` en deltas.
3. Foco del `DatePicker` (primitive; no re-auditar salvo regresión).

## Veredicto

**Aprobada con cambios.**

No hace falta rediseñar el historial: las pestañas y las frases ya son el lugar correcto. Bloqueantes de cierre: **CA-AUD-01, CA-AUD-02, CA-AUD-07, CA-AUD-09**.

**Siguiente paso (orquestación):** prompt G4 emitido. Tracks A+B congelan specs → C implementa CA-AUD-01…10 → D dictamina G6. G6.5 / G7 no se anticipan. Agregación backend y ADR-065 quedan como deuda declarada.

## Tracks

| Rol | Dictamen |
| --- | --- |
| AI-PROD-UX | Aprobada con cambios. Bloqueantes: jerga + filtro del resumen. |
| AI-DS-OWNER | GO con deuda. Firma no rota. Resumen ≠ receta de chips. |
| AI-FE-PLATFORM | Listo para remediación FE. P1: copy, fila, filtro honesto. |

---

## Cierre G6 — Track D (2026-08-11)

**Agente:** AI-SR-QA  
**Prompt:** [`PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md) §8 Track D  
**Specs:** UX + DS Historial v1.0 Congelados. Sin endpoints nuevos. ADR-065 deuda.

### Matriz CA-AUD ↔ test

| ID | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| **CA-AUD-01** | Chrome diario sin Técnico/Actor/CSV/24h/7d/Top actores/Metadata técnica; sí Lectura/Detalle/Descargar/Últimas 24 h | Jest `AuditLogsTable.spec` · `AuditSummary.spec` · E2E D-4 | Cubierto · PASS |
| **CA-AUD-02** | Campos de producto; slug ≠ «Slug» en Lectura | Jest `platform-audit-vocabulary.spec` (`describeAuditFieldLabel`) | Cubierto · PASS |
| **CA-AUD-03** | Error listado = `loadError` en `Alert` | Jest `audit-logs/page.spec` CA-AUD-03 | Cubierto · PASS |
| **CA-AUD-04** | Empty parque ≠ empty filtro | Jest `AuditLogsTable.spec` empty park vs filtro | Cubierto · PASS |
| **CA-AUD-05** | Descargar + error/recorte canónicos | Jest `AuditLogsTable.spec` · `page.spec` CA-AUD-05 · E2E D-4 | Cubierto · PASS |
| **CA-AUD-06** | Un H1; tabs plataforma/empresa; sin párrafo bajo tabs | Jest `page.spec` CA-AUD-06 · E2E D-4/D-5 | Cubierto · PASS |
| **CA-AUD-07** | Un control de expansión; ventana `min-h-11`; 0 `tr[role=button]` | Jest `AuditLogsTable.spec` · `AuditSummary.spec` · E2E D-6 (tr + axe) | Cubierto · PASS |
| **CA-AUD-08** | Resumen 4 señales; labels §7; cifras mono; sin `secondary-50` | Jest `AuditSummary.spec` labels · audit-ui D-3 · capturas D-5 | Cubierto · PASS |
| **CA-AUD-09** | Chip resumen no recorta en silencio; solo foco a tabla | Jest `AuditSummary.spec` · `page.spec` CA-AUD-09 | Cubierto · PASS |
| **CA-AUD-10** | IP / UTC ausentes en Lectura colapsada | Jest `AuditLogsTable.spec` CA-AUD-10 | Cubierto · PASS |

CA-AUD automatizables de C-10 tienen test que pasa. El bloqueo G6 no es hueco de matriz CA, sino **D-6 axe**.

### Números reales (D-2…D-6)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Jest vocabulary | `jest --runInBand --testPathPattern=platform-audit-vocabulary --no-coverage` | **12/12** PASS · exit **0** |
| Jest page | `jest --runInBand --testPathPattern=audit-logs/page.spec --no-coverage` | **8/8** PASS · exit **0** |
| Jest components/audit | `jest --runInBand --testPathPattern=components/audit --no-coverage` | **9/9** PASS · exit **0** |
| Typecheck | `pnpm --filter @iwana/web typecheck` | exit **0** |
| audit-ui | `audit-ui.mjs` sobre `audit-logs` + `components/audit` | **0 hallazgos** (P0/P1 = 0; `secondary-50` ausente) |
| Playwright D-4/D-5/D-6 | `playwright test e2e/tests/web-audit-logs-historial.spec.ts --config e2e/playwright.web.config.ts` | **4/4** PASS |
| Axe D-6 | mismo archivo · `wcag2a` + `wcag2aa` en `/audit-logs` | `violations = []` · `tr[role=button]` = **0** |

Capturas (sin PII de correo/UUID): [`docs/quality/evidence-web-audit-logs/375.png`](../quality/evidence-web-audit-logs/375.png) · [`1280.png`](../quality/evidence-web-audit-logs/1280.png).

375: H1 + tabs + ventana en palabras + 4 señales apiladas. 1280: Lectura/Detalle/Descargar; frase narrativa; sin Técnico/CSV.

### Remediación a11y post NO-GO (mismo día)

Tras el primer dictamen NO-GO de D-6:

1. Punto de criticidad: `aria-hidden` (el badge de severidad ya lleva texto).
2. Tabs inactivas `@iwana/ui`: `text-gray-600` (AA sobre track gris).
3. `<time>` Lectura: `text-gray-500`.
4. E2E datepicker lateral alineado a copy «Sin cambios con estos filtros» y sin `title^="Actor:"`.

Re-corrido D-6: **PASS**.

### Observación

Deuda declarada intacta: ADR-065 pager numerado; agregación de resumen en servidor.

### Dictamen

**GO.** D-2…D-6 verdes. CA-AUD-01…10 con evidencia. G6.5 / G7 no se anticipan. Sin commit.

---

## Adenda v1.1 — Delta filtro del resumen (Track D / G6 §3bis)

**Fecha:** 2026-08-11  
**Agente:** AI-SR-QA  
**Prompt:** [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md)  
**Specs:** UX Historial v1.1 · DS Historial v1.1 (DS-A-CHIP) · plan `2026-08-11-web-audit-logs-filtro-resumen.md`  
**Alcance:** solo web `/audit-logs`. Sin portal/API. Sin commit.

> Conserva el historial v1.0 (cierre G6 alineación) intacto arriba. Esta adenda dictamina **solo** el delta CA-FR-01…10 / CA-AUD-09 reescrito.

### Matriz CA-FR ↔ evidencia

| ID | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| **CA-FR-01** | Ver críticos (count>0) filtra lote | Jest `AuditSummary` CA-FR-01 · `page.spec` CA-AUD-09/FR-01+02 | PASS |
| **CA-FR-02** | Chip canónico + Quitar filtro | Jest `page.spec` · E2E FR smoke | PASS |
| **CA-FR-03** | Toggle mismo CTA | Jest `AuditSummary` CA-FR-03 (`aria-pressed` → null) | PASS |
| **CA-FR-04** | Cambio de tarjeta no acumula | Jest `AuditSummary` CA-FR-04 | PASS |
| **CA-FR-05** | count=0 no interactivo | Jest `AuditSummary` CA-FR-05 | PASS |
| **CA-FR-06** | Reset al cambiar action/ventana (y fechas/size/cursor/tab en código) | Jest `page.spec` CA-FR-06 · code review `clearSummaryPreset` en handlers | PASS |
| **CA-FR-07** | Empty preset ≠ park ≠ filtros servidor | Jest `AuditLogsTable` CA-FR-07 · copy `PLATFORM_UI_COPY.audit` | PASS |
| **CA-FR-08** | Export / URL `action` sin contaminar | Jest `page.spec` CA-FR-08 · `buildExportParams` solo servidor | PASS |
| **CA-FR-09** | Jest apply/clear/toggle | Suites abajo · **34/34** | PASS |
| **CA-FR-10** | a11y nombres accesibles; sin regresión fila | E2E D-6 axe `violations=[]` · FR smoke botones por nombre · 0 `tr[role=button]` | PASS |

**CA-AUD-09 (v1.1):** recorte de lote **solo** con chip `Alert` `neutral` + «Quitar filtro». Cumple DS-A-CHIP. Superado el veredicto v1.0 «solo foco».

### Evidencia de comandos (fresca)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Jest delta | `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern="summary-presets\|AuditSummary\|audit-logs/page.spec\|AuditLogsTable" --no-coverage` | **4 suites · 34/34 PASS** · exit **0** |
| Playwright | `pnpm exec playwright test e2e/tests/web-audit-logs-historial.spec.ts --config e2e/playwright.web.config.ts` | **5/5 PASS** (D-4…D-6 + FR smoke chip+clear) · axe D-6 OK |
| audit-ui | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre `AuditSummary` · `AuditLogsTable` · `summary-presets` · `audit-logs/page.tsx` | **sin hallazgos** |

### Hallazgos

| Sev | Hallazgo | Dictamen |
| --- | --- | --- |
| — | Ningún defecto bloqueante en CA-FR / DS-A-CHIP / a11y | — |
| Deuda no bloqueante | Preset `actors` = identidad sobre el lote (todas las filas). La cifra de la tarjeta es *actores únicos*; el filtro no recorta por actor concreto. Alineado al comentario de `summary-presets` y aceptable en v1.1 (sin picker de actor). Si producto exige «solo filas del actor X», abrir follow-up UX. | **Aceptable** · no NO-GO |
| Observación E2E | Mock platform audit a −2d: CTA de seguridad requiere ventana **Últimos 7 días** en el smoke. No es defecto de producto. | Documentado |

### Skills aplicadas (lectura)

`verification-before-completion` · `testing-patterns` · `wcag-audit-patterns` (+ `iwana-identity-ui-review` vía `audit-ui.mjs`).

### Dictamen Track D (delta)

**GO.** CA-FR-01…10 con evidencia. CA-AUD-09 v1.1 cerrado (filtro cliente + chip descartable). Concern `actors` documentado como deuda aceptable. Sin `[BLOQUEO]`. Sin commit.

---

## Adenda v1.2 — Fuente del filtro = lote del resumen (Track D / G6 §3bis)

**Fecha:** 2026-08-11  
**Agente:** AI-SR-QA  
**Prompt:** [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md)  
**Specs:** UX Historial **v1.2** Congelado · DS Historial **v1.2** (DS-A-CHIP «lote del resumen» + pager oculto/disabled)  
**Alcance:** solo web `/audit-logs`. Sin portal/API. Sin commit.

> Conserva el historial v1.0 y la adenda v1.1 intactos arriba. Esta adenda dictamina **solo** el delta CA-FR-11…13 (corrección de fuente del filtro).

### Root cause verificado

En v1.1 el preset filtraba `platformTable.entries` / `tenantTable.entries` (página del pager). «Empresas con cambios» (`entityType === 'Tenant'`) podía dar **empty C falso** si Tenant solo existía en el lote `SUMMARY_LIMIT` del resumen. Fix C: con `summaryPreset` activo, `displayedEntries` = `filterEntriesInSummaryWindow(summaryEntries) ∩ matchesSummaryPreset`; pager oculto; chip «lote del resumen».

### Matriz CA-FR-11…13 ↔ evidencia

| ID | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| **CA-FR-11** | Preset `tenants` con Tenant solo en summary (no en page) → filas visibles, no empty | Jest `page.spec` «CA-FR-11+12+13» (fixture summary=Tenant+LOGIN, page=LOGIN solo → muestra Tenant) | **PASS** (barrera Jest; sin smoke E2E dedicado — mock summary≠page no cableado en helpers E2E) |
| **CA-FR-12** | Chip «lote del resumen» (no «solo esta página») | Jest `page.spec` + E2E FR smoke copy canónico · `PLATFORM_UI_COPY.audit.summaryFilterChip` | **PASS** |
| **CA-FR-13** | Clear restaura entries del pager | Jest `page.spec` clear → fila page LOGIN · E2E FR smoke Quitar filtro quita chip | **PASS** |

**Checklist adicional (encargo):**

| Check | Evidencia | Estado |
| --- | --- | --- |
| Accesos sigue funcionando | Predicado `access` en `summary-presets.spec` · CTA Accesos en `AuditSummary` · regresión FR smoke (seguridad sobre lote resumen) | **PASS** |
| Pager oculto/disabled con preset | Jest `AuditLogsTable` «summaryPresetActive oculta Anterior/Siguiente…» · E2E FR smoke count 0 Anterior/Siguiente | **PASS** |
| Empty C copy v1.2 | Jest `AuditLogsTable` CA-FR-07 «lote del resumen» | **PASS** |
| CA-FR-01…10 no regresan | Suite Jest 37/37 (incluye critical apply/clear, empty, toggle) | **PASS** |

### Evidencia de comandos (fresca — esta sesión)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Jest delta | `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern="summary-presets\|AuditSummary\|audit-logs/page.spec\|AuditLogsTable" --no-coverage` | **4 suites · 37/37 PASS** · exit **0** |
| Playwright | `pnpm exec playwright test e2e/tests/web-audit-logs-historial.spec.ts --config e2e/playwright.web.config.ts` | **5/5 PASS** (D-4…D-6 + FR smoke chip «lote del resumen» + pager oculto + clear) · axe D-6 `violations=[]` |
| audit-ui | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre `page.tsx` · `AuditLogsTable` · `AuditSummary` · `summary-presets` · `platform-ui-copy` | **sin hallazgos** |

### Barrera GO añadida (Track D)

E2E FR smoke actualizado de copy v1.1 («solo esta página») → v1.2 («lote del resumen») + assert pager oculto. **CA-FR-11** queda cubierto por Jest de integración de página (fixture explícita summary≠page); no se añadió smoke E2E de Tenant-solo-en-summary (requeriría mocks dual-limit en helpers).

### Hallazgos

| Sev | Hallazgo | Dictamen |
| --- | --- | --- |
| — | Ningún defecto bloqueante en CA-FR-11…13 / DS-A-CHIP v1.2 / a11y | — |
| Observación | Primer intento Playwright sin `--config e2e/playwright.web.config.ts` → `invalid URL` (infra de invocación, no producto). Con config web: 5/5. | Documentado |
| Deuda no bloqueante (heredada v1.1) | Preset `actors` = todas las filas del lote; cifra = actores únicos | **Aceptable** · no NO-GO |

### Skills aplicadas (lectura)

`verification-before-completion` · `testing-patterns` (+ `audit-ui.mjs` / identidad).

### Dictamen Track D (FUENTE-v1.2)

**GO.** CA-FR-11…13 con evidencia. Chip y empty alineados a UX/DS v1.2. Pager oculto con preset. Accesos/predicados sin regresión detectada. Sin `[BLOQUEO]`. Sin commit.
