# PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0

## Prompt de ejecución — alinear `/audit-logs` (Historial de cambios) a Firma iWana

**Versión:** 1.0  
**Estado:** Emitido — pendiente de ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G2 (A+B congelan) → G4/G5 (C implementa) → G6 (D dictamina) · protocolo v1.5 §3bis · **carril rápido de UI**  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B) · AI-FE-PLATFORM (C) · AI-SR-QA (D)

> Sin prompt de ejecución no hay implementación. Lo que no está aquí no entra.  
> No es rediseño: las pestañas y las frases narrativas se quedan. Se alinea vocabulario, piel del resumen, a11y de fila y honestidad del filtro.

---

## 0. Identidad de sesión (obligatoria al arrancar)

Cada agente declara su rol al primer entregable. Lee antes de tocar nada:

1. `AGENTS.md`
2. Este prompt (alcance exacto)
3. [`INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md) — fuente de hallazgos y CA
4. El `SKILL.md` de su track (tabla §3)
5. Copy vivo `apps/web/src/lib/platform-ui-copy.ts` → `audit.*` (no reabrir `dashboard.status*`)
6. Vocabulario vivo `apps/web/src/lib/platform-audit-vocabulary.ts`

**Modo:** ejecución contra contratos. A y B **transcriben** el informe + §7; no inventan flujo ni tokens. C implementa la spec, no este resumen. D no implementa features.

---

## 1. Contratos

### 1.1 Ya vigentes (no reabrir)

| Contrato | Ruta | Uso en esta fase |
| --- | --- | --- |
| Auditoría Historial | [`INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md) | Hallazgos P1/P2, CA-AUD-01…10 |
| UX spec portada | [`2026-08-11-web-centro-control-portada-senal-ux-spec.md`](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md) | Tono; enlace «Abrir historial» |
| DS contrato portada | [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](../specs/2026-08-11-web-centro-control-portada-senal-ds-contrato.md) | Receta DS-S, sombras, foco, Alert |
| DS Empresas | [`2026-08-11-web-empresas-directorio-ds-contrato.md`](../specs/2026-08-11-web-empresas-directorio-ds-contrato.md) | Alert, `rounded-2xl`, sin cáscara extra inútil |
| Firma iWana | [`2026-07-12-firma-iwana-diseno-visual-design.md`](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) | Identidad; no cambiar tokens de marca |
| Copy vivo | `platform-ui-copy.ts` → `audit.title` / `loadError` / `actionLabels` / `actionVerbs` | Extender; no duplicar strings sueltos |
| Vocabulario vivo | `platform-audit-vocabulary.ts` | Frases; ampliar mapa de campos si A lo pide |

### 1.2 A congelar en esta fase (DoR de etapa 5)

Hasta que A y B dejen estos artefactos en `docs/specs/` **con versión y estado Congelado**, C **no escribe código**.

| Contrato | Dueño | Artefacto a crear | Evento de congelación |
| --- | --- | --- | --- |
| **UX spec Historial** | AI-PROD-UX | `docs/specs/2026-08-11-web-audit-logs-historial-ux-spec.md` v1.0 | Cabecera: estado **Congelado** · cita este prompt |
| **DS contrato Historial** | AI-DS-OWNER | `docs/specs/2026-08-11-web-audit-logs-historial-ds-contrato.md` v1.0 | Cabecera: estado **Congelado** · carril rápido |

### 1.3 API — congelada, sin cambio

**Sin endpoints nuevos. Sin OpenAPI. Sin migraciones. Sin `@Roles`.**

Cliente ya tipado:

```ts
platformAuditApi.list({ limit, cursor?, action?, fromDate?, toDate? })
auditApi.list({ limit, cursor?, action?, fromDate?, toDate? }, tenantSlug)
platformAuditApi.exportCsv / auditApi.exportCsv
```

No existe query `actions` (plural) ni `severity`. CA-AUD-09 se resuelve **sin** inventarlas.

Pager numerado / `meta.capabilities.randomAccess` (**ADR-065**) = **deuda declarada**. El pie sigue siendo Anterior/Siguiente por cursor + tamaño 10/20/50.

---

## 2. Objetivo

Quien abre Historial desde el centro reconoce el mismo lenguaje de producto, lee cambios en frase humana, y no se le vende un filtro que solo recorta la página actual.

### Entra

