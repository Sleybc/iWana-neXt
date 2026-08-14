# INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2

## Auditoría de identidad — tarjetas KPI y aire del `/dashboard` del portal

**Versión:** 1.2
**Estado:** Vigente — sucede a [v1.1](INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md) (**parcialmente vigente**: copy/a11y del nav y CTA siguen cerrados; **no** cubría este eje)
**Fecha:** 2026-08-12
**Modo activo:** Orchestrator ([perfil AI-EM-ARCH v2.4](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) Parte II)
**Autor consolidación:** AI-EM-ARCH
**Etapa:** 6 — review de experiencia ([protocolo v1.5](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §3bis)
**Prompt:** [`PROMPT-MOD02-DASHBOARD-PORTAL-AUDITORIA-DISENO-v1.2.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-AUDITORIA-DISENO-v1.2.md)
**Superficie:** `apps/portal` → `/dashboard` — eje B1 tarjetas + retícula; chrome/copy residuales v1.1 no se reabren
**Agentes:** [AI-PROD-UX](c220f137-0c01-4f21-a213-dcf378ad539b) · [AI-DS-OWNER](068dab95-73c3-4686-a44d-63d03938177d)
**Skills:** `iwana-identity-ui-review` (modo review) · `ui-ux-pro-max` (subordinada) · `docs-architect`

**Relación:** [INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0](INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) sigue el tracker G6 GO. Esta pieza no lo revierte.

---

## 1. Resumen ejecutivo

U-D2 densificó el home convirtiéndolo en **filas de 56 px**. Firma §2.1 pide un KPI con cifra de título, no una tira de lista. El operador (ADMIN, `localhost:3002/dashboard`, 1280×720) ve **cajas vacías**: siete ceros en cards de 464×56, I-7 a media pista, B2 corto junto a un B2b cuatro veces más alto.

**Pregunta de gate:** ¿las tarjetas B1 se reconocen como KPI iWana sin logo, y el primer viewport está lleno de trabajo? **No.**

**Veredicto consolidado:** **GO con cambios** — bloqueante de **contrato**, no de FE suelto. Carril rápido: **NO**. Autorizados: adenda **U-D3** + DS **v1.7**. **FE U-D3 aplicado** (adenda §6).

---

## 2. Método

### 2.1 Preguntas (no se promedian)

| Agente | Pregunta | Puntaje | Veredicto |
| --- | --- | --- | --- |
| **AI-PROD-UX** | ¿La retícula sostiene la tarea ISP o hay cajas vacías? | **76/100** | Aprobada con cambios |
| **AI-DS-OWNER** | ¿La cáscara es KPI Firma o fila TailAdmin? | **86/100** | Aprobada con cambios · carril rápido **NO** |

Puntaje consolidado (deduplicado): P0: 0 · P1: 2 (cáscara fila + hueco I-7 / grid 2 col, una causa de retícula) · P2: 1 (desbalance 8/4) · P3: 2 (B3 `max-w-4xl`; `rounded-3xl` sin token). Fórmula: `100 − 10·2 − 3·1 − 1·2` = **75/100** (banda 75–89: aceptable con mejoras; el bloqueante es de identidad del patrón KPI).

### 2.2 Evidencia

| Fuente | Resultado |
| --- | --- |
| `audit-ui.mjs` dashboard + `portal-ui.tsx` | P0/P1 deterministas **0**. Heurístico `lime-50-surface` en chip de filtro (`portal-ui.tsx:376`) **descartado**. Spinners CRM **fuera de alcance**. |
| Track A — sesión viva 1280×720 ADMIN | B1 `y=201–553`; cada KPI **464×56**; I-7 `460×56` sobre pista 936 px; B2 `619×275` vs B2b `301×1185`. Sin PII. |
| Track B — código | `portal-ui.tsx:562-646` compact fila; `DashboardClient.tsx:332-336` + `:1370` |

### 2.3 Conflicto no sintetizado (CA-AUD-02)

| Fuente | Dice |
| --- | --- |
| Firma §2.1 | KPI: eyebrow + cifra rol title + icono + delta + hueco sparkline; `PortalMetricCard` 148 px |
| U-D2 / DS v1.6 | Fila `min-h-14`, `text-xl`, sin eyebrow en card, sparkline **prohibido** |
| Código vivo | Implementa v1.6 y **rompe** Firma §2.1 |

---

## 3. Hallazgos consolidados

### P0

Ninguno.

### [P1][Identidad] La cáscara compacta es una fila, no el KPI Firma

- **Evidencia:** `portal-ui.tsx:562-566` `min-h-14 flex-row rounded-2xl`; `:605-608` cifra `text-xl` (no rol title); `:622-623` sin eyebrow en compact; `DashboardClient.tsx:1370` fuerza `density: 'compact'`. Vivo: 464×56 con cifra ~12 px de ancho.
- **Impacto:** El primer bloque de trabajo no se reconoce como KPI iWana. U-D2-04 (B2 en viewport) pasa; la tarea ISP no.
- **Recomendación:** U-D3 + DS v1.7 — KPI **vertical** `min-h-24`, cifra `text-2xl`, rótulo visible, **sin** sparkline, **sin** 148 px en home. Radio `rounded-2xl` se queda (`--radius-2xl`).
- **Esfuerzo:** L · **Dueño:** FE tras contratos. **Carril rápido: no.**

### [P1][UX] Grid de 2 columnas y hueco del 50 % (I-7)

- **Evidencia:** `DashboardClient.tsx:332-336` — un hijo → `sm:max-w-[calc(50%-0.5rem)]`. Vivo: ~476 px vacíos a la derecha de I-7. DS v1.6 §1.8 lo exigía.
- **Impacto:** Media fila ausente se lee como carga incompleta.
- **Recomendación:** Grid **hasta 4 por fila** a 1280; un hijo ocupa **una** columna, no media pista. Prohibido KPI fantasma.
- **Esfuerzo:** M (mismo acto U-D3)

### [P2][Diseño visual] Desbalance B2 8 col / B2b 4 col + `items-start`

- **Evidencia:** `DashboardClient.tsx:1416-1471`. Vivo: trabajo 619×275 vs apoyo 301×1185.
- **Impacto:** Con cola vacía el ojo se va al apoyo.
- **Recomendación:** Conservar `items-start`. U-D3 no obliga a rehacer 8/4 en el primer corte FE; se declara deuda de composición si B2 está vacío.
- **Esfuerzo:** M · no bloquea v1.7 de cáscara

### [P3] B3 `max-w-4xl` (~40 px de canal) · `rounded-3xl` en `default` sin `--radius-3xl`

Fuera del primer viewport / fuera del home compacto. No eje.

**Copy:** no fricciona la tarjeta. Nav v1.1 no se reabre.

---

## 4. Decisión EM-ARCH

```
[DESEMPATE] Área RACI: UX + DS (anatomía KPI home)
Posiciones: U-D2 fila min-h-14 vs Firma §2.1 póster 148 px.
Decisión: ni fila TailAdmin ni 148 px. KPI compacto vertical (anatomía U-D:
  min-h-24, flex-col, text-2xl, rótulo visible, sin sparkline) + grid hasta
  4/fila a 1280. Grupos de dominio = .portal-eyebrow de sección, sin max-w 50 %.
Justificación: Tracks A+B confirman ruptura. Protocolo §3bis: cambio de contrato
  se versiona; no parche FE contra v1.6.
Registro: U-D3 · DS v1.7 · este informe.
```

**Carril rápido:** NO.

**Siguiente acto FE:** [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2.md) — no ejecutado en esta fase.

---

## 5. Contratos versionados en este acto

| Artefacto | De | A |
| --- | --- | --- |
| UX spec | U-D2 | **U-D3** |
| DS | v1.6 | **v1.7** |
| HLD | v2.0.1 | sin cambio |

---

## 6. Veredicto

**GO con cambios** (sesión de auditoría). Bloqueantes: cáscara fila + retícula 2 col.

### Adenda FE / SR-QA (2026-08-12) — U-D3 aplicado

| Gate | Evidencia |
| --- | --- |
| D3-SHELL / D3-GRID / D3-SKEL / D3-TEST | `portal-ui.tsx` · `DashboardClient.tsx` · specs |
| Jest | `portal-dashboard-metric` + `DashboardClient.spec` **52/52** PASS |
| Typecheck | `pnpm --filter @iwana/portal typecheck` exit **0** |
| audit-ui | P0/P1 deterministas **0** (heurístico lime-50 en chip de filtro: descartado) |

**Dictamen FE:** **GO**. Código alineado a U-D3 + DS v1.7. Prompt densidad v1.2 marcado **Ejecutado**. G6.5 / G7 no se anticipan.
