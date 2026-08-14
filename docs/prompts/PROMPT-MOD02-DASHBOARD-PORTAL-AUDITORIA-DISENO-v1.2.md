# PROMPT-MOD02-DASHBOARD-PORTAL-AUDITORIA-DISENO-v1.2

## Prompt de ejecución — auditoría de identidad: tarjetas KPI y aire del inicio

**Versión:** 1.2
**Estado:** Emitido — autorización viva 2026-08-12
**Fecha:** 2026-08-12
**Emite:** AI-EM-ARCH (modo Orquestador)
**Etapa:** 6 — review de experiencia y calidad (protocolo v1.5 §3bis, tracks A+B; sin código FE)
**Destinatarios:** AI-PROD-UX (Track A) · AI-DS-OWNER (Track B)
**Plantilla:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (propuesta; destino de este archivo según `AGENTS.md` → Documentation Rules)

> Lo que no está aquí no entra. **No** código productivo. **No** endpoints. **No** tokens de marca. **No** reabrir navy del sidebar. **No** fusionar ni eliminar I-1…I-7. **No** G6.5/G7.

---

## 1. Objetivo exacto

Responder, con evidencia, a la pregunta de gate:

> ¿Las tarjetas B1 se reconocen como KPI iWana sin logo, y el primer viewport está lleno de trabajo (no de aire)?

Hipótesis del operador (eje, no copy/nav): las tarjetas de indicador **no coinciden** con Firma iWana y el `/dashboard` tiene **mucho espacio sin contenido**.

Tracks A+B **no sintetizan** el conflicto documental: lo puntúan.

| Fuente | Qué dice |
| --- | --- |
| Firma §2.1 / receta skill KPI | eyebrow + cifra rol `title` azul noche + icono + delta badge + hueco sparkline; `PortalMetricCard` `min-h-[148px]` |
| U-D2 / DS v1.6 home | `PortalDashboardMetric` `density='compact'`: fila `min-h-14`, `rounded-2xl`, sin eyebrow en la card, `description` `sr-only`; sparkline **prohibido** |
| Layout vivo | grupos dominio grid 1 / `sm:2`; ADMIN 4 grupos de 1–2 filas delgadas; B2/B2b `xl:grid-cols-12` + `items-start`; B3 `max-w-4xl` |

Postura: *visualmente sobrio, interactivamente denso*.

## 2. Artefactos de entrada

| Artefacto | Ruta | Versión |
| --- | --- | --- |
| UX spec | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md` | v1.0 + U-D / **U-D2** |
| DS contrato | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md` | **v1.6** |
| Firma iWana | `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` | §2.1 KPI |
| Informe v1.1 | `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md` | copy/a11y cerrados — **no** cubrió este eje |
| HLD | `docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md` | v2.0.1 — sin cambio de datos |
| Código | `apps/portal/src/components/dashboard/*` · `portal-ui.tsx` `PortalDashboardMetric` | HEAD vivo |
| URL | `http://localhost:3002/dashboard` | 375 / 768 / 1280 |

Skills: `iwana-identity-ui-review` modo **review** (rectora) · `ui-ux-pro-max` subordinada (densidad/escaneo; rechazar bento y sparkline inventado) · `system-vocabulary-review` (copy solo si fricciona la tarjeta).

## 3. Alcance

**P1 de auditoría (obligatorio):** B1 I-1…I-7; `metricGroupGridClassName`; aire B0–B3; cáscaras B2/B2b/B3 (`PortalPanel compact`, empty embebido, ficha empresa).

**P2 de auditoría:** copy + chrome de esa URL — residuales v1.1, no el eje.

**No entra:** subrutas CRM/settings; login; APIs; tokens de marca; navy sidebar; G6.5/G7; implementación FE.

## 4. Tracks (paralelo)

| Track | Agente | Pregunta | Debe puntuar |
| --- | --- | --- | --- |
| **A** | AI-PROD-UX | ¿La retícula sostiene la tarea ISP o el operador ve cajas vacías? | Primer viewport 1280 (B0 + B1 + arranque B2); grupos de 1 KPI a media columna; desbalance 8/4; B3 `max-w-4xl`; copy solo si fricciona la tarjeta |
| **B** | AI-DS-OWNER | ¿La cáscara es KPI Firma o una fila TailAdmin? | `compact` vs `PortalMetricCard` 148 px; cifra `text-xl` vs rol title; radio 2xl vs 3xl; tinte `surface-soft`; grid 2 col vs 3–4 KPI por fila; huecos de grupo |

Formato de salida: skill `iwana-identity-ui-review` modo review (resumen, puntaje fórmula, hallazgos P0–P3 con archivo:línea, veredicto). **No** código.

Evidencia mínima: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre dashboard + `portal-ui.tsx` (métrica) + código citado + captura/sesión localhost si autenticable.

## 5. Criterios de aceptación (auditoría)

| ID | Criterio |
| --- | --- |
| CA-AUD-01 | Cada hallazgo P0/P1 cita archivo:línea o viewport de captura |
| CA-AUD-02 | Conflicto Firma §2.1 vs U-D2 documentado, no sintetizado |
| CA-AUD-03 | Heurísticos del script confirmados o descartados |
| CA-AUD-04 | Veredicto A y B independientes (no promediados) |

## 6. Stop/go

**Stop:** endpoint nuevo, token de marca, reabrir navy, fusionar I-1…I-7, escribir código FE.

**Go de esta fase:** informes A+B entregados → EM-ARCH consolida `INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md`.

Si A+B confirman que `density='compact'` **rompe** Firma §2.1 o deja aire de retícula: **no** parche FE contra contrato. EM-ARCH autoriza adenda **U-D3** + DS **v1.7**. Dirección por defecto (salvo que A+B demuestren lo contrario): KPI compacto **vertical** (U-D `min-h-24`, cifra `text-2xl`, eyebrow/rótulo visibles, **sin** sparkline) en **grid de hasta 4 por fila** a 1280; grupos de dominio como eyebrow de sección **sin** forzar 2 columnas a media pista. No volver a 148 px de `PortalMetricCard` en el home.

Si el fallo es solo class-token/padding → carril rápido FE (fuera de este prompt).
