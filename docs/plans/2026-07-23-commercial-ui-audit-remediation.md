# Comercial UI — plan de remediación post-auditoría v1.5

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usa `executing-plans` (o `subagent-driven-development`) tarea por tarea. Pasos con checkbox (`- [ ]`).

**Objetivo:** Cerrar los 3 P1 operativos (H20–H22) y la cola Wave 1; luego consolidar DS/URL/filtros (Wave 2) y deuda DRY/code-split (Wave 3) sin rediseñar la identidad Firma iWana.

**Arquitectura:** El módulo ya usa `portal-ui` y aterriza en Planes (H19). La remediación es quirúrgica: preservar `null` de precio en el cliente tipado, deep-link `?focus=`, Dialog de borrado, y promociones de class-tokens existentes. No hay tokens de marca nuevos.

**Stack:** Next.js App Router, React 19, Tailwind v4 CSS-first, Jest + Testing Library, `portal-ui.tsx`, NestJS `PATCH` ya existente para bundles/promos.

**Informe:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5.md)  
**Prompts Wave 1:** `docs/prompts/PROMPT-MOD06-UI-OLA1-*-v1.0.md`

**Cierra (Wave 1):** H20, H21, H22 (+ H23–H25, H35–H36 como cola).

---

## Precondición

- [ ] **Paso 0: Árbol limpio o alcance acotado a commercial**

```bash
git status --short
```

Si hay cambios ajenos a commercial/docs de esta oleada, **no mezclar**. Trabajar solo archivos listados por tarea.

---

## Decisiones fijadas (EM-ARCH)

| # | Decisión | Motivo |
| --- | --- | --- |
| 1 | Deep-link `focus` es Wave 1 (no aplazable) | Sin él el gate operativo sigue NO-GO |
| 2 | Precio ausente = UI «Sin precio vigente», nunca `$0` | `missing_current_price` ya existe en dashboard |
| 3 | Delete plan = mismo Dialog destructive que productos | Paridad de riesgo irreversible |
| 4 | `PATCH` bundles/promos **ya existe en API** | Wave 2+ = FE `api-client` + formularios; no documentar inmutabilidad falsa |
| 5 | Namespace URL: `offerStatus` para ofertas vs `status` catálogo | Evita colisión `expiring` vs `ACTIVE` |
| 6 | Thead → `portalDataTableHeadRowClassName` en `portal-ui` | ≥8 usos; alias local muerto |
| 7 | No reabrir H19 / no rediseño shell | Identidad GO |

---

## Estructura de archivos (mapa)

**Wave 1 — modificar**
- `apps/portal/src/lib/api-client.ts` — tipar `currentPrice: number | null`; no coalescer a `0`
- `apps/portal/src/components/commercial/catalog/PlanCatalogPanel.tsx`
- `apps/portal/src/components/commercial/catalog/AdditionalProductsPanel.tsx`
- `apps/portal/src/components/commercial/catalog/AdditionalServicesPanel.tsx`
- `apps/portal/src/components/commercial/CommercialActivityPanel.tsx`
- `apps/portal/src/components/commercial/commercial-alerts.ts`
- `apps/portal/src/components/commercial/commercial-tab-params.ts` (+ spec)
- `apps/portal/src/components/commercial/CommercialClient.tsx` (propagar focus a paneles)
- `apps/portal/src/components/commercial/TaxCatalogManager.tsx` (chip Auto)
- `apps/portal/src/components/commercial/BundlesManager.tsx` / `PromotionsManager.tsx` (mono tabular)
- Specs correspondientes

**Wave 2 — modificar / crear**
- `apps/portal/src/components/shared/portal-ui.tsx` — `portalDataTableHeadRowClassName`
- `commercial-tab-params.ts` / `catalog-filter-params.ts` — `offerStatus`
- Filtros en `PlanCatalogPanel`
- `TaxSimulatorPanel.tsx` — quitar paneles anidados
- `docs/specs/2026-07-12-commercial-ux-spec.md` — delta post-H19 + focus
- `api-client` + managers: `updateBundle` / `updatePromotion`

