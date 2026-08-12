# SPEC — Web Empresas · directorio (contrato DS)

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.0 — **congelada / carril rápido**  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  
**Prompt:** [`PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md)  
**UX hermana (se crea en paralelo):** [`2026-08-11-web-empresas-directorio-ux-spec.md`](2026-08-11-web-empresas-directorio-ux-spec.md)  
**DS padre portada (reutilizar receta DS-S):** [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](2026-08-11-web-centro-control-portada-senal-ds-contrato.md) v1.0  
**Contrato padre Fase-1 (no se reescribe):** [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0  
**Firma:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**Receta viva:** `apps/web/src/components/dashboard/SignalChips.tsx`  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)  
**Aclaración 2026-08-11:** DS-E-SHELL sin cáscara extra ni enlace de retorno (ver §5).  
**Aclaración 2026-08-11:** `Nueva empresa` es `Button variant="primary"` en el chrome de la tabla, no en el PageHeader.

> Carril rápido (protocolo §3bis.3): receta de composición, **sin** tokens de marca nuevos, **sin** primitive nueva en `@iwana/ui`, **sin** importar `apps/portal`.  
> En conflicto de sombras / foco / dark, prevalece el contrato Fase-1.  
> El flujo (chrome, copy, cuándo navega un chip, empty vs filtros) lo congela la UX hermana. Este contrato congela **piel y API visual**.

---

## 1. Alcance

### Qué SÍ entra

| ID | Superficie | Receta |
| --- | --- | --- |
| DS-E-KPI | Chips S (×3) | Cáscara idéntica a DS-S / `SignalChips` — clases, no componente nuevo |
| DS-E-EXT | Extensión local de `SignalChips` | Props opcionales con default actual; el home no se rompe |
| DS-E-SHELL | Cáscara del bloque KPI | **Sin cáscara extra.** Los chips son la única superficie. Sin botón de retorno. |
| DS-E-BADGE | Estado de fila | `Badge` de `@iwana/ui`; variant por severidad; texto singular (UX) |
| DS-E-TABLE | Tabla del directorio | Foco solo en el nombre; orden sin lima; slug/fechas mono |
| DS-E-ALERT | Feedback de listado / acción | Preferir `Alert` de `@iwana/ui`; toast solo con tokens de capa |
| DS-E-EMPTY | Vacíos | Dos recetas distintas (primera vez ≠ filtros) |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Nueva primitive en `@iwana/ui` (incl. promover `SignalChips`) | Carril rápido: componer lo vivo |
| 2 | Importar `apps/portal/src/components/shared/portal-ui.tsx` desde web | Boundary de app |
| 3 | Tokens o hex de marca nuevos; `tailwind.config.*` | CSS-first; marca = CTO |
| 4 | Lima en urgencia, error, «Requieren atención», caret de orden o badge de fallo | Firma §3 |
| 5 | `iwana-secondary-50` como fondo del bloque KPI, tabla o empty | Solo acento de interacción |
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
| `shadow-iwana-card` | `--shadow-iwana-card` (`globals.css`, bloque `@theme` de sombras) | `Card` de tabla (no hay cáscara extra en el pulso KPI) |
| `shadow-iwana-soft` | `--shadow-iwana-soft` (mismo bloque) | Reposo del chip S; toast si se conserva flotante |
| `shadow-iwana-active` | `--shadow-iwana-active` | `hover:` solo si el chip es enlace o botón |
| `--z-toast` | `--z-toast: 600` (bloque capas ADR-075, mismo `@theme`) | Única capa de toast: `z-(--z-toast)` |
| `bg-white` / `dark:bg-dark-surface-2` | superficies | Cáscara de chip y `Card` default |
| `bg-iwana-surface-soft` | apoyo | Acento `neutral` del chip (no se usa en los 3 de Empresas) |
| `border-gray-200` / `dark:border-dark-border` | bordes | Cáscara de chip y shell |
| `text-iwana-primary` / `dark:text-white` | texto de marca | Encabezado de orden activo; título de empty |
| `font-mono tabular-nums` | tipografía | Cifras de chip; fechas de tabla |
| `font-mono` + `text-xs` | tipografía | Slug bajo el nombre (dato técnico, no etiqueta) |
| `.portal-eyebrow` | utility en `globals.css` | Eyebrow del bloque KPI |
| `interactiveFocusClassName` (`@iwana/ui`) | `packages/ui/src/focus.ts` | Único anillo de foco |
| `SkeletonBlock` (`@iwana/ui`) | `packages/ui/src/skeleton.tsx` | Carga de chips y filas |
| `Badge` (`@iwana/ui`) | variantes `success` / `warning` / `error` / `neutral` | Estado de fila |
| `Alert` (`@iwana/ui`) | variantes `error` / `success` / `warning` / `neutral` | Feedback en flujo |
| `bg-success-600` / `bg-error-600` | `--color-success-600` / `--color-error-600` | Fondo de toast flotante (texto blanco) |
| `rounded-3xl` chip · `rounded-2xl` sección · `rounded-full` badge | radios `@theme` | Superficie 2xl/3xl; control pill |

**Lima:** no entra en el chip «Requieren atención», ni en badges de fallo/eliminación, ni en el caret de orden, ni como fondo de empty operativo. `Badge variant="lime"` **no** se usa en esta tabla. Texto de acento lima, si aparece (eyebrow), es `text-iwana-secondary-700` / `dark:text-iwana-secondary-400` vía `.portal-eyebrow` — nunca `text-iwana-secondary` suelto.

`--shadow-iwana-card` es visualmente idéntica a `--shadow-iwana` (Fase-1 §3). Se elige **`shadow-iwana-card`** por semántica de sección/card, en paridad con la cáscara de paneles de la portada (DS padre §4).

---

## 3. Receta DS-E-KPI — chips S (×3)

Reutilizar la receta **DS-S** del contrato padre de portada y las clases vivas de `SignalChips.tsx`. No se crea `SignalChip` en `@iwana/ui`. No se reinventan cards con icono.

### Anatomía (de arriba a abajo) — idéntica a DS-S

1. Cáscara: `flex h-full min-h-11 flex-col rounded-3xl border px-4 py-4 shadow-iwana-soft` + acento.
2. Rótulo: `text-sm font-medium text-gray-900 dark:text-white`.
3. Cifra: `mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white`.
4. Si es enlace (`count > 0` + `href`): `Link` que envuelve la cáscara + `interactiveFocusClassName` + `hover:shadow-iwana-active transition-shadow`.
5. Si no es enlace (cifra 0, o chip sin `href`): `<div>` sin hover de sombra activa, sin `role="button"`.

### Acento (copia normativa de DS-S / `ACCENT_CLASS` vivo)

| Acento | Clases light | Clases dark |
| --- | --- | --- |
| `primary` | `border-iwana-primary/20 bg-iwana-primary-50/70` | `dark:border-iwana-primary-400/30 dark:bg-iwana-primary-900/15` |
| `warning` | `border-amber-200 bg-amber-50/80` | `dark:border-amber-500/20 dark:bg-amber-950/20` |
| `danger` | `border-rose-200 bg-rose-50/80` | `dark:border-rose-500/20 dark:bg-rose-950/20` |
| `neutral` | `border-gray-200 bg-iwana-surface-soft` | `dark:border-dark-border dark:bg-dark-surface-3` |

### Piel de los 3 chips (flujo = UX hermana)

| Chip | Acento | `href` si `count > 0` |
| --- | --- | --- |
| Activas | `primary` | `/tenants?status=ACTIVE` |
| En configuración | `warning` | `/tenants?status=PROVISIONING` |
| Requieren atención | `danger` | ninguno |

Carga: `SkeletonBlock` `h-[88px] w-full rounded-3xl`. `aria-busy` en la sección. Ver DS-E-EXT para el recuento.

**Prohibido en KPI:** `shadow-sm`; iconos en pozo (`dark:bg-emerald-950` o cualquier `dark:bg-*-950` de pozo); cifra sin `font-mono tabular-nums`; `"..."` de carga; spinner; lima en el chip de atención.

---

## 4. Receta DS-E-EXT — extensión local de `SignalChips`

Componente **local** de `apps/web`. **No** promover a `@iwana/ui`.

Props **opcionales**. Si el home no las pasa, el render es visualmente idéntico al actual.

| Prop | Default (home intacto) | Uso en Empresas |
| --- | --- | --- |
| `eyebrow` | `PLATFORM_UI_COPY.dashboard.summaryEyebrow` | UX: `Directorio` |
| `ariaLabel` | el mismo string que el eyebrow por defecto | sección del bloque KPI |
| `skeletonCount` | `4` | `3` en esta página |

**Grid**

- Base (sin cambio): `mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4`.
- Si `chips.length === 3` **o** (cargando y `skeletonCount === 3`): `xl:grid-cols-3` en lugar de `xl:grid-cols-4`.
- El home sigue pasando 4 chips y no pasa `skeletonCount` → 4 columnas en `xl`.

`aria-label` de la `<section>`: `ariaLabel ?? eyebrow ?? default`. El nodo eyebrow visible usa `eyebrow`.

No añadir iconos, deltas, sparklines ni cuarta tesela en Empresas.

---

## 5. Receta DS-E-SHELL — pulso KPI sin cáscara extra

Aclaración 2026-08-11: el bloque K ya no envuelve los chips en una superficie `rounded-2xl` + `shadow-iwana-card`, ni lleva enlace de retorno.

- Eyebrow + `SignalChips` sueltos, misma receta DS-S que el home.
- Los chips **no** van dentro de mini-cards blancas con `shadow-sm`, ni dentro de una segunda card de sección.
- No hay H2, párrafo instructivo ni botón «Volver al centro de control». Ese destino vive en el sidebar.

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

Filtro y chips usan **plural**; el badge de fila usa **singular**. Un solo mapa de variants en web (retirar o reexportar `TenantStatusBadge` — ejecución FE; este contrato exige un único mapeo visual).

---

## 7. Receta DS-E-TABLE — tabla

Cáscara: `Card` de `@iwana/ui` (ya trae `rounded-2xl` + `shadow-iwana-card`). No añadir `shadow-sm` al inner `overflow` ni una segunda card.

| Pieza | Receta |
| --- | --- |
| CTA de alta | `Button variant="primary"` + `Link` `/tenants/new` en el chrome (junto a búsqueda/filtro). No va en el PageHeader. No lima filled. |
| Control de fila al teclado | Solo el **nombre** lleva `interactiveFocusClassName`. Celdas de estado y fechas: **sin** `onClick`, sin `cursor-pointer`. |
| Encabezado inactivo | `text-xs font-medium tracking-wider text-gray-500 uppercase` (ya vivo). |
| Encabezado activo | Añadir `font-semibold text-iwana-primary` (WCAG 1.4.1: el orden no se comunica solo con el icono). |
| Caret de orden | `text-iwana-primary` / `dark:text-iwana-primary-300` si activo; `text-gray-400` si inactivo. **Sin** `iwana-secondary*`. |
| `aria-sort` | En el `<th>` ordenable; a lo sumo uno ≠ `none` (comportamiento = UX / ADR-065 §22; piel = este contrato). |
| Slug | `text-xs font-mono text-gray-500 dark:text-gray-400`. Prohibido `text-[11px]`. El slug no es etiqueta visible («slug» no se escribe). |
| Fechas | `<time dateTime={ISO}>` + `font-mono tabular-nums text-sm text-gray-500 dark:text-gray-400`. |
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
- Acción: control ya vivo «Limpiar filtro» (`text-iwana-primary` + `interactiveFocusClassName`), no un botón primary.

---

## 10. Matriz de estados

| Estado | Chip S | Badge | Tabla / Alert |
| --- | --- | --- | --- |
| hover | Solo enlace: `hover:shadow-iwana-active` | N/A (no interactivo) | Fila `hover:bg-gray-50 dark:hover:bg-white/[0.03]` |
| foco | `interactiveFocusClassName` en el control | N/A | Solo nombre + orden + acciones + limpiar filtro |
| activo | N/A (navega) | N/A | N/A |
| deshabilitado | N/A — cifra 0 no es control | N/A | Load-more `disabled` + `loading` del `Button` |
| cargando | `SkeletonBlock` × `skeletonCount` + `aria-busy` | Skeletons pill | Filas skeleton; no `"..."` |
| vacío | Cifra `0` real, no interactivo | No se monta fila | Empty A o Empty B, nunca mezclados |
| error | `Alert variant="error"` del propio `SignalChips` | N/A | `Alert` en flujo (DS-E-ALERT) |
| éxito | N/A (lectura) | N/A | `Alert success` o toast tokenizado |
| readonly | Chip atención (sin href) | Badge estático | Celdas estado/fecha no son controles |

---

## 11. Checklist FE antes de entregar

- [ ] 0 tokens nuevos en `globals.css`.
- [ ] 0 primitives nuevas en `@iwana/ui`. `SignalChips` sigue en `apps/web`.
- [ ] Home `SignalChips` visualmente idéntico si no se pasan `eyebrow` / `ariaLabel` / `skeletonCount`.
- [ ] 0 imports desde `apps/portal`.
- [ ] 0 `shadow-sm` / `shadow-lg` / `z-50` en KPI, toast o cáscara nueva.
- [ ] 0 lima en chip de atención, badge de error/eliminación o caret de orden.
- [ ] 0 `"..."` de carga; cifras y fechas en `font-mono tabular-nums`.
- [ ] `interactiveFocusClassName` solo en el nombre (fila), no en estado/fechas.
- [ ] Encabezado activo `font-semibold text-iwana-primary`.
- [ ] Slug `text-xs font-mono`.
- [ ] Empty A ≠ Empty B (CTA primera empresa solo en A).
- [ ] Toast, si existe: `z-(--z-toast)` + `shadow-iwana-soft` + `bg-success-600` / `bg-error-600`.
- [ ] `audit-ui.mjs` sobre `apps/web/src/app/(protected)/tenants` + `TenantsTable.tsx` → P0/P1 = 0.

---

## 12. Relación con contratos padre

- **DS-S (portada):** este contrato **reutiliza** cáscara, acentos y cifra. No la reabre.
- **Fase-1:** `shadow-iwana-card` / `shadow-iwana-soft` / `shadow-iwana-active`, `dark-surface-*` e `interactiveFocusClassName` **no se reabren**.
- **Firma:** lima = avance; nunca urgencia. CTA de página = `primary` (azul).
- Un cambio post-congelación se versiona **v1.1+** y se notifica a FE-PLATFORM y SR-QA vía AI-EM-ARCH.
