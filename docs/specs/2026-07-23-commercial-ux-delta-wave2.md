# UX delta — Comercial portal · Wave 2 residual (W2.3 + W2.6)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.0 |
| **Estado** | **GO EM-ARCH pendiente** → FE-PLATFORM |
| **Fecha** | 2026-07-23 |
| **Autor** | AI-PROD-UX |
| **Módulo** | MOD06 Comercial · `/dashboard/commercial` |
| **Origen** | [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.6](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.6.md) · [plan remediación W2.3 / W2.6](../plans/2026-07-23-commercial-ui-audit-remediation.md) |
| **Spec base (no reescribir)** | [2026-07-12-commercial-ux-spec](./2026-07-12-commercial-ux-spec.md) · [delta Wave 1](./2026-07-23-commercial-ux-delta-wave1.md) |
| **Patrones de referencia** | `AdditionalProductsPanel` (filtros + URL) · `PortalSidePeek` edición en planes/productos · Dialog destructive desactivar ofertas |

**Postura:** delta quirúrgico residual Wave 2. Sin rediseño de shell, tabs, tributación ni H19. Sin tokens nuevos. Implementación: AI-FE-PLATFORM. Verificación: AI-SR-QA.

**Fuera de alcance:** densidades `tbody` (W2.4), simulación tributaria, thead (ya hecho), namespace `offerStatus` (ya hecho), spec post-H19 completa (W2.5), code-split / DRY god-files (Wave 3), composición de ítems de combo, cambio de código de promoción.

---

## 1. Filtros de planes (W2.3 / H27)

### Problema

El tab Planes lista todo el catálogo sin paridad de filtrado con Productos / Servicios. El operador no puede acotar por nombre, tecnología, estado ni planes sin precio vigente; al volver atrás pierde el contexto.

### Paridad mínima (espejo productos)

Barra de filtros encima de la tabla de planes, misma densidad y orden mental que `AdditionalProductsPanel`:

| Control | Comportamiento | Copy UI |
| --- | --- | --- |
| `PortalSearchField` | Filtra en cliente por **nombre** y **tecnología** (coincidencia parcial, sin distinguir mayúsculas) | Placeholder: **Buscar por nombre o tecnología** |
| Estado | Tres opciones: todos / activos / inactivos | Labels: **Todos**, **Activos**, **Inactivos** (nunca enums crudos) |
| Chip opcional | «Sin precio vigente» — solo planes **activos** cuyo precio vigente esté ausente (`null` / sin current), misma semántica Wave 1 | Chip: **Sin precio vigente** · removable |

Contador de resultados: paridad productos (`N de M registros` o total si no hay filtro).

Empty «sin resultados» (filtros activos) ≠ empty «primera vez» (cero planes): CTA distinta; sin resultados ofrece limpiar filtros.

### Persistencia URL

- Extender `catalog-filter-params` **o** añadir `plan-filter-params` con la misma gramática de hidratar / escribir / defaults inválidos → default.
- Query canónica sugerida (nombres técnicos; no visibles al operador):
  - `q` — texto búsqueda
  - `status` — `ALL` \| `ACTIVE` \| `INACTIVE` (mismo contrato catálogo)
  - `missingPrice=1` (o equivalente booleano) — chip «Sin precio vigente» activo
- Al cambiar filtros: `router.replace` conservando **`tab`**, **`focus`**, **`offerStatus`** y cualquier otra query ajena a planes.
- **No** reutilizar ni pisar `offerStatus` (ofertas). **No** borrar `focus` al editar filtros (solo Wave 1 lo consume al montar).
- Refresh / atrás del navegador restaura filtros; defaults omitidos de la URL cuando coinciden con el default (paridad productos).

### A11y

- Labels asociados a search y select de estado.
- Chip con nombre accesible y cierre por teclado.
- Foco no se pierde de forma errática al `replace` de URL.

---

## 2. Editar combos y promociones (W2.6 / H34)

### Problema

Solo existe flujo de **crear** en side peek. La API `PATCH` ya existe; el operador no puede corregir nombre, descuento o vigencia sin recrear. Desde «ofertas en riesgo» el deep-link Wave 1 resalta o intenta peek, pero no hay modo edición.

### Patrón

`PortalSidePeek` en modo **edición** (mismo shell que creación; título y CTA distintos). Disparadores:

| Origen | Comportamiento |
| --- | --- |
| Acción de fila / menú «Editar» | Abre peek con entidad cargada |
| Deep-link `?tab=offers&focus=<uuid>` (o tab de ofertas vigente) | Si el id es combo o promo **y** hay peek de edición: abrir en edición (regla Wave 1 §2); si no está en la página filtrada, highlight + scroll |
| Alerta / Actividad «ofertas en riesgo» | Debe emitir `focus` cuando haya id; al aterrizar, preferir peek edición de vigencia |

### Campos editables mínimos

#### Combo (bundle)

