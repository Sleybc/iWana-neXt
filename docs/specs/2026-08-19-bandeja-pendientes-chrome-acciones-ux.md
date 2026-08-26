# UX spec — Chrome de acciones en bandeja «Pendiente por agendar»

**Versión:** 1.0  
**Estado:** Congelado — desbloqueante para AI-FE-PLATFORM y AI-SR-QA (protocolo §3bis)  
**Fecha:** 2026-08-19  
**Autor:** AI-PROD-UX  
**Superficie:** portal tenant `/dashboard/scheduling/pending-visits`  
**Componente:** `apps/portal/src/components/scheduling/PendingVisitRequestInbox.tsx` **solo modo no compacto**  
**Página:** `PendingVisitRequestsView.tsx`  
**Identidad:** [Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md) §3 jerarquía de botones · `firma-elements.md`  
**Estrella Polar de listados:** `SubscribersListClient.tsx` · `ExpedientesLandingClient.tsx` · `SchedulingSummaryStrip.tsx` · Settings (`AccessControlSettingsClient` / `OrganizationSettingsClient`) «Reintentar»  
**Vocabulario:** skill `system-vocabulary-review` (sin WFM, sin enums, sentence case)

**Qué es y qué no es.** Fija jerarquía, affordance y layout del chrome **ya existente**. No define tokens ni API de componentes. No toca `PageHeader`. No inventa pantallas, drawers ni altas. No pide primitivas nuevas.

---

## 0. Decisión (una sola dirección)

**Dirección A — fila de utilidad en texto, no cluster de pills.** Adoptada.

La bandeja se comporta como un listado operativo (suscriptores / oportunidades): primero filtrar y escanear; el CTA vive **en cada fila**. La navegación cruzada y el refresco existen, pero como **texto**, no como botones pill.

**Dirección B descartada:** meter los tres controles en `PortalActionToolbar`, en `PortalPanel.actions` o como pills `ghost`/`secondary` alineados a `justify-end`. Eso recrea una barra de comandos que compite con «Abrir despacho» y no aparece en los listados de referencia.

Fuera de alcance (deuda hermana, no se abre aquí): el mismo cluster vive en `SchedulingToolbar.tsx` (agenda). Escalar al orquestador si se quiere el mismo patrón ahí.

---

## 1. Qué se ve primero vs qué no compite

**Tarea principal del operador:** revisar la bandeja, elegir una solicitud y abrir despacho (o «Decidir» si agotó intentos).

Orden de lectura del panel, de arriba hacia abajo:

| Orden | Superficie | Peso | Rol |
| --- | --- | --- | --- |
| 0 | `PageHeader` título limpio («Visitas pendientes») | Identidad de página | Sin acciones. **No se toca.** |
| 1 | Header del `PortalPanel`: eyebrow «Bandeja», título «Pendiente por agendar», descripción | Ancla de sección | Sin slot `actions`. |
| 2 | **Grilla de filtros** (ya existe) | Alto — reduce la cola | Cinco `Select`. «Limpiar filtros» `ghost` **solo si hay filtro activo**. |
| 3 | **Fila de utilidad** (reemplaza el cluster de 3 pills) | Bajo — orientación | Enlaces de texto + refresco `link`. |
| 4 | `PortalResultsStrip` (conteo) | Medio | Cuántas solicitudes hay. |
| 5 | Tabla (`lg+`) / tarjetas (móvil) | **Dominante** | Escanear y actuar. |
| 6 | CTA por fila: «Abrir despacho» / «Continuar despacho» / «Decidir» | **Única acción principal de vista** | Es el único control filled del cuerpo. |

**No debe competir con la tarea:**

- Un cluster de tres controles con `size="sm"` + `h-11` a `justify-end` (estado actual del modo no compacto).
- Pills `ghost` o `secondary` que se leen como CTAs de página.
- Lima filled, `PortalActionToolbar` (cáscara con borde y pozo suave) o acciones en el título de página/panel.

En el primer viewport desktop deben caber: header del panel + filtros + **al menos dos filas** de la tabla (o dos tarjetas en móvil). La fila de utilidad no puede empujar el listado fuera de vista.

