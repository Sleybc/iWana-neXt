# Design — MOD06 · Deuda de alertas operativas (precio · tax rules · CTA)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.0 |
| **Estado** | **Aprobado** (usuario · 2026-07-23) |
| **Fecha** | 2026-07-23 |
| **Origen** | Remediación post gate navegador · alertas reales tenant `iwana` |
| **Aprobación de enfoque** | Usuario eligió **B** (flujo guiado regla + vinculación) · 2026-07-23 |
| **Módulo** | MOD06 Comercial · portal `/dashboard/commercial` |
| **Relacionado** | [UX Resumen/navegación](./2026-07-22-mod06-comercial-resumen-navegacion-ux.md) · [Plan resumen fuera del tab](../plans/2026-07-23-mod06-resumen-fuera-del-tab.md) |

**Postura:** cierra tres deudas que impiden al operador resolver las alertas «Catálogo incompleto» y «Huecos en reglas» desde el portal, sin SQL.

**Fuera de alcance:** rediseño visual del módulo; CRUD completo de `TaxRule` (solo create + list ya existente); cambiar la semántica G2b de cobertura tributaria (sigue siendo tenant-level: ≥1 regla activa vigente con ≥1 aplicación activa).

---

## Problema

Tras corregir datos del tenant se confirmó:

1. **Productos adicionales** no exponen precio vigente en UI ni en el client; el dashboard sí cuenta productos activos sin `catalog_price_history.is_current`.
2. **Reglas tributarias** (`tax_rules`): el DTO `CreateTaxRuleDto` existe pero no hay `POST`, ni `createRule`, ni UI de alta. La UI solo vincula aplicaciones. Además `tax_classification_id` sigue `NOT NULL` en DB aunque la tabla legacy fue eliminada (mig. 025).
3. **CTA «Completar catálogo»** hardcodea `tab: 'plans'` aunque `attentionItems.destinoTab` ya distingue `plans` \| `products` \| `services`.

---

## Decisiones

| # | Decisión | Motivo |
| --- | --- | --- |
| D1 | Precio de productos vía patrón de servicios (`POST …/prices` tras create/update) | Backend de precios ya existe; no inventar precio en DTO de ítem |
| D2 | Precio obligatorio en create/edit de producto (`basePrice ≥ 0`) | Cierra la alerta; comodato puede ser `0` |
| D3 | Enfoque **B**: un formulario crea `TaxRule` + `TaxRuleApplication` | Un solo paso cierra «Huecos en reglas» |
| D4 | Migración tenant: `tax_rules.tax_classification_id` → **nullable** | Columna legacy sin tabla; altas limpias sin UUID fantasma |
| D5 | `CreateTaxRuleDto.taxClassificationId` pasa a **opcional** | Alineado a D4 y ADR-031 (sin clasificaciones legacy) |
| D6 | CTA catálogo: `resolveCatalogIncompleteTab` por mayoría de `missing_current_price` | Cumple UX spec §Q2 («o el tipo con más incompletos»); fallback `plans` |

---

## 1. Precio en productos adicionales

### Contrato portal (`api-client`)

- Ampliar `AdditionalProduct` con `currentPrice: string | null` y `basePrice: number` (espejo de `AdditionalService`).
- Ampliar `CreateAdditionalProductDto` / `UpdateAdditionalProductDto` con `basePrice?: number` (y opcional `installationFee?: number` default 0).
- `mapCommercialProduct`: mapear `currentPrice` → `basePrice` como en servicios.
- `createAdditionalProduct` / `updateAdditionalProduct`: tras el POST/PATCH del ítem, si hay `basePrice`, llamar `setCommercialCatalogPrice`; en update tolerar 409 «precio vigente idéntico».

### UI (`AdditionalProductsPanel`)

- Form: campo «Precio base (COP)» obligatorio (`z.coerce.number().min(0)`).
- Tabla: columna «Precio vigente» (formato moneda existente del módulo).
- Copy: para comodato, permitir `0`; helper corto «En comodato puedes registrar 0 si no hay cargo recurrente.»

### Backend

Sin cambio de contrato de catálogo. Se reutiliza `POST /commercial/catalog/:id/prices`.

### Criterios de aceptación

- [ ] Crear producto con precio > 0 deja de contar en `catalogIncompleteActiveCount` tras refresh.
- [ ] Editar producto y cambiar precio actualiza el vigente (SCD).
- [ ] Producto comodato con precio `0` cuenta como sellable (tiene precio vigente).

---

