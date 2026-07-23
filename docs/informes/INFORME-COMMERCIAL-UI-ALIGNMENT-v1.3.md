# INFORME — Comercial UI Fase F (alertas fuera del tab Resumen)

**Versión:** 1.3  
**Fecha:** 2026-07-23  
**Estado:** GO Fase F (cobertura H13 cerrada; manual browser opcional)  
**Módulo:** MOD06 — Comercial  
**Rama:** `fix/mod06-resumen-fuera-del-tab` · HEAD `8b77665e`  
**Modo:** AI-EM-ARCH Orquestador  
**Plan:** [2026-07-23-mod06-resumen-fuera-del-tab](../plans/2026-07-23-mod06-resumen-fuera-del-tab.md)  
**Prompt:** [PROMPT-MOD06-UI-FASE-F-v1.0](../prompts/PROMPT-MOD06-UI-FASE-F-v1.0.md)  
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.2](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.2.md)

---

## Resumen ejecutivo

Fase E dejó alertas operativas útiles **dentro** del tab Resumen (H13). Fase F las eleva a `CommercialClient` sobre la barra de tabs, elimina KPIs duplicados (H14), cablea `onRetry` (H15) y alinea la description del panel (H16).

| Métrica | Pre-F | Post-F |
| --- | --- | --- |
| Puntaje identidad | 82/100 | **100/100** (tras aserción H13 `activeTab ≠ summary`) |
| Commercial Jest | 10/55 | **13/73** |
| Portal Jest | — | **153/751** (+1 test H13) |

---

## Orquestación

| Rol | Agente | Resultado |
| --- | --- | --- |
| FE Tareas 1–6 | [FE-PLATFORM](5189d7d7-a1e1-4f8b-9414-09a570041c9c) | 6 commits H13–H16 |
| G6 | [SR-QA](3df0e024-4403-47bb-b2dd-f2f3225e2708) | GO con deuda → residual cerrado |
| Residual test H13 | [FE-PLATFORM](5189d7d7-a1e1-4f8b-9414-09a570041c9c) | `8b77665e` |

### Commits

| SHA | Mensaje |
| --- | --- |
| `063f7a94` | refactor: módulo puro alertas |
| `35b3dca2` | feat: CommercialAlertsStrip |
| `0278d4ea` | fix H13: alertas sobre tabs |
| `8c95a942` | fix H14: KPIs sin duplicar alertas |
| `5aa60c03` | fix H15: onRetry |
| `a25866c1` | docs H16: description panel |
| `8b77665e` | test H13: alertas visibles con tab ≠ summary |

---

## Matriz H13–H16

| ID | Sev. | Estado |
| --- | --- | --- |
| H13 | P1 | **Cerrado** (+ aserción `?tab=plans`) |
| H14 | P2 | Cerrado |
| H15 | P2 | Cerrado |
| H16 | P3 | Cerrado |

---

## Deuda residual

1. **Verificación manual** (Paso 4 Tarea 7): navegador / mobile 375 / lector — opcional post-merge; no bloquea.
2. **Mock auth estable** en specs: hoist de `user` (mitigado en CommercialClient.spec).

---

## Decisión

**GO Fase F** para merge a `main`. Puntaje **100/100**.

**Impacto:** sin cambio multi-tenant/API; solo composición portal. Sin ADR.