**Wave 3**
- `CommercialTabLayout.tsx` — `next/dynamic`
- Extracción shells / split god-files
- Opcional: `PortalNavListRow`

---

## Wave 1 — Gate operativo (bloqueante)

**Dueños:** PROD-UX (spec delta, prompt) → FE-PLATFORM → SR-QA  
**Stop/go:** criterios del informe v1.5 § criterios Wave 1.

### Tarea W1.1 — Spec UX delta (PROD-UX)

**Archivos:**
- Modificar: `docs/specs/2026-07-12-commercial-ux-spec.md` **o** anexo corto `docs/specs/2026-07-23-commercial-ux-delta-wave1.md` si la spec congelada no debe reescribirse entera

- [ ] Documentar: precio null → copy «Sin precio vigente» (warning tonal, no lima urgencia)
- [ ] Documentar: `?tab=&focus=<uuid>` — al montar el tab, abrir side peek de edición **o** resaltar fila + scrollIntoView
- [ ] Documentar: Dialog confirm delete plan (título, cuerpo, destructive)
- [ ] Documentar: KPI Listos → `resolveCatalogIncompleteTab`
- [ ] Criterios de aceptación checklist (copiar del informe)
- [ ] Entregar a EM-ARCH para GO de spec antes de código FE

### Tarea W1.2 — Precio null en cliente y listados (H20)

**Archivos:**
- Modificar: `apps/portal/src/lib/api-client.ts` (~1293, 1315, 1329)
- Modificar: tipos de ítem catálogo usados por paneles
- Modificar: `PlanCatalogPanel.tsx`, `AdditionalProductsPanel.tsx`, `AdditionalServicesPanel.tsx`
- Test: specs de paneles / labels

- [ ] **Paso 1:** Test que falla — fila con `basePrice: null` (o `currentPrice: null`) muestra «Sin precio vigente», no `$0` / `$ 0`
- [ ] **Paso 2:** En mappers del api-client, preservar `null` cuando `currentPrice == null` (no `?? 0`)
- [ ] **Paso 3:** En celdas de precio, rama null → badge/texto warning + `font-mono` vacío o em dash tipográfico acordado en spec
- [ ] **Paso 4:** Jest verde; no romper formularios de creación (default numérico OK)

### Tarea W1.3 — Confirmación delete plan (H22)

**Archivos:**
- Modificar: `PlanCatalogPanel.tsx`
- Test: `PlanCatalogPanel.spec.tsx` (o spec existente)

- [ ] Copiar patrón Dialog de productos/servicios (`variant="destructive"`)
- [ ] Test: cancelar no llama `deletePlan`; confirmar sí
- [ ] Jest verde

### Tarea W1.4 — Deep-link `focus` (H21)

**Archivos:**
- Modificar: `commercial-tab-params.ts` (+ spec) — parse/serialize `focus`
- Modificar: `CommercialClient.tsx` / `CommercialTabLayout.tsx` — pasar `focusId` al panel activo
- Modificar: paneles catálogo + `BundlesManager` / `PromotionsManager` — al recibir focus, abrir peek o highlight
- Modificar: `CommercialActivityPanel.tsx`, `commercial-alerts.ts` — incluir id en navegación
- Modificar: KPI Listos → `resolveCatalogIncompleteTab`

- [ ] Test params: `focus` UUID válido se preserva; inválido se ignora
- [ ] Test Activity/alerts: CTA incluye focus cuando hay entity id
- [ ] Test panel: con `focus` monta peek o aplica `data-focused` / scroll
- [ ] Limpiar `focus` de URL tras consumir (replace) para no reabrir en refresh — según spec W1.1
- [ ] Jest verde