| Campo | UI | Notas |
| --- | --- | --- |
| Nombre | Texto requerido | |
| Descripción | Texto opcional | |
| Tipo de descuento | Select con labels amigables (p. ej. porcentaje / monto fijo) | No mostrar enums técnicos |
| Valor de descuento | Número coherente con el tipo | Validación existente de create |
| Vigente desde | Fecha | |
| Vigente hasta | Fecha | Relación desde ≤ hasta |

**Fuera del form de edición:** composición de ítems del combo (no está en `UpdateBundleDto`). En peek, mostrar ítems en **solo lectura** si ya se listan en create/detalle; sin CTA «agregar/quitar ítem» en edición.

#### Promoción

| Campo | UI | Notas |
| --- | --- | --- |
| Nombre | Texto requerido | |
| Descripción | Texto opcional | |
| Vigente hasta | Fecha | Extender / acortar vigencia es el caso «en riesgo» |
| Código | Solo lectura | Inmutable; visible para contexto, no editable |

**Fuera del form:** tipo de descuento, alcance, máximos de uso, código (no están en `UpdatePromotionDto`).

### Acciones y copy

| Elemento | Spec |
| --- | --- |
| Título peek combo | Editar combo |
| Título peek promo | Editar promoción |
| CTA primaria | **Guardar** · loading mientras `PATCH` |
| Cancelar / cerrar | Descarta cambios no guardados (mismo contrato peek create) |
| Éxito | Cerrar peek; refrescar listado; sin toast ruidoso salvo patrón existente |
| Error API | `PortalAlert` en el peek; no cerrar |
| Desactivar | Sigue siendo **DELETE** vía Dialog destructive existente («Desactivar combo» / «Desactivar promoción») — **no** sustituir por toggle `isActive` en este delta |

### Prohibido

- Documentar «inmutabilidad total» de combos/promos (contradice API).
- Inventar campos fuera del DTO de update.
- Abrir solo create cuando el origen pide editar vigencia con `focus`.

---

## 3. Criterios de aceptación (checklist · SR-QA)

Verificables por AI-SR-QA / gate operativo Wave 2 residual:

- [ ] **CA1** — En Planes, `PortalSearchField` filtra por nombre **y** tecnología; placeholder «Buscar por nombre o tecnología».
- [ ] **CA2** — Filtro de estado muestra **Todos / Activos / Inactivos**; oculta el conjunto contrario sin exponer enums.
- [ ] **CA3** — Chip opcional **Sin precio vigente** deja solo activos sin precio current; removable; copy canónica Wave 1.
- [ ] **CA4** — Filtros de planes persisten en URL; refresh/atrás los restaura; **`tab` / `focus` / `offerStatus` no se rompen** al filtrar.
- [ ] **CA5** — Empty filtrado ≠ empty primera vez; limpiar filtros restaura el listado.
- [ ] **CA6** — Desde fila de combo/promo, **Editar** abre side peek con campos mínimos editables (combo: nombre, descripción, tipo/valor descuento, fechas; promo: nombre, descripción, vigente hasta).
- [ ] **CA7** — Código de promoción visible y **no editable**; composición de ítems de combo **no editable** en peek de edición.
- [ ] **CA8** — **Guardar** llama `PATCH` y refresca; error se muestra en peek sin cerrar.
- [ ] **CA9** — **Desactivar** sigue por Dialog + DELETE (no se reemplaza por editar `isActive` en este wave).
- [ ] **CA10** — Desde «ofertas en riesgo» / Actividad con id: URL con `focus` abre peek de **edición** cuando la entidad está en el listado; tras consumir, `focus` se limpia (`replace`) como Wave 1.
- [ ] **CA11** — Jest commercial de paneles tocados en verde; `audit-ui.mjs` sobre commercial = 0 detecciones.

### Smoke manual sugerido

1. Planes → buscar por tecnología → filtrar Inactivos → activar chip Sin precio vigente → F5 restaura; cambiar a Ofertas no pierde `offerStatus` al volver.
2. Ofertas en riesgo → Revisar combo/promo → peek edición → alargar «Vigente hasta» → Guardar → desaparece del filtro en riesgo (si aplica).
3. Promo → Editar → código no editable; Cancelar no persiste.
4. Combo → Desactivar → Dialog → Cancelar no borra; Desactivar sí.

---

## 4. Entrega y stop/go

| Rol | Acción |
| --- | --- |
| AI-PROD-UX | Esta spec (congelada v1.0) |
| AI-EM-ARCH | GO / NO-GO de spec |
| AI-FE-PLATFORM | Implementar W2.3 + W2.6 contra este delta |
| AI-SR-QA | Gate CA1–CA11 → informe vivo |

**GO spec** → disparar prompt FE-PLATFORM Wave 2 residual.  
**NO-GO** → colisión de query params con `offerStatus`/`focus`, o campos de edición fuera del DTO; resolver aquí antes de código.
