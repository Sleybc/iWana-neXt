# INFORME — Comercial UI: auditoría identidad + UX operativa (post-H19)

**Versión:** 1.5  
**Fecha:** 2026-07-23  
**Estado:** **Identidad GO · Operación NO-GO** hasta Wave 1 (3 P1 abiertos)  
**Módulo:** MOD06 — Comercial  
**Ruta:** `/dashboard/commercial`  
**Modo:** AI-EM-ARCH Orquestador  
**Skills:** `iwana-identity-ui-review` (modo review) · `ui-ux-pro-max` (subordinada)  
**Plan de remediación:** [2026-07-23-commercial-ui-audit-remediation](../plans/2026-07-23-commercial-ui-audit-remediation.md)  
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.4](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.4.md) (H19 cerrado)

---

## Resumen ejecutivo

Auditoría multiagente del módulo Comercial tras el cierre de H19. La superficie **se reconoce como iWana** (primitives `portal-ui`, Firma ≥4 elementos con función, script mecánico limpio). El riesgo dominante no es visual: es **fricción en remediación operativa** (precio ausente mostrado como `$0`, deep-link a entidad ausente, eliminar plan sin confirmación).

**Veredicto compuesto EM-ARCH:** *Identidad GO · Operación NO-GO hasta Wave 1.* No hay rediseño visual. No se reabre H19.

| Dimensión | Agente | Puntaje | Veredicto |
| --- | --- | --- | --- |
| Identidad / DS | [DS-OWNER](cc89b67a-ac47-4b31-b1ad-7371d2af1db7) | **91/100** | Aprobada con cambios menores |
| Ingeniería FE | [FE-PLATFORM](b6085b2a-fb0a-4c52-b950-4e838f412be7) | **~85/100** | Aceptable; deuda DRY |
| UX / IA operativa | [PROD-UX](3b49865f-efdd-46fc-8cb0-1dc297ad95e1) | **53/100** | Aprobada con cambios (3 P1) |
| Script `audit-ui.mjs` | mecánico | 0 det. / 0 heur. | Sin violaciones |

Los puntajes **no se promedian**. El gate de cierre operativo exige Wave 1 GO.

---

## Orquestación (protocolo multiagente)

| Etapa | Rol | Agente | Resultado |
| --- | --- | --- | --- |
| UX / IA | AI-PROD-UX | [PROD-UX](3b49865f-efdd-46fc-8cb0-1dc297ad95e1) | 3 P1 + 5 P2 + 2 P3; remediación operativa |
| Contrato DS | AI-DS-OWNER | [DS-OWNER](cc89b67a-ac47-4b31-b1ad-7371d2af1db7) | Firma OK; P2 thead + CTA primary; propuesta `portalDataTableHeadRowClassName` |
| Ingeniería FE | AI-FE-PLATFORM | [FE-PLATFORM](b6085b2a-fb0a-4c52-b950-4e838f412be7) | Sin P0/P1 ingeniería; DRY/god-files/code-split |
| Consolidación | AI-EM-ARCH | esta sesión | informe v1.5 + plan remediación + prompts Wave 1 |

**Desempates EM-ARCH**

1. Puntajes por dimensión, no un promedio único.  
2. Deep-link `?focus=` entra en Wave 1 (no se aplaza). Sin él el gate operativo sigue NO-GO.  
3. Edición combos/promos: **API `PATCH` ya existe** (`BundleController.update`, `PromotionController.update`); el hueco es solo portal (`api-client` + UI). No inventar inmutabilidad; Wave 2+ expone edición FE. Consulta SR-BACKEND solo para límites de `Update*Dto` si FE lo necesita.  
4. Nested tabs de tributación: **no hallazgo**.  
5. H19 permanece cerrado.

---

## Pantallas auditadas

Shell `CommercialClient` · tabs `CommercialTabLayout` · alertas · Actividad (peek) · Planes · Productos · Servicios · Combos · Promociones · Compatibilidad · Tributación (catálogo / reglas / simulador).

---

## Hallazgos consolidados

### P0

Ninguno.

### P1 (bloquean gate operativo)

| ID | Título | Evidencia | Esfuerzo | Ola |
| --- | --- | --- | --- | --- |
| H20 | Precio ausente se muestra como `$0` | `api-client.ts` `currentPrice ?? 0`; tablas `formatCurrency(basePrice)` | S–M | 1 |
| H21 | Alertas/Atención navegan al tab, no a la entidad | `CommercialActivityPanel`, `commercial-alerts.ts` | M | 1 |
| H22 | Eliminar plan sin diálogo de confirmación | `PlanCatalogPanel.tsx` `handleDeletePlan` | S | 1 |

### P2 (Wave 1 cola / Wave 2)

