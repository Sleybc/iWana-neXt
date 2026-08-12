# PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1

## Prompt de ejecución — filtro del resumen sobre el lote cargado

**Versión:** 1.1  
**Estado:** Emitido — en ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G2 (A+B bump v1.1) → G4/G5 (C) → G6 (D) · protocolo v1.5 §3bis · **carril rápido de UI**  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B) · AI-FE-PLATFORM (C) · AI-SR-QA (D)

> Dec sobre Historial `/audit-logs`. Sustituye la decisión CA-AUD-09 «solo foco» por **filtro cliente del lote + chip obligatorio**.  
> Sin API nueva. Sin OpenAPI. Sin migraciones. Sin portal.

**Plan:** [`docs/plans/2026-08-11-web-audit-logs-filtro-resumen.md`](../plans/2026-08-11-web-audit-logs-filtro-resumen.md)

---

## 0. Identidad de sesión

1. `AGENTS.md`
2. Este prompt
3. Specs hermanas v1.0 (base) + este bump a **v1.1**
4. Skill del track (tabla §3)
5. `platform-ui-copy.ts` → `audit.*`
6. `system-vocabulary-review` para copy nuevo

---

## 1. Decisión de producto (congelada por EM-ARCH + operador)

**Opción 1 aprobada:** al clic en CTA de tarjeta del resumen (count > 0), filtrar la **tabla sobre el lote ya cargado** (entries de la página/cursor vigente), no pedirle al API un preset.

| Regla | Valor |
| --- | --- |
| Presets | `critical` · `access` · `security` · `tenants` (platform) · `actors` (tenant) |
| Predicado | **Mismas reglas** que `AuditSummary` usa para contar (severity / AUTH_ACTIONS / SECURITY∪TENANT / entityType Tenant / actores únicos → filas del actor) |
| Chip | Obligatorio mientras el preset esté activo: «Mostrando: {label} · solo esta página» + control «Quitar filtro» |
| Toggle | Segundo clic en la misma tarjeta = quitar preset |
| Reset | Cambio de ventana 24h/7d, filtro `action` servidor, fechas, pageSize, cursor/siguiente, o tab de ámbito → limpia preset |
| Empty | Tercera receta: sin filas tras preset de resumen ≠ empty de parque ≠ empty de filtros servidor |
| Foco | Tras aplicar preset, enfocar título de tabla (`tabIndex={-1}`) |
| Prohibido | Recorte silencioso sin chip; inventar `?actions=` / `severity` en API; filtrar export CSV con el preset (export sigue filtros de servidor) |

**CA-AUD-09 (reescrito):** el resumen **sí** puede recortar el lote en cliente **si y solo si** el chip de alcance («solo esta página») está visible y es descartable.

---

## 2. Contratos a bump (DoR etapa 5)

| Contrato | Dueño | Artefacto | Evento |
| --- | --- | --- | --- |
| UX Historial | A | `docs/specs/2026-08-11-web-audit-logs-historial-ux-spec.md` **v1.1** | Estado Congelado · §5 reescrito · CA-AUD-09 · empty §6 |
| DS Historial | B | `docs/specs/2026-08-11-web-audit-logs-historial-ds-contrato.md` **v1.1** | Chip `Alert`/`Badge` de preset · estados pressed de tarjeta · GO carril rápido |

C **no** escribe hasta que ambos v1.1 digan Congelado y citen este prompt.

**API:** sin cambio (sigue `action` singular en chrome de tabla).

---

## 3. Skills por track

| Track | Skills |
| --- | --- |
| A | `system-vocabulary-review`, `writing-plans` (solo si ajusta CA), perfil PROD-UX |
| B | `core-components`, `iwana-identity-ui-review`, perfil DS-OWNER |
| C | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `test-driven-development`, `system-vocabulary-review`, `iwana-identity-ui-review` |
| D | `testing-patterns`, `e2e-testing-patterns`, `wcag-audit-patterns`, `verification-before-completion` |

---

## 4. Criterios de aceptación (delta)

| ID | Criterio |
| --- | --- |
| **CA-FR-01** | Clic «Ver críticos» con count>0 filtra la tabla al predicado critical del lote. |
| **CA-FR-02** | Chip visible con copy canónico + «Quitar filtro» restaura lista completa del lote. |
| **CA-FR-03** | Segundo clic en la misma tarjeta quita el preset. |
| **CA-FR-04** | Clic en otra tarjeta cambia el preset (no acumula). |
| **CA-FR-05** | count=0 → CTA no interactivo (igual que hoy). |
| **CA-FR-06** | Cambiar `action` del chrome o ventana 24h/7d limpia el preset. |
| **CA-FR-07** | Empty de preset distinto de emptyFiltered/emptyPark (copy en `PLATFORM_UI_COPY.audit`). |
| **CA-FR-08** | Export / query URL `action` no se contaminan con el preset. |
| **CA-FR-09** | Jest: AuditSummary + page (o helper de predicado) cubren apply/clear/toggle. |
| **CA-FR-10** | axe / a11y: chip y botones con nombre accesible; sin regresión CA-AUD fila. |

---

## 5. Fuera de alcance

- Endpoint de agregación o `actions[]` en API
- Filtrar CSV con preset de resumen
- Portal, Empresas, portada, NotificationBell
- Rediseño de anatomía de las 4 tarjetas (ya restauradas)

---

## 6. Orden de ejecución

1. **A + B en paralelo** → congelan v1.1  
2. **C** → implementa contra v1.1 + plan  
3. **D** → Jest + E2E smoke + dictamen GO/NO-GO en informe vivo (adenda o bump)

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.1 | Delta filtro resumen lote + chip; reescribe CA-AUD-09 |