---

## 2. Rol de los tres controles

Los tres **siguen existiendo**. Cambian de affordance, no de destino ni de comportamiento.

| Control hoy | ¿Sigue? | Affordance nueva | Por qué |
| --- | --- | --- | --- |
| Link «Ir a agenda» → `/dashboard/scheduling/agenda` | Sí | **Enlace de texto**, misma gramática que `SchedulingSummaryStrip` (`text-sm font-medium`, subrayado al hover, anillo de foco). No es `Button` pill. | Cruce de módulo. No es la tarea de esta pantalla. Copy ya canónico en el strip. |
| Link «Visitas sin realizar» → `/dashboard/scheduling/unrealized-visits` | Sí | Igual: **enlace de texto**. | Misma familia de cruce. Copy canónico de la spec de visita no realizada. |
| Button «Actualizar» (refresh de la bandeja, con loading) | Sí | `Button variant="link"` + icono Refresh, como «Reintentar» de Settings. Sigue siendo **botón** (mutación de datos en pantalla), no navegación. Loading existente se conserva. | Operacional y frecuente, pero **no** es el CTA de página. `secondary` filled le robaba jerarquía a «Abrir despacho». |

**Copy de error vs refresco sano:** «Actualizar» = recargar una bandeja que ya está visible. «Reintentar» = se queda en el `PortalAlert` de error de `PendingVisitRequestsView` (no se mueve a esta fila).

**Modo compacto:** fuera de esta spec. No copiar el cluster de tres pills. No añadir «Ir a agenda» ni «Visitas sin realizar» al embed. `extraActions` y «Ver bandeja completa» se mantienen como están.

---

## 3. Layout (anatomía del cuerpo, modo no compacto)

```text
PortalPanel  (eyebrow + título + descripción; SIN actions)
  ├── 1. Filtros     grid existente (Estado, Origen, Prioridad, Municipio, Sector)
  │                    + «Limpiar filtros» ghost h-12 SOLO si hay filtro activo
  ├── 2. Utilidad    flex-wrap · items-center · justify-between
  │                    izq: Ir a agenda  ·  Visitas sin realizar   (enlaces de texto)
  │                    der: [icono] Actualizar                     (Button link)
  ├── 3. Strip       PortalResultsStrip (conteo)
  └── 4. Listado     tabla lg+ / tarjetas < lg  + pie de paginación
```

Alineación con la Estrella Polar:

- **Suscriptores / oportunidades:** la fila 1 es filtros; el `ghost` no es navegación, es «Limpiar filtros» condicional. Aquí no hay alta en esa fila: el alta de solicitud no nace en esta vista.
- **Strip de programación:** el cruce de módulo es link de texto, no pill.
- **Settings:** el refresco/reintento es `variant="link"` + icono, no un botón sólido en un cluster.

**Prohibido en esta superficie**

- `justify-end` con tres pills como única fila de chrome.
- `PortalActionToolbar` (añade peso visual de comando).
- Slot `actions` del `PortalPanel` o del `PageHeader`.
- Tokens, variantes o primitivas nuevas.

En móvil la fila de utilidad se apila: enlaces primero (inicio de línea), «Actualizar» debajo o a continuación en el wrap, siempre con target ≥44 px. No queda un bloque de pills flotando a la derecha.

---

## 4. Copy visible

Sentence case. Sin WFM, work order, tenant ni nombres de ruta.

| Superficie | Copy |
| --- | --- |
| Enlace | Ir a agenda |
| Enlace | Visitas sin realizar |
| Botón de refresco | Actualizar |
| Nombre accesible del refresco (mientras carga) | Actualizar bandeja (el estado loading del `Button` existente cubre el busy) |
| Ghost condicional | Limpiar filtros |
| CTA de fila (sin cambio) | Abrir despacho · Continuar despacho · Decidir |

Títulos de panel y `PageHeader` **no cambian**.

---

## 5. Criterios de aceptación UX

