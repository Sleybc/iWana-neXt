# INFORME — Comercial UI Fase F (alertas fuera del tab Resumen)

**Versión:** 1.3  
**Fecha:** 2026-07-23  
**Estado:** **GO identidad sin deuda de proceso** — G6 + gate navegador PASS  
**Módulo:** MOD06 — Comercial  
**Rama:** `main` · H18 `61cb63bf` · H17 `7d7549d1`  
**Modo:** AI-EM-ARCH Orquestador  
**Plan:** [2026-07-23-mod06-resumen-fuera-del-tab](../plans/2026-07-23-mod06-resumen-fuera-del-tab.md)  
**Prompt:** [PROMPT-MOD06-UI-FASE-F-v1.0](../prompts/PROMPT-MOD06-UI-FASE-F-v1.0.md)  
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.2](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.2.md)

---

## Resumen ejecutivo

Fase E dejó alertas operativas útiles **dentro** del tab Resumen (H13). Fase F las eleva a `CommercialClient` sobre la barra de tabs, elimina KPIs duplicados (H14), cablea `onRetry` (H15) y alinea la description del panel (H16).

| Métrica | Pre-F | Post-F (G6 automatizado) | Post-auditoría 2ª capa |
| --- | --- | --- | --- |
| Puntaje identidad | 82/100 | 99–100 (productor; **inválido**) | **100/100** G6 SR-QA (H17+H18 cerrados; 0 P0–P3 confirmados) |
| Commercial Jest | 10/55 | 13/73 | **14 suites / 85** (dirigido) |
| Portal Jest | — | 752 | **153 / 756** |

**Corrección de proceso:** el gate de navegador (Tarea 7 paso 4) **no** es opcional; degradarlo permitió que H17/H18 pasaran. El puntaje de cierre lo debe recalcular AI-SR-QA/EM-ARCH sobre código + recorrido de tarea, nunca el productor. Un 100/100 inmediato tras un cambio estructural es señal de cobertura incompleta (mismo patrón v1.1 ≈97 → 51).

---

## Orquestación

| Rol | Agente | Resultado |
| --- | --- | --- |
| FE Tareas 1–6 | [FE-PLATFORM](5189d7d7-a1e1-4f8b-9414-09a570041c9c) | commits H13–H16 |
| G6 | [SR-QA](3df0e024-4403-47bb-b2dd-f2f3225e2708) | GO con deuda; **no sustituye** gate de navegador |
| Residual test H13 | FE | `8b77665e` |
| Docs | `aa353af9` | informe + plan + prompt |

### Commits (en `main`)

| SHA | Mensaje |
| --- | --- |
| `063f7a94` | refactor: módulo puro alertas |
| `35b3dca2` | feat: CommercialAlertsStrip |
| `0278d4ea` | fix H13: alertas sobre tabs |
| `8c95a942` | fix H14: KPIs sin duplicar alertas |
| `5aa60c03` | fix H15: onRetry |
| `a25866c1` | docs H16: description panel |
| `8b77665e` | test H13: alertas visibles con tab ≠ summary |
| `aa353af9` | docs cierre Fase F |

---

## Matriz H13–H16

| ID | Sev. | Estado |
| --- | --- | --- |
| H13 | P1 | Cerrado |
| H14 | P2 | Cerrado |
| H15 | P2 | Cerrado |
| H16 | P3 | Cerrado |

---

## Hallazgos 2ª capa (post-merge)

| ID | Sev. | Estado | Resumen |
| --- | --- | --- | --- |
| **H17** | P2 a11y | **Cerrado** (`7d7549d1`) — `PortalAlert.live` default polite; tira `live="off"` ([DS-OWNER](474a4ed2-5093-4f42-b623-e7769ea39fb8)) |
| **H18** | P2 UX | **Cerrado** (`61cb63bf`) — skeleton con `isLoading` |

---

## Deuda residual / proceso

1. ~~Gate navegador~~ → **cerrado** (sección Gate navegador).
2. Mock auth estable en specs (mitigado).

---

## Gate navegador (Tarea 7 paso 4) — ejecutado 2026-07-23

### A) E2E Chromium (summary con 3 alertas)
`e2e/tests/portal-commercial-alerts-gate.spec.ts` · **PASS**

### B) Sesión real tenant `iwana` (Chrome DevTools)
Login operativo local. Hallazgo bloqueante descubierto y corregido:

| ID | Hallazgo | Fix |
| --- | --- | --- |
| **H19** | `getDashboardSummary` unwrappeaba `.data` pero la API responde el DTO en raíz → «Indicadores no disponibles» con HTTP 200 | `returnFullResponse: true` en `api-client.ts` |

Tras el fix:

| Check | Resultado |
| --- | --- |
| Tira «Alertas operativas» sobre tabs (2 alertas reales: catálogo incompleto + huecos) | PASS |
| Visible en Planes / Compatibilidad / Tributación | PASS |
| CTA «Completar catálogo» → `?tab=plans` | PASS |
| H17: sin `role=alert/status` dentro de la tira (`live=off`) | PASS |
| Mobile ~375: tabs en primer viewport | PASS |

Comando E2E:

```bash
npx playwright test e2e/tests/portal-commercial-alerts-gate.spec.ts --config=e2e/playwright.portal.local.config.ts
```

---

## Decisión G6 + gate (EM-ARCH)

**Veredicto:** **GO identidad** tras gate real + fix H19.

- Código H13–H18: [SR-QA](500e561e-5360-4d95-adba-fc9660e89bd4) · 100/100  
- Gate navegador: PASS (E2E + sesión real)  
- H19: corregido en cliente (no era fallo del summary API)

**Credenciales de prueba:** no versionadas; solo uso operativo local.