| ID | Paso | Track | Cierra |
| --- | --- | --- | --- |
| A-1 | Congelar UX spec: chrome, copy literal, modos Lectura/Detalle, resumen, empty, filtro honesto, a11y de fila, CA-AUD | A | DoR C |
| B-1 | Congelar DS: resumen, tabla `2xl`, Alert, skeleton, tabs, ventana, foco | B | DoR C |
| C-1 | Extender `PLATFORM_UI_COPY.audit` con chrome §7.2. Cero strings sueltos nuevos en JSX | C | CA-AUD-01/05 |
| C-2 | Helper de campos de producto (slug→no visible; mfaEnabled→verificación en dos pasos). Un mapa | C | CA-AUD-02 |
| C-3 | Modo `Detalle` (no Técnico). Metadata, IP, UUID, UTC solo ahí | C | CA-AUD-01/10 |
| C-4 | Quitar párrafos bajo tabs. `Alert` + `loadError` | C | CA-AUD-03/06 |
| C-5 | Fila: un control de expansión; `interactiveFocusClassName`; sin `<tr role="button">` | C | CA-AUD-07 |
| C-6 | Ventana `Últimas 24 h` / `Últimos 7 días`, `min-h-11` | C | CA-AUD-01/07 |
| C-7 | Resumen: labels §7.3, receta B, cifras mono, lima fuera, sin `secondary-50` | C | CA-AUD-08 |
| C-8 | CA-AUD-09: chip 1:1 → `action` servidor; si no hay 1:1 → solo foco a la tabla, sin recorte silencioso | C | CA-AUD-09 |
| C-9 | Descarga: copy §7.2. Filename sin `audit-logs` si A pide nombre de producto | C | CA-AUD-05 |
| C-10 | Jest: page + table + summary + vocabulary. Cubrir CA-AUD automatizables | C | G5 |
| D-1…D-8 | Trazabilidad CA, Jest, typecheck, audit-ui, E2E, axe, dictamen, informe | D | G6 |

### No entra

| Fuera | Motivo |
| --- | --- |
| Portal (`apps/portal`) | Superficie distinta (tiene su propio feed) |
| Import desde `apps/portal` | Boundary |
| Primitive nueva en `@iwana/ui` | Carril rápido |
| Tokens de marca / sidebar / canvas | Ya cerrados |
| Endpoints, OpenAPI, migraciones, agregación «Fase 5» | Contrato API intacto |
| Pager numerado ADR-065 | Deuda declarada |
| Empresas, ficha, NotificationBell, centro de control (salvo enlace cruzado de una línea) | Fuera de `/audit-logs` |
| Reabrir `dashboard.status*` | Ya congelado |
| G6.5 / G7 / commit / push | No se anticipan |

---

## 3. Skills por track

| Track | Agente | Skills (leer `SKILL.md` antes) |
| --- | --- | --- |
| A | AI-PROD-UX | `system-vocabulary-review` · `iwana-identity-ui-review` (modo review) |
| B | AI-DS-OWNER | `core-components` · `tailwind-patterns` · `iwana-identity-ui-review` · `senior-ui-systems-designer` (review, no propuesta estética nueva) |
| C | AI-FE-PLATFORM | `iwana-identity-ui-review` (modo diseño) · `frontend-dev-guidelines` · `nextjs-app-router-patterns` · `test-driven-development` · `system-vocabulary-review` · `ui-ux-pro-max` **subordinada** a identidad |
| D | AI-SR-QA | `testing-patterns` · `e2e-testing-patterns` · `playwright-skill` · `wcag-audit-patterns` · `verification-before-completion` |

`ui-ux-pro-max` no inventa paleta ni receta. Si choca con Firma iWana, gana el contrato.

---

## 4. Track A — AI-PROD-UX (congela UX spec)

**No implementa. No rediseña.** Transcribe el informe + §7 a `docs/specs/2026-08-11-web-audit-logs-historial-ux-spec.md`.

La spec v1.0 **debe** incluir, en este orden:

1. **Cabecera:** título, v1.0, estado Congelado, fecha, cita de este prompt y del informe.
2. **Persona / tarea:** operador de plataforma revisa qué cambió (plataforma o una empresa), reconoce la acción en lenguaje humano, profundiza solo si necesita detalle.
3. **Arquitectura (sin wireframe ornamental):**
   - `PageHeader`: H1 `Historial de cambios` · subtítulo ya vivo.
   - Tabs horizontales: `Cambios de plataforma` / `Cambios por empresa`. **Sin** párrafo bajo las tabs.
   - K · Resumen: 4 señales (críticos / accesos / seguridad / empresas o personas). Ventana en palabras.
   - T · Tabla: chrome (modo + filtros + descargar) + filas + pie cursor.
