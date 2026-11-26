# SPEC — Web Empresas · directorio (contrato DS)

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.1 — v1.0 congelada / carril rápido; v1.1 aprobada por el CTO el 2026-11-25, firma pendiente AI-DS-OWNER  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  
**Prompt:** [`PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md)  
**UX hermana (v1.1):** [`2026-08-11-web-empresas-directorio-ux-spec.md`](2026-08-11-web-empresas-directorio-ux-spec.md)  
**DS padre portada (histórico; la receta DS-S dejó de usarse en v1.1):** [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](2026-08-11-web-centro-control-portada-senal-ds-contrato.md) v1.0  
**Contrato padre Fase-1 (no se reescribe):** [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0  
**Firma:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**Receta viva:** [TenantDirectoryPulse](../../apps/web/src/components/tenants/TenantDirectoryPulse.tsx) y [TenantsTable](../../apps/web/src/components/tenants/TenantsTable.tsx)  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)  
**Aclaración 2026-08-11:** DS-E-SHELL sin enlace de retorno (ver §5).  
**Aclaración 2026-08-11:** `Nueva empresa` es `Button variant="primary"` en el chrome de la tabla, no en el PageHeader.

> Carril rápido (protocolo §3bis.3): receta de composición, **sin** tokens de marca nuevos, **sin** primitive nueva en `@iwana/ui`, **sin** importar `apps/portal`.  
> En conflicto de sombras / foco / dark, prevalece el contrato Fase-1.  
> El flujo (chrome, copy, cuándo navega una celda, empty vs filtros) lo congela la UX hermana. Este contrato congela **piel y API visual**.

### Changelog

| Ver | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-08-11 | Congelación inicial. |
| **1.1** | 2026-11-25 | `PulseStrip` sustituye a `SignalChips` (§§3–5); tabla con H2, divisores, encabezados en sentence case y región desplazable (§7). Firma pendiente AI-DS-OWNER. |

---

## 1. Alcance

### Qué SÍ entra

| ID | Superficie | Receta |
| --- | --- | --- |
| DS-E-KPI | Pulso (×3) | `PulseStrip` de `@iwana/ui` vía `TenantDirectoryPulse` |
| DS-E-EXT | — | Retirada en v1.1 (§4) |
| DS-E-SHELL | Superficie del pulso | La franja es la única superficie. Sin botón de retorno. |
| DS-E-BADGE | Estado de fila | `Badge` de `@iwana/ui`; variant por severidad; texto singular (UX) |
| DS-E-TABLE | Tabla del directorio | Foco solo en el nombre; orden sin lima; slug/fechas mono |
| DS-E-ALERT | Feedback de listado / acción | Preferir `Alert` de `@iwana/ui`; toast solo con tokens de capa |
| DS-E-EMPTY | Vacíos | Dos recetas distintas (primera vez ≠ filtros) |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Nueva primitive en `@iwana/ui` (`PulseStrip` ya existe, §7bis.2) | Carril rápido: componer lo vivo |
| 2 | Importar `apps/portal/src/components/shared/portal-ui.tsx` desde web | Boundary de app |
| 3 | Tokens o hex de marca nuevos; `tailwind.config.*` | CSS-first; marca = CTO |
| 4 | Lima en urgencia, error, «Requieren atención», caret de orden o badge de fallo | Firma §3 |
| 5 | `iwana-secondary-50` como fondo del pulso, tabla o empty | Solo acento de interacción |
| 6 | Card-dentro-de-card con `shadow-sm` / `shadow-lg` / `shadow-md` | Fase-1 §3; anti-patrón anidado |
| 7 | `dark:bg-gray-{700-950}` · `dark:bg-emerald-950` en pozos de icono | ADR-056 §2 |
| 8 | Reabrir sidebar, canvas `rounded-3xl`, o copy `status*` del home | Ya cerrados |
| 9 | Pager numerado ADR-065 · ficha · `/tenants/new` · ConfirmDialog · NotificationBell | Fuera de este prompt |

**Veredicto carril rápido:** **GO** — 0 primitives nuevas, 0 tokens de marca. No hay `[BLOQUEO]`.

---

## 2. Tokens citados (existen en `globals.css`)

Verificados el 2026-08-11. Citar el token; no el hex.

| Token / utilidad | Dónde vive | Uso en este contrato |
| --- | --- | --- |
| `shadow-iwana-card` | `--shadow-iwana-card` (`globals.css`, bloque `@theme` de sombras) | `Card` de tabla |
| `shadow-iwana-soft` | `--shadow-iwana-soft` (mismo bloque) | `PulseStrip`; toast si se conserva flotante |
| `--z-toast` | `--z-toast: 600` (bloque capas ADR-075, mismo `@theme`) | Única capa de toast: `z-(--z-toast)` |
| `bg-white` / `dark:bg-dark-surface-2` | superficies | Celda de pulso y `Card` default |
| `bg-iwana-surface-soft` | apoyo | Hover de celda interactiva y de fila |
| `border-gray-200` / `dark:border-dark-border` | bordes | Franja y tabla |
| `text-iwana-primary` / `dark:text-white` | texto de marca | Encabezado de orden activo; título de empty |
| `tabular-nums` (+ `font-mono` en fechas) | tipografía | Cifras de pulso; fechas de tabla |
| `font-mono` + `text-xs` | tipografía | Slug bajo el nombre (dato técnico, no etiqueta) |
| `.portal-eyebrow-muted` | utility en `globals.css` | Rótulo de celda |
| `interactiveFocusClassName` (`@iwana/ui`) | `packages/ui/src/focus.ts` | Único anillo de foco |
| `SkeletonBlock` (`@iwana/ui`) | `packages/ui/src/skeleton.tsx` | Carga de celdas y filas |
| `Badge` (`@iwana/ui`) | variantes `success` / `warning` / `error` / `neutral` | Estado de fila |
| `Alert` (`@iwana/ui`) | variantes `error` / `success` / `warning` / `neutral` | Feedback en flujo |
| `bg-success-600` / `bg-error-600` | `--color-success-600` / `--color-error-600` | Fondo de toast flotante (texto blanco) |
| `rounded-2xl` superficie · `rounded-full` badge | radios `@theme` | Superficie 2xl; control pill |

**Lima:** no entra en la celda «Requieren atención», ni en badges de fallo/eliminación, ni en el caret de orden, ni como fondo de empty operativo. `Badge variant="lime"` **no** se usa en esta tabla.

`--shadow-iwana-card` es visualmente idéntica a `--shadow-iwana` (Fase-1 §3). Se elige **`shadow-iwana-card`** por semántica de sección/card, en paridad con la cáscara de paneles de la portada (DS padre §4).

---

## 3. Receta DS-E-KPI — pulso (×3)

`TenantDirectoryPulse` compone `PulseStrip` de [`@iwana/ui` §7bis.2](2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md#7bis2-pulsestrip-primitive), que fija anatomía y estados.

- Tres celdas sin acento de color: apiladas por debajo de `sm`, en fila desde `sm` (`sm:grid-cols-3`).
- Activas y En configuración: `href` `/tenants?status=…` si la cifra es > 0. Requieren atención: `onClick` (foco al H2). Con 0, ninguna es interactiva.
- `actionLabel` sustituye al contenido como nombre accesible y la cifra no se anuncia: deuda conocida, dueño AI-DS-OWNER.
- Error del resumen: `ErrorState` con un solo reintento en lugar de la franja.

**Prohibido:** iconos en pozo; lima; `"..."` de carga; spinner; ceros en error.

---

## 4. Receta DS-E-EXT — retirada (v1.1)

`SignalChips` ya no existe en `apps/web`. Se conserva el número para no reordenar.

---

## 5. Receta DS-E-SHELL — superficie del pulso

La franja es una sola superficie, sin `Card` alrededor. Sin eyebrow, párrafo instructivo ni botón «Volver al centro de control».

---

## 6. Receta DS-E-BADGE — estado de fila

Primitive: `Badge` de `@iwana/ui` (`packages/ui/src/components/Badge.tsx`). **Prohibido** reimplementar pills con `statusPillClasses` locales.

Texto = **singular femenino** (UX §7.3 / helper único). Este contrato no congela el copy; congela la variant.

| Estado semántico | `variant` | Lima |
| --- | --- | --- |
| Activa (`ACTIVE`) | `success` | no |
| En configuración (`PROVISIONING`) | `warning` | no |
| Con error (`FAILED` / alias vivo `PROVISIONING_FAILED`) | `error` | **nunca** |
| Suspendida (`SUSPENDED`) | `warning` | no |
| Inactiva (`INACTIVE`) | `neutral` | no |
| En eliminación (`MARKED_FOR_DELETION`) | `error` | **nunca** |

`variant="lime"` · `variant="primary"` · `variant="info"`: **fuera** de la columna de estado. Lima no comunica urgencia ni fallo.

Filtro y pulso usan **plural**; el badge de fila usa **singular**. Un solo mapa de variants en web (retirar o reexportar `TenantStatusBadge` — ejecución FE; este contrato exige un único mapeo visual).

---

## 7. Receta DS-E-TABLE — tabla

Cáscara: `Card` de `@iwana/ui` (ya trae `rounded-2xl` + `shadow-iwana-card`). No añadir `shadow-sm` al inner `overflow` ni una segunda card.

| Pieza | Receta |
| --- | --- |
| Título | H2 `text-base font-semibold text-iwana-primary dark:text-white`, enfocable (`tabIndex={-1}`). |
| Chrome | Búsqueda, filtro y alta se apilan en pantallas estrechas y envuelven desde `sm`; vacío y error se ajustan al ancho de la tarjeta. |
| Desplazamiento | Región `overflow-x-auto` enfocable, con `aria-labelledby` del H2. |
| Filas | `divide-y divide-gray-100 dark:divide-dark-border`; encabezado con `border-b`. |
| CTA de alta | `Button variant="primary"` + `Link` `/tenants/new` en el chrome (junto a búsqueda/filtro). No va en el PageHeader. No lima filled. |
| Control de fila al teclado | Solo el **nombre** lleva `interactiveFocusClassName`. Celdas de estado y fechas: **sin** `onClick`, sin `cursor-pointer`. |
| Encabezado inactivo | `text-xs font-medium text-gray-600 dark:text-gray-300`, sentence case. |
| Encabezado activo | Añadir `font-semibold text-iwana-primary dark:text-iwana-primary-300` (WCAG 1.4.1: el orden no se comunica solo con el icono). |
| Caret de orden | `text-iwana-primary` / `dark:text-iwana-primary-300` si activo; `text-gray-400` si inactivo. **Sin** `iwana-secondary*`. |
| `aria-sort` | En el `<th>` ordenable; a lo sumo uno ≠ `none` (comportamiento = UX / ADR-065 §22; piel = este contrato). |
| Slug | `font-mono text-xs text-gray-600 dark:text-gray-300`. Prohibido `text-[11px]`. El slug no es etiqueta visible («slug» no se escribe). |
| Fechas | `<time dateTime={ISO}>` + `font-mono text-xs tabular-nums text-gray-600 dark:text-gray-300`. |
| Carga | Filas `SkeletonBlock` con forma (nombre + pill + dos fechas). No `animate-pulse` suelto como única receta; no spinner de página. |
| Error de listado | No texto `text-red-500` suelto en la celda: receta DS-E-ALERT. |
| Pie load-more | `Button variant="secondary"`. Lima fuera del pie. ADR-065 pager = deuda, no se implementa. |

---

## 8. Receta DS-E-ALERT — feedback

**Preferido:** `Alert` + `AlertDescription` de `@iwana/ui` **en el flujo** del listado (error de carga, fallo de acción). `role` ya lo resuelve la primitive (`error` → `alert`; resto → `status`).

| Caso | Variant |
| --- | --- |
| Listado no carga | `error` + `Button` Reintentar (`variant="secondary"` `size="sm"`) |
| Acción ok (si se deja en flujo) | `success` |
| Acción falla | `error` |

**Si se conserva toast flotante** (anti-patrón actual: `z-50` + `shadow-lg` + `bg-emerald-600` / `bg-red-600`):

```
fixed top-4 right-4 z-(--z-toast) max-w-sm rounded-2xl px-4 py-3 shadow-iwana-soft
éxito: bg-success-600 text-white
error:  bg-error-600 text-white
```

Cerrar: `interactiveFocusClassName` (o anillo blanco sobre el fondo sólido). Target ≥ `min-h-11`.

**Prohibido:** `z-50`, `z-9999`, `shadow-lg` / `shadow-md` ad hoc, `bg-emerald-600`, `bg-red-600`.

`--z-toast` existe: `packages/ui/src/styles/globals.css` → `--z-toast: 600` (escala ADR-075).

---

## 9. Receta DS-E-EMPTY — dos vacíos, no uno

No unificar en un solo bloque visual. Copy y cuándo aparece cada uno = UX hermana.

### Empty A — primera vez (parque total 0, sin filtros)

- Bloque centrado **dentro** del shell de tabla (no una card extra).
- Título `text-sm font-medium text-iwana-primary dark:text-white`.
- Cuerpo `text-sm leading-6 text-gray-500 dark:text-gray-400`.
- CTA: `Button variant="primary"` (azul noche; **no** `lime`) — «Registrar primera empresa».
- Ilustración / blob lima al 5% (`blur-3xl`) **opcional y solo aquí** (Firma #9). No es fondo de panel.

### Empty B — filtros sin filas

- Más compacto: título + una línea. **Sin** blob, **sin** ilustración.
- **Sin** CTA «Registrar primera empresa».
- Acción: control ya vivo «Limpiar filtro» (`Button variant="ghost"` del chrome), no un botón primary.

---

## 10. Matriz de estados

| Estado | Celda de pulso | Badge | Tabla / Alert |
| --- | --- | --- | --- |
| hover | Solo interactiva: `hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3` | N/A (no interactivo) | Fila `hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3` |
| foco | `interactiveFocusClassName` en el control | N/A | Nombre + orden + acciones + limpiar filtro + región desplazable + H2 |
| activo | N/A (navega) | N/A | N/A |
| deshabilitado | N/A — cifra 0 no es control | N/A | Load-more `disabled` + `loading` del `Button` |
| cargando | `SkeletonBlock` por celda + `aria-busy` | Skeletons pill | Filas skeleton; no `"..."` |
| vacío | Cifra `0` real, no interactivo | No se monta fila | Empty A o Empty B, nunca mezclados |
| error | `ErrorState` en lugar de la franja | N/A | `Alert` en flujo (DS-E-ALERT) |
| éxito | N/A (lectura) | N/A | `Alert success` o toast tokenizado |
| readonly | Celda con cifra 0 | Badge estático | Celdas estado/fecha no son controles |

---

## 11. Checklist FE antes de entregar

- [ ] 0 tokens nuevos en `globals.css`.
- [ ] 0 primitives nuevas en `@iwana/ui`; el pulso compone `PulseStrip`.
- [ ] 0 imports desde `apps/portal`.
- [ ] 0 `shadow-sm` / `shadow-lg` / `z-50` en pulso, toast o cáscara nueva.
- [ ] 0 lima en celda de atención, badge de error/eliminación o caret de orden.
- [ ] 0 `"..."` de carga; cifras en `tabular-nums` y fechas en `font-mono tabular-nums`.
- [ ] En la fila, `interactiveFocusClassName` en el nombre y no en estado/fechas.
- [ ] Encabezado activo `font-semibold text-iwana-primary`.
- [ ] Slug `text-xs font-mono`.
- [ ] Empty A ≠ Empty B (CTA primera empresa solo en A).
- [ ] Toast, si existe: `z-(--z-toast)` + `shadow-iwana-soft` + `bg-success-600` / `bg-error-600`.
- [ ] `audit-ui.mjs` sobre `apps/web/src/app/(protected)/tenants` + `TenantsTable.tsx` → P0/P1 = 0.

---

## 12. Relación con contratos padre

- **DS-S (portada):** v1.1 deja de usar su cáscara; no la reabre.
- **Fase-1:** `shadow-iwana-card` / `shadow-iwana-soft` / `shadow-iwana-active`, `dark-surface-*` e `interactiveFocusClassName` **no se reabren**.
- **Firma:** lima = avance; nunca urgencia. CTA de página = `primary` (azul).
- Un cambio post-congelación se versiona **v1.2+** y se notifica a FE-PLATFORM y SR-QA vía AI-EM-ARCH.