## 2. Alta guiada de regla tributaria + vinculación (B)

### Migración

Nueva migración tenant numerada (siguiente libre tras la última existente):

```sql
ALTER TABLE tax_rules
  ALTER COLUMN tax_classification_id DROP NOT NULL;
```

Down: reponer `NOT NULL` solo si no hay NULLs (o fallar con mensaje claro).

### API

`POST /commercial/tax-rules`

- Roles: mismos que listado/aplicaciones (`ADMIN`, `ACCOUNTANT`, `SYSTEM_ADMIN`).
- Body: `CreateTaxRuleDto` con `taxClassificationId` **opcional**; obligatorios `taxType`, `ratePercentage`.
- Service `createRule`: resuelve `tenantId` + `createdBy` del contexto/JWT; `taxClassificationId` null si se omite; `validFrom` default now; `isActive` true.
- Response envelope `{ data: TaxRule }` coherente con el resto del controller.

Opcional en la misma request (recomendado para B):

**Opción adoptada:** endpoint de regla puro + el portal encadena `createTaxRule` → `createTaxRuleApplication` en un solo submit (transacción lógica en FE; si falla el segundo paso, mostrar error y dejar la regla creada para reintentar vínculo). No inventar endpoint compuesto salvo que SR-FULL lo pida en review.

### UI (`TaxApplicationRulesManager`)

- CTA primario existente «Vincular regla» se complementa con **«Nueva regla y vínculo»** (o el formulario de create se amplía cuando no hay reglas).
- Formulario guiado (create compuesto):
  1. Tipo (`IVA` \| `RETENTION` \| `ICA`), tasa %, prioridad, segmento/estratos/municipio opcionales, vigencia.
  2. Definición del catálogo (`taxDefinitionId`), tratamiento, override opcional.
- Submit: crea regla → crea aplicación → `load()`.
- Empty state: si `rules.length === 0`, el empty invita a este flujo (no solo «Vincular»).

### Criterios de aceptación

- [ ] Con 0 reglas, el operador puede crear cobertura y la alerta «Huecos en reglas» desaparece tras refresh del summary.
- [ ] `GET tax-rules` lista la regla nueva; la tabla de aplicaciones muestra 1 activa.
- [ ] No se requiere UUID de clasificación legacy.

---

## 3. CTA «Completar catálogo»

### Lógica (`commercial-alerts.ts`)

```ts
export function resolveCatalogIncompleteTab(
  summary: CommercialDashboardSummary,
): CommercialTab {
  const missing = summary.attentionItems.filter(
    (i) => i.reason === 'missing_current_price',
  );
  if (missing.length === 0) return 'plans';

  const counts = { plans: 0, products: 0, services: 0 };
  for (const item of missing) {
    if (item.destinoTab === 'plans') counts.plans += 1;
    else if (item.destinoTab === 'products') counts.products += 1;
    else if (item.destinoTab === 'services') counts.services += 1;
  }

  // Empate: plans > products > services (estable, documentado)
  if (counts.products > counts.plans && counts.products >= counts.services) {
    return 'products';
  }
  if (counts.services > counts.plans && counts.services > counts.products) {
    return 'services';
  }
  return 'plans';
}
```

`buildCommercialAlerts` usa `tab: resolveCatalogIncompleteTab(summary)`.

### Tests

- Mayoría products → `products`.
- Mayoría services → `services`.
- Empate plans/products → `plans`.
- Sin attention items → `plans`.

### Criterios de aceptación

- [ ] Con solo TV Box sin precio, CTA aterriza en `?tab=products`.
- [ ] Strip/Client no requieren cambios (ya navegan `alert.tab`).

---

## Orden de implementación

1. CTA + tests (FE puro, bajo riesgo).
2. Precio productos (FE + client).
3. Migración `tax_classification_id` nullable + `POST tax-rules` + UI guiada B.
4. Verificación: unit portal commercial + jest tax controller/service; smoke manual en portal.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Create regla OK + aplicación falla | Mensaje explícito; regla queda listable para «Vincular» |
| Tenants con filas que usaban UUID fantasma | Nullable no las rompe; create nuevo usa null |
| Comodato con precio 0 confunde a operadores | Helper en form; semántica dashboard no cambia |

---

## Self-review

- [x] Sin placeholders `TBD` operativos bloqueantes.
- [x] Sin contradicción con G2b (cobertura tenant-level).
- [x] Scope acotado a las 3 deudas.
- [x] Empates de CTA documentados.
- [x] DTO/migración alineados post-025.