4. **Copy literal** §7.2. Prohibido: `tenant`, `slug`, `CSV`, `Técnico`, `Actor`, `Metadata técnica`, `24h`, `7d`, `auditoría` como H1.
5. **Modos:** Lectura (default) vs Detalle. Qué se ve en cada uno (§7.4).
6. **Filtro del resumen (CA-AUD-09):** tabla de chips → o `?action=` servidor 1:1, o foco al título de tabla. Nunca recorte cliente silencioso.
7. **Empty:** dos recetas (sin actividad ≠ sin resultados de filtro).
8. **A11y:** un H1; un control de expansión por fila; ventana ≥ 44 px; fechas `<time>`.
9. **CA-AUD-01…10** copiados del informe (no reenumerar).
10. **Fuera:** ADR-065, portal, agregación backend.

**Stop A:** si hace falta endpoint de agregación o pager numerado → `[BLOQUEO]`. No ampliar alcance.

---

## 5. Track B — AI-DS-OWNER (congela DS contrato)

**No implementa. No crea primitive `@iwana/ui`.** Carril rápido: reutilizar.

Artefacto: `docs/specs/2026-08-11-web-audit-logs-historial-ds-contrato.md` v1.0 Congelado.

**Debe** fijar:

| ID | Receta | Fuente | Qué hacer |
| --- | --- | --- | --- |
| DS-A-SUM | Resumen 4 señales | Portada DS-S / Empresas | Superficie `rounded-2xl` + `shadow-iwana-card` o tesela `rounded-3xl` + `shadow-iwana-soft`. Cifra `font-mono tabular-nums`. `SkeletonBlock`. Prohibido `animate-pulse` como receta, `text-[10px]`, `iwana-secondary-50`, delta rojo para actividad neutra |
| DS-A-TABS | Tabs de ámbito | `Tabs` `@iwana/ui` | Ya montadas; no reinventar. Activo = receta de tabs del sistema (no lima) |
| DS-A-TABLE | Cáscara tabla | Fase-1 / Empresas | `rounded-2xl` + `shadow-iwana-card`. No `rounded-xl` |
| DS-A-ROW | Fila Lectura | Firma a11y | Un botón de expansión; `interactiveFocusClassName`. Badge de acción = `Badge` si encaja; si se conservan pills locales, sin lima de urgencia |
| DS-A-ALERT | Feedback | `@iwana/ui` `Alert` | Error de listado y aviso de descarga. Prohibido caja `border-red-200` suelta |
| DS-A-WIN | Ventana 24 h / 7 d | — | `min-h-11`; activo `bg-iwana-primary text-white` (posición, no lima) |
| DS-A-EMPTY | Vacíos | Empresas empty | Dos recetas; sin CTA de alta |

**Stop B:** primitive nueva o token de marca → `[BLOQUEO]`.

---

## 6. Track C — AI-FE-PLATFORM

Arranca **solo** con A-1 y B-1 Congelados. Implementa **la UX spec + el DS contrato**.

### 6.1 Archivos previstos

| Archivo | Acción |
| --- | --- |
| `apps/web/src/lib/platform-ui-copy.ts` | Claves nuevas de chrome audit (§7.2) |
| `apps/web/src/lib/platform-audit-vocabulary.ts` (+ spec) | Helper de campo + labels; tests CA-AUD-01/02 |
| `apps/web/src/components/audit/helpers/entityLabel.ts` | Retirar o reexportar el mapa local |
| `apps/web/src/components/audit/helpers/computeDiff.ts` | `formatFieldName` lee el helper |
| `apps/web/src/components/audit/AuditSummary.tsx` (+ spec si no hay) | Copy, receta B, ventana, CA-AUD-09 |
| `apps/web/src/components/audit/AuditLogsTable.tsx` | Modo Detalle, Descargar, Alertas de export, cáscara |
| `apps/web/src/components/audit/AuditRowBasic.tsx` | Un control; sin IP/UUID/tooltip técnico |
| `apps/web/src/components/audit/AuditExpandedDetails.tsx` | Metadata solo si modo Detalle (prop) |
| `apps/web/src/app/(protected)/audit-logs/page.tsx` | Quitar párrafos; Alert; filename; CA-AUD-09 wiring |
| `apps/web/src/app/(protected)/audit-logs/page.spec.tsx` | Reescribir aserciones de copy |

