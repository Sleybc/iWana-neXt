# UX delta — Comercial portal · Wave 1 (H20–H22 + KPI)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.0 |
| **Estado** | **GO EM-ARCH** → FE-PLATFORM (2026-07-23) |
| **Fecha** | 2026-07-23 |
| **Autor** | AI-PROD-UX |
| **Módulo** | MOD06 Comercial · `/dashboard/commercial` |
| **Origen** | [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5.md) · [plan remediación W1.1](../plans/2026-07-23-commercial-ui-audit-remediation.md) |
| **Spec base (no reescribir)** | [2026-07-12-commercial-ux-spec](./2026-07-12-commercial-ux-spec.md) · [navegación post-H19](./2026-07-22-mod06-comercial-resumen-navegacion-ux.md) |
| **Patrones de referencia** | `PortalSidePeek` (catálogo) · Dialog destructive en `AdditionalProductsPanel` |

**Postura:** delta quirúrgico. Sin rediseño de shell, tabs, tributación ni H19. Sin tokens nuevos. Implementación: AI-FE-PLATFORM. Verificación: AI-SR-QA.

**Fuera de alcance:** edición combos/promos (Wave 2.6), namespace `offerStatus`, filtros de planes, thead compartido, code-split.

---

## 1. Precio ausente (H20)

### Problema

`currentPrice` / `basePrice` nulos se muestran como `$0` (o `$ 0`). El operador interpreta «gratis» en lugar de «falta precio vigente».

### Comportamiento

| Condición | UI |
| --- | --- |
| Precio vigente presente (incluido `0` legítimo, p. ej. comodato con registro vigente) | `formatCurrency` / mono técnico como hoy |
| Precio vigente **ausente** (`null` / sin precio current) | Copy fijo **«Sin precio vigente»** — **nunca** `$0` |

### Tratamiento visual

- Preferido: `Badge variant="warning"` (par tonal ámbar del DS; **no** lima / `primary` como urgencia).
- Alternativa aceptable: texto `text-sm` con tono warning del sistema (ámbar/error suave), no color de marca lima.
- Celda de precio: el badge/texto **reemplaza** el monto; no combinar `$0` + badge.
- No exponer enums ni motivos técnicos (`missing_current_price`, `null`) en UI.

### Superficies

Tablas / listados de **Planes**, **Productos adicionales** y **Servicios** (cualquier celda que hoy formatee `basePrice` / `currentPrice`).

### Nota de copy

| Contexto | Copy |
| --- | --- |
| Celda / badge | Sin precio vigente |
| Motivo en Actividad (ya existe) | Sin precio vigente |
| Prohibido | `$0`, `$ 0`, «null», «sin precio», «precio faltante» (usar la frase canónica) |

---

## 2. Deep-link `?tab=&focus=<uuid>` (H21)

### Tarea

Desde Actividad («Requiere atención» / cambios) o alerta de catálogo incompleto / oferta en riesgo, el operador aterriza en el tab correcto **y** en la entidad concreta, sin buscar a ojo.

### URL

- Query: `tab=<CommercialTab>` + `focus=<uuid>`.
- `focus` inválido o ausente: ignorar (no error de pantalla).
- Tras consumir `focus`: `router.replace` quitando solo `focus` (conservar `tab` y demás query válidos) para que un refresh no reabra el peek / no re-scroll.

### Al montar el panel del tab activo

Con `focusId` válido:

1. **Si la entidad admite edición en side peek** (plan, producto, servicio, combo, promoción, regla de compatibilidad / tax según el panel): abrir `PortalSidePeek` en modo edición de esa entidad (mismo flujo que «Editar» desde fila).
2. **Si no hay peek de edición** o la entidad no está en la página cargada: resaltar la fila (`data-focused` o clase focus existente del portal) + `scrollIntoView({ block: 'nearest' })`.
3. Si el id no existe en el listado cargado: no abrir peek; opcional toast/alert suave «No se encontró el ítem» (sin PII); limpiar `focus` igual.

### Orígenes de navegación (deben emitir `focus` cuando haya id)

| Origen | Comportamiento |
| --- | --- |
| Fila «Requiere atención» | `onNavigate(destinoTab, { focus: item.id, …filtros })` |
| Alerta «Completar catálogo» / «Ver ofertas» | Si la alerta es agregada (sin id único): solo tab (+ filtro oferta si aplica). Si en el futuro hay id: incluir `focus`. |
| Filas con id de entidad | Siempre preferir `tab` + `focus` |