Verificables en `PendingVisitRequestInbox.tsx` modo no compacto, desktop (≥1024 px) y móvil (<768 px).

**Jerarquía**

- **CA-PEND-01.** En el primer viewport se leen primero filtros + listado. No hay una barra de tres controles tipo botón (`ghost`/`secondary` pill `h-11`) encima de los filtros.
- **CA-PEND-02.** El único control filled del cuerpo del panel es el CTA de fila («Abrir despacho» / «Continuar despacho» / «Decidir»). «Actualizar», «Ir a agenda» y «Visitas sin realizar» no usan `primary`, `secondary` ni `ghost` pill.
- **CA-PEND-03.** `PageHeader` permanece sin acciones. El `PortalPanel` no recibe `actions` para estos tres controles.

**Affordance y destino**

- **CA-PEND-04.** «Ir a agenda» es un enlace de texto a `/dashboard/scheduling/agenda` (mismo patrón visual que el strip: texto, hover con subrayado, foco visible). No está envuelto en `Button` pill.
- **CA-PEND-05.** «Visitas sin realizar» es un enlace de texto a `/dashboard/scheduling/unrealized-visits`, misma gramática que CA-PEND-04.
- **CA-PEND-06.** «Actualizar» es `Button variant="link"` con icono Refresh; dispara el refresh existente; muestra loading mientras `isLoading`. No navega.

**Layout**

- **CA-PEND-07.** Filtros ocupan su propia fila/grilla. Si hay al menos un filtro distinto del vacío, aparece «Limpiar filtros» `variant="ghost"` (altura de control de listado, patrón suscriptores). Si no hay filtros activos, ese control no se renderiza.
- **CA-PEND-08.** Los tres controles de chrome viven en la **fila de utilidad** entre filtros y `PortalResultsStrip`, no en un `PortalActionToolbar` ni a `justify-end` como cluster de pills.
- **CA-PEND-09.** Desktop: enlaces a la izquierda, «Actualizar» a la derecha de esa misma fila. Móvil: wrap de inicio a fin, sin cluster pegado al borde derecho.

**Accesibilidad**

- **CA-PEND-10.** Cada control de la fila de utilidad (enlaces y «Actualizar») tiene área de toque **≥44×44 px** (`min-h-11` o equivalente). El subrayado no es el único indicador de foco: hay anillo de foco visible (patrón del strip / `interactiveFocusClassName`).
- **CA-PEND-11.** Los enlaces se distinguen de «Actualizar» por rol: `link` vs `button`. Teclado: tabulación en orden filtros → enlaces → actualizar → primera fila del listado.
- **CA-PEND-12.** El color de enlace no inventa token. Cruce de módulo: receta ya usada en `SchedulingSummaryStrip` (`text-iwana-primary`). Refresco: receta `variant="link"` (lima `iwana-secondary-700` del CVA). Si identidad y AA chocaran, prevalece AA.

**Estados**

- **CA-PEND-13.** Vacío sin filtros: empty state existente, **sin** convertir los cruces de módulo en CTA filled del vacío.
- **CA-PEND-14.** Vacío con filtros activos: empty + «Limpiar filtros» (patrón suscriptores / oportunidades).
- **CA-PEND-15.** Error de carga: sigue el `PortalAlert` de la vista con «Reintentar»; no se duplica un segundo refresco sólido en el chrome del panel.

**Fuera**

- **CA-PEND-16.** Modo compacto no gana «Ir a agenda» ni «Visitas sin realizar». Esta spec no se cumple (ni se rompe) en compacto.

---

## 6. No se pide a otros tracks

| Track | Pedido |
| --- | --- |
| AI-DS-OWNER | Ninguno. Cero tokens, cero variantes, cero primitivas. |
| AI-SR-FULL | Ninguno. Destinos y refresh ya existen. |
| AI-EM-ARCH | Opcional: misma dirección A en `SchedulingToolbar.tsx` (agenda). No bloquea esta spec. |

Implementa AI-FE-PLATFORM contra esta spec. Verifica AI-SR-QA con CA-PEND-01…16.