No tocar: layout shell, sidebar, `/tenants`, portal, API.

### 6.2 CA-AUD-09 — contrato de comportamiento

```
Chip «Ver críticos»     → NO aplica actionSet cliente.
                         Si A elige foco: focus al título de tabla.
                         No dejar el disclaimer «solo esta página».
Chip «Ver accesos»      → action servidor no es 1:1 (varias acciones).
                         Mismo criterio: no recorte cliente, o A documenta
                         un único action (p. ej. LOGIN_FAILED) si quiere filtro real.
Chip 1:1 (si A lo lista) → setActionFilter(valor API) + reset cursor.
```

C no inventa `actions=` ni `severity=` en el cliente de listado.

### 6.3 TDD mínimo (C-10)

| Caso | Assert |
| --- | --- |
| CA-AUD-01 | DOM sin «Técnico», «CSV», «24h», «7d», «Top actores», «Metadata técnica» en Lectura |
| CA-AUD-02 | Campo `slug` no se pinta como «Slug» en Lectura |
| CA-AUD-03 | list rechazado → `loadError` + `Alert` |
| CA-AUD-05 | Botón «Descargar»; error de export canónico |
| CA-AUD-06 | Un `heading` level 1; 0 párrafos `platformSectionSubtitle` visibles |
| CA-AUD-07 | 0 `tr[role=button]`; ventana `min-h-11` |
| CA-AUD-09 | Clic «Ver críticos» no deja `filteredEntries` recortadas en silencio (o no llama `onFilterApply({ severity })`) |
| CA-AUD-10 | IP / «Timestamp UTC» ausentes en Lectura colapsada |

### 6.4 Comandos C

```
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=platform-audit-vocabulary
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=audit-logs/page.spec
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=components/audit
pnpm --filter @iwana/web typecheck
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/web/src/app/(protected)/audit-logs apps/web/src/components/audit
```

En PowerShell no expandir `(protected)` sin escape.

**Prohibido C:** commitear · primitive `@iwana/ui` · import portal · pager ADR-065 · endpoint nuevo · lima como urgencia.

---

## 7. Decisiones — no reabrir

### 7.1 Producto / arquitectura

| Asunto | Decisión |
| --- | --- |
| Superficie | Solo `apps/web` `/audit-logs` |
| Enfoque | Alinear, no rediseñar. Tabs y frases se quedan |
| Modos | Lectura (default) y Detalle. No se elimina el modo denso |
| Resumen | 4 señales. No se convierte en los 3 chips de Empresas |
| Filtro resumen | Honesto. Sin query nueva |
| Pager | Cursor + 10/20/50. ADR-065 deuda |
| URL `tenant=` / `scope=empresa` | Se mantienen (no son chrome visible) |

### 7.2 Copy de chrome (literal salvo que A documente una variante de 1 línea)

| Superficie | Texto |
| --- | --- |
| H1 | Historial de cambios (ya vivo) |
| Subtítulo | Qué cambió el equipo en empresas, accesos y la plataforma. (ya vivo) |
| Tab 1 | Cambios de plataforma |
| Tab 2 | Cambios por empresa |
| Modo diario | Lectura |
| Modo denso | Detalle |
| Descargar | Descargar |
| Exportando | Descargando… |
| Error listado | `audit.loadError` |
| Error descarga | No pudimos descargar el archivo. Reintenta en unos minutos. |
| Recorte | La descarga se limitó a 5000 cambios. |
| Ventana | Últimas 24 h · Últimos 7 días |
| Críticos | Cambios críticos |
| Accesos | Accesos |
| Seguridad | Acceso y seguridad |
| Empresas (resumen plataforma) | Empresas con cambios |
| Personas (resumen empresa) | Quién cambió |
| Empty parque | Sin actividad registrada |
| Empty filtro | Sin cambios con estos filtros |
| Filtro acción | Todas las acciones / labels de `actionLabels` |
| Expandir | Ver detalle / Ocultar |