### A11y

- Peek: foco inicial y cierre según contrato `PortalSidePeek` vigente.
- Resalte de fila: no solo color; contraste AA; visible con teclado.

---

## 3. Confirmar eliminación de plan (H22)

### Problema

«Eliminar este plan» en el peek llama API sin Dialog. Riesgo irreversible sin paridad con productos/servicios.

### Patrón (espejo productos)

Misma gramática que `AdditionalProductsPanel` Dialog destructive.

| Elemento | Spec |
| --- | --- |
| Disparador | Botón «Eliminar este plan» en sección destructiva del peek (o acción equivalente en fila si se añade) |
| Antes de API | Abrir `Dialog` |
| Título | Eliminar plan |
| Cuerpo | ¿Eliminar **{nombre}**? Esta acción es irreversible. Los clientes asociados no se eliminan, pero perderán la referencia a este plan. |
| CTA primaria | `Button variant="destructive"` · label **Eliminar** · loading mientras borra |
| Cancelar | `Button variant="ghost"` · **Cancelar** · cierra Dialog, **no** llama API |
| Error API | `PortalAlert` error dentro del Dialog (paridad productos) |
| Éxito | Cerrar Dialog + peek; refrescar listado |

### Prohibido

- Eliminar con un solo clic desde el peek.
- CTA destructive con lima / `primary`.

---

## 4. KPI «Listos para vender» → `resolveCatalogIncompleteTab` (H24)

### Problema

El KPI navega siempre a `plans`, aunque el tipo con más ítems sin precio vigente sea productos o servicios.

### Comportamiento

| Condición | Destino al clic |
| --- | --- |
| `catalogIncompleteActiveCount > 0` | `resolveCatalogIncompleteTab(summary)` (misma regla que alerta «Completar catálogo»: mayoría `missing_current_price`; empate `plans` > `products` > `services`) |
| `catalogIncompleteActiveCount === 0` | Tab `plans` (pulso de catálogo; sin focus) |

Copy del KPI sin cambio: título «Listos para vender»; descripción actual de precio vigente.

Opcional Wave 1: si hay incompletos y un único ítem dominante con id, el clic puede incluir `focus`; no es bloqueante del gate si al menos el tab es correcto.

---

## 5. Criterios de aceptación (checklist · informe v1.5)

Verificables por SR-QA / gate operativo:

- [ ] **CA1** — Ítem activo sin precio vigente muestra **«Sin precio vigente»** (badge/texto warning), nunca `$0` / `$ 0`.
- [ ] **CA2** — «Eliminar este plan» abre **Dialog** destructive; **Cancelar** no llama API; **Eliminar** sí.
- [ ] **CA3** — Desde Actividad o alerta con entidad: URL con `focus=<id>` **abre side peek** o **resalta + scroll**; tras consumir, `focus` desaparece de la URL (`replace`).
- [ ] **CA4** — KPI «Listos para vender» con incompletos usa la misma regla que `resolveCatalogIncompleteTab`.
- [ ] **CA5** — Error de carga de planes ofrece **Reintentar** (H23; cola Wave 1).
- [ ] **CA6** — Jest commercial de paneles tocados en verde; `audit-ui.mjs` sobre commercial = 0 detecciones.

### Smoke manual sugerido

1. Plan/producto/servicio sin precio current → celda «Sin precio vigente».
2. Actividad → Revisar ítem con id → tab + peek o highlight; F5 no reabre por `focus`.
3. Peek plan → Eliminar este plan → Cancelar (sigue existiendo) → Eliminar (desaparece).
4. KPI con más incompletos en productos → aterriza en Productos.

---

## 6. Entrega y stop/go

| Rol | Acción |
| --- | --- |
| AI-PROD-UX | Esta spec (congelada v1.0) |
| AI-EM-ARCH | GO / NO-GO de spec |
| AI-FE-PLATFORM | Implementar W1.2–W1.5 contra este delta |
| AI-SR-QA | Gate CA1–CA6 → informe v1.6 |

**GO spec** → disparar prompt FE-PLATFORM Wave 1.  
**NO-GO** → ambigüedad en focus (peek vs highlight) o copy; resolver aquí antes de código.