| ID | Título | Ola |
| --- | --- | --- |
| H23 | Error carga planes sin CTA Reintentar | 1 |
| H24 | KPI «Listos para vender» ignora tab con más incompletos | 1 |
| H25 | CTA first-time Actividad `secondary` en vez de `primary` | 1 |
| H26 | Namespace URL `status` compartido catálogo vs ofertas | 2 |
| H27 | Planes sin búsqueda/filtros (paridad productos) | 2 |
| H28 | Thead duplicado; alias `commercialTableHeadRowClassName` muerto | 2 |
| H29 | Densidad tablas inconsistente (`divide-*`, `opacity`) | 2 |
| H30 | `TaxSimulatorPanel` con `PortalPanel` anidados | 2 |
| H31 | Spec UX congelada desactualizada post-H19 | 2 |
| H32 | God-files + DRY catálogo/ofertas | 3 |
| H33 | Bundle client sin code-split por tab | 3 |
| H34 | UI sin editar combos/promos pese a `PATCH` API | 2+ |

### P3 (quick wins / deuda menor)

| ID | Título | Ola |
| --- | --- | --- |
| H35 | Chip «Auto» `text-[10px]` | 1 |
| H36 | Conteos combos/promos sin `font-mono tabular-nums` | 1 |
| H37 | Conteo triplicado badges productos/servicios | 2 (opcional) |
| H38 | Filas Actividad locales → candidato `PortalNavListRow` | 3 |
| H39 | `commercial-field-styles` aliases deprecated | 2–3 |

---

## Cumplimiento Firma (DS)

≥4 elementos con función: par tonal lima AA · mono técnico · eyebrows / escala dual · badges generativos. Sombra dual vía primitives compartidas (no invento local). Script limpio: sin hex de marca, sin `dark:bg-gray-*`, sin lima como urgencia.

---

## Criterios de aceptación Wave 1 (stop/go)

1. Ítem activo sin precio vigente muestra **«Sin precio vigente»**, nunca `$0`.  
2. «Eliminar este plan» abre **Dialog** destructive; cancelar no llama API.  
3. Desde Actividad o alerta de catálogo incompleto / oferta en riesgo: URL con `focus=<id>` **abre o resalta** la entidad.  
4. KPI «Listos para vender» usa la misma regla que `resolveCatalogIncompleteTab`.  
5. Error de carga de planes ofrece **Reintentar**.  
6. Jest commercial de paneles tocados en verde; `audit-ui.mjs` sobre commercial = 0.

---

## Olas de remediación

| Ola | Alcance | Dueños | Bloquea gate |
| --- | --- | --- | --- |
| 1 | H20–H22 + quick wins H23–H25, H35–H36 | PROD-UX (spec) → FE-PLATFORM → SR-QA | **Sí** |
| 2 | H26–H31, H34 (edit ofertas FE) | DS-OWNER (thead) → FE-PLATFORM → SR-QA | No (identidad) |
| 3 | H32–H33, H38–H39 | FE-PLATFORM (+ DS si NavListRow) | No |

Detalle ejecutable: [plan de remediación](../plans/2026-07-23-commercial-ui-audit-remediation.md).

**Prompts de ejecución**

| Ola | Prompt |
| --- | --- |
| 1 · PROD-UX | [PROMPT-MOD06-UI-OLA1-PROD-UX-v1.0](../prompts/PROMPT-MOD06-UI-OLA1-PROD-UX-v1.0.md) |
| 1 · FE-PLATFORM | [PROMPT-MOD06-UI-OLA1-FE-PLATFORM-v1.0](../prompts/PROMPT-MOD06-UI-OLA1-FE-PLATFORM-v1.0.md) |
| 1 · SR-QA | [PROMPT-MOD06-UI-OLA1-SR-QA-v1.0](../prompts/PROMPT-MOD06-UI-OLA1-SR-QA-v1.0.md) |
| 2 · DS→FE | [PROMPT-MOD06-UI-OLA2-DS-FE-v1.0](../prompts/PROMPT-MOD06-UI-OLA2-DS-FE-v1.0.md) |
| 3 · deuda FE | [PROMPT-MOD06-UI-OLA3-FE-DEUDA-v1.0](../prompts/PROMPT-MOD06-UI-OLA3-FE-DEUDA-v1.0.md) |
| Consulta PATCH ofertas | [PROMPT-MOD06-UI-OFERTAS-PATCH-CONSULTA-v1.0](../prompts/PROMPT-MOD06-UI-OFERTAS-PATCH-CONSULTA-v1.0.md) |

---

## Lo que NO es hallazgo

- Violaciones mecánicas Firma / ADR-056 dark gray.  
- Uso correcto de `PortalPanel`, `PortalSidePeek`, empty/skeleton/alert, tabs agrupados.  
- Canonicalización `?tab=summary` (cerrada en v1.4).  
- Nested tabs tributación con eyebrows.  
- Preferencias estéticas sin ancla normativa.

---

## Criterio de cierre de este informe (fase gobernanza)

- [x] Auditoría multiagente consolidada  
- [x] Veredicto compuesto Identidad GO · Operación NO-GO  
- [x] Plan remediación Wave 1–3  
- [x] Prompts de ejecución Wave 1–3 + consulta PATCH ofertas  
- [x] Decisión ofertas: FE consume PATCH existente (inmutabilidad total rechazada)  
- [ ] Wave 1 implementada + SR-QA GO (siguiente fase ejecutor)  
- [ ] Informe v1.6 de cierre operativo tras Wave 1