### Tarea W1.5 — Quick wins (H23–H25, H35–H36)

- [ ] `PlanCatalogPanel` error load → `PortalAlert` con action Reintentar → `loadPlans()`
- [ ] `CommercialActivityPanel` CTA first-time «Crear plan» → `variant="primary"`
- [ ] `TaxCatalogManager` chip Auto: quitar `text-[10px]`; usar `portal-eyebrow` o `text-xs`
- [ ] `BundlesManager` / `PromotionsManager`: `font-mono tabular-nums` en conteos
- [ ] Jest / visual smoke

### Tarea W1.6 — Verificación SR-QA

- [ ] `pnpm --filter @iwana/portal test` (o subset commercial)
- [ ] `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial`
- [ ] Gate navegador: precio null visible; delete dialog; focus desde Actividad/alerta; KPI tab correcto
- [ ] Informe parcial o sección en v1.6 — **GO / NO-GO** (aprobador ≠ productor FE)

**Gate Wave 1:** los 6 criterios del informe v1.5. Sin GO no iniciar Wave 2 de producto; DS thead puede prepararse en paralelo solo como PR de `portal-ui` si no bloquea.

---

## Wave 2 — Consolidación DS + URL + filtros + edit ofertas

**Dueños:** DS-OWNER (contrato thead) → FE-PLATFORM → SR-QA  
**Tras:** Wave 1 GO.

### Tarea W2.1 — `portalDataTableHeadRowClassName` (H28)

- [ ] DS-OWNER confirma valor = actual `commercialTableHeadRowClassName`
- [ ] FE añade export en `portal-ui.tsx`
- [ ] Sustituir thead repetidos en managers commercial
- [ ] Eliminar alias muerto en `commercial-field-styles.ts` (o deprecar con re-export temporal)
- [ ] Migrar imports deprecated de field-styles donde se toque el archivo

### Tarea W2.2 — Namespace `offerStatus` (H26)

- [ ] Separar query: catálogo sigue `status=ACTIVE|INACTIVE`; ofertas usan `offerStatus=expiring`
- [ ] Actualizar `commercial-alerts` / navegación
- [ ] Specs params + alerts
- [ ] No romper deep-links: alias de lectura de `status=expiring` legacy → migrar a `offerStatus` una vez

### Tarea W2.3 — Filtros Planes (H27)

- [ ] Paridad mínima con productos: `PortalSearchField` + filtro activo/inactivo (+ opcional «sin precio vigente»)
- [ ] Persistencia URL coherente con `catalog-filter-params`

### Tarea W2.4 — Densidad tablas + simulador (H29, H30)

- [ ] Unificar `tbody` divide / opacity inactivos (class-token portal si DS lo aprueba)
- [ ] `TaxSimulatorPanel`: resultados sin `PortalPanel` anidado (filas o surface soft)

### Tarea W2.5 — Spec UX post-H19 (H31)

- [ ] Actualizar spec: aterrizaje Planes, Actividad peek, Ofertas primer nivel, alertas sobre tabs, `focus`, `offerStatus`

### Tarea W2.6 — Editar combos y promociones (H34)

**Hecho verificado:** API `PATCH /commercial/bundles/:id` y `PATCH /commercial/promotions/:id` con `UpdateBundleDto` / `UpdatePromotionDto`.

Campos editables UI (mínimo):
- Bundle: `name`, `description`, `discountType`, `discountValue`, `validFrom`, `validTo`
- Promo: `name`, `description`, `validTo` (y `isActive` solo si producto lo pide; desactivar ya existe vía DELETE)

- [ ] (Opcional) Consulta rápida SR-BACKEND: restricciones de negocio en `update()` (ítems del bundle, código promo inmutable, etc.)
- [ ] Añadir `updateBundle` / `updatePromotion` en `api-client.ts`
- [ ] Side peek edición en `BundlesManager` / `PromotionsManager` (reutilizar create forms o variantes edit)
- [ ] Tests: editar fechas/nombre; no inventar campos fuera del DTO
- [ ] SR-QA smoke ofertas en riesgo → editar vigencia