**Prohibido en UI (Lectura):** Técnico · Básico (si A elige Lectura) · Actor · CSV · Metadata técnica · Timestamp UTC · Slug · Schema Name · Mfa Enabled · tenant · 24h · 7d · Top actores · Eventos críticos · Informativo (usar Normal u ocultar).

«Puesta en marcha» solo como verbo de historial (`actionVerbs`), no como título de pantalla.

### 7.3 Resumen (4 señales)

| Card | Label | Destino si count > 0 |
| --- | --- | --- |
| Críticos | Cambios críticos | Foco a tabla **o** nada. No `severity` cliente |
| Accesos | Accesos | Idem, salvo que A fije un `action` 1:1 |
| Seguridad | Acceso y seguridad | Idem |
| 4 plataforma | Empresas con cambios | Foco a tabla |
| 4 empresa | Quién cambió | Foco a tabla |

### 7.4 Qué va en cada modo

| Dato | Lectura | Detalle |
| --- | --- | --- |
| Frase quién + verbo + qué | sí | sí (más columnas) |
| Badge de acción / entidad | sí (humano) | sí |
| Nombre de persona/empresa | sí | sí |
| Relativo `<time>` | sí | sí + fecha completa |
| IP, UUID, requestId, user-agent, UTC | no | sí |
| Diff de campos | nombres de producto; sin slug/schema | completo |
| Copiar ID | no | sí |

---

## 8. Track D — AI-SR-QA

Arranca cuando C entregue. **No implementa UI.** Selectores por rol/nombre.

| ID | Qué |
| --- | --- |
| **D-1** | Matriz CA-AUD-01…10 ↔ test que pasa |
| **D-2** | Jest C-10 + typecheck `@iwana/web` |
| **D-3** | `audit-ui.mjs` sobre page + `components/audit`: P0/P1 deterministas = 0; `secondary-50` ausente o justificado |
| **D-4** | E2E: sidebar Historial → H1, tabs, **sin** «Técnico» ni «CSV». Tab empresa + picker visible |
| **D-5** | Viewports **375×812** y **1280×900**. Capturas `docs/quality/evidence-web-audit-logs/` (`375.png`, `1280.png`). Sin PII |
| **D-6** | Axe `wcag2a` + `wcag2aa` en `/audit-logs`. `violations = []`. Cero `tr[role=button]` |
| **D-7** | Actualizar **el mismo** informe de auditoría: sección de cierre. No crear INFORME nuevo |
| **D-8** | Dictamen GO / GO condicionado / NO-GO. G6.5/G7 no se anticipan |

---

## 9. Criterios de aceptación

Los **CA-AUD-01…10** del informe (no reenumerar).

---

## 10. Stop / go

**Stop — `[BLOQUEO]` a AI-EM-ARCH:**

- Endpoint nuevo, OpenAPI o migración
- Primitive `@iwana/ui` o token de marca
- Import `apps/portal`
- Implementar pager ADR-065
- Reabrir copy `status*` del centro
- Lima como urgencia
- Rediseñar a una sola pestaña o quitar modo Detalle

**Go (G6 de esta fase):**

- Specs A-1 y B-1 Congelados
- CA-AUD-01…10 con evidencia
- Informe actualizado (cierre), no duplicado
- Sin commit ni G6.5/G7

---

## 11. Orden de ejecución

```
A-1 ─┐
     ├─ (contratos Congelados) → C-1…C-10 → D-1…D-8 → dictamen G6
B-1 ─┘
```

A y B en paralelo. C no arranca antes. Un cambio de contrato sube a v1.1 + adenda de EM-ARCH.

---

## 12. Entregables documentales

| Quién | Artefacto |
| --- | --- |
| A | `docs/specs/2026-08-11-web-audit-logs-historial-ux-spec.md` |
| B | `docs/specs/2026-08-11-web-audit-logs-historial-ds-contrato.md` |
| C | Código + tests. Sin informe propio |
| D | Cierre en `docs/informes/INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md` + capturas `docs/quality/evidence-web-audit-logs/` |

Ningún `PROMPT-*` fuera de `docs/prompts/`.

---

## 13. Deuda declarada

1. **ADR-065** — pager numerado. Fuera.
2. **Agregación de resumen en servidor** (comentario Fase 5 en `AuditSummary`). Exige contrato API. Fuera.

---

*Emitido 2026-08-11 por AI-EM-ARCH (Orchestrator). Carril rápido de UI. G6.5 y G7 no forman parte de este prompt.*