**Si SR-BACKEND reporta campos no parcheables:** acotar el form; **no** documentar inmutabilidad total (contradice API).

---

## Wave 3 — Deuda ingeniería (no bloquea identidad)

**Dueños:** FE-PLATFORM (+ DS-OWNER si se formaliza `PortalNavListRow`)

### Tarea W3.1 — Code-split tabs (H33)

- [x] `next/dynamic` (o import dinámico) por `TabsContent` en `CommercialTabLayout.tsx`
- [x] Verificar que no rompe SSR/hydration del shell

### Tarea W3.2 — DRY shells (H32)

- [ ] Extraer helper interno `CommercialResourcePanel` / hooks compartidos products↔services y bundles↔promos *(opcional; diferido)*
- [x] Partir `PlanCatalogPanel` en table + form peek (+ helpers); focus DRY en catálogo
- [x] Mantener comportamiento; cobertura Jest sin regresión

### Tarea W3.3 — `PortalNavListRow` (H38, opcional)

- [x] DS-OWNER carril rápido: anatomía título + meta + trailing
- [x] FE implementa en `portal-ui` y migra `AttentionRow` / `RecentChangeRow`

### Tarea W3.4 — Limpieza field-styles (H39)

- [x] Imports directos desde `portal-ui`; eliminar archivo alias si sin consumidores

---

## Escalación ofertas (decisión cerrada)

| Opción | Estado |
| --- | --- |
| Documentar inmutabilidad + recrear | **Rechazada** — API PATCH existe |
| Nuevo contrato backend | **No necesario** para campos ya en `Update*Dto` |
| FE consume PATCH (Wave 2.6) | **Aprobada** EM-ARCH |
| Consulta SR-BACKEND | Prompt listo: [PROMPT-MOD06-UI-OFERTAS-PATCH-CONSULTA-v1.0](../prompts/PROMPT-MOD06-UI-OFERTAS-PATCH-CONSULTA-v1.0.md); pre-matriz EM-ARCH abajo |

### Pre-matriz campos (verificado en código 2026-07-23)

Fuente: `bundle.service.ts` `update` (~171–186), `promotion.service.ts` `update` (~88–100). La composición de ítems del bundle **no** está en `UpdateBundleDto` (solo create). `code` de promo **no** está en `UpdatePromotionDto`.

| Recurso | Campo | Editable vía PATCH |
| --- | --- | --- |
| Bundle | name, description, discountType, discountValue, validFrom, validTo, isActive | Sí |
| Bundle | ítems / composición | No (fuera del DTO) |
| Promo | name, description, validTo, isActive | Sí |
| Promo | code, tipo descuento, alcance, maxUses | No en Update DTO |

UI Wave 2.6 mínima: editar nombre + vigencia (+ descuento bundle). Desactivar sigue por DELETE existente.

---

## Orden de commits sugerido (Wave 1)

1. `fix(portal): preservar precio null en catálogo commercial`  
2. `fix(portal): confirmar eliminación de plan commercial`  
3. `feat(portal): deep-link focus en commercial desde alertas y actividad`  
4. `fix(portal): quick wins commercial post-auditoría v1.5`

No usar `--no-verify`. No push a main sin GO SR-QA salvo instrucción explícita del usuario.

---

## Criterio de cierre global

- [x] Wave 1 GO (SR-QA)  
- [x] Informe vivo v1.6 (cierre operativo) → v1.7 → [v1.8](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.8.md)  
- [x] Wave 2 y 3 (residual W3.2–W3.4 cerrado en v1.8; `CommercialResourcePanel` genérico opcional diferido)  
- [x] `audit-ui.mjs` commercial = 0 al cerrar cada ola
