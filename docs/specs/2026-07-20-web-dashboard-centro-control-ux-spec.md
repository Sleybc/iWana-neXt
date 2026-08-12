# UX spec — Centro de control (apps/web dashboard)

**Fecha:** 2026-07-20
**Estado:** Congelado — **parcialmente superado el 2026-08-11** por [`2026-08-11-web-centro-control-portada-senal-ux-spec.md`](2026-08-11-web-centro-control-portada-senal-ux-spec.md) (enfoque A: sin tabla en el home; CA-02 y CA-09 del home dejan de aplicar). CA-01 y el directorio `/tenants` siguen vigentes aquí.
**Propietario:** AI-PROD-UX
**Alcance:** `/dashboard` → `DashboardClient.tsx`, `TenantsTable.tsx`, `SystemStatusPanel.tsx`, `PanelCard.tsx`
**Referencia de identidad:** `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` (Firma iWana §2.1, §2.6, §2.8)
**Plan de remediación padre:** `docs/plans/PLAN-WEB-UIUX-REMEDIACION-v1.0.md`

---

## 1. Objetivo y tarea principal del operador SYSTEM\_ADMIN

El operador SYSTEM\_ADMIN abre el Centro de control para resolver una pregunta operativa en menos de 30 segundos:

> **"¿Qué empresas necesitan mi atención ahora mismo y qué ha cambiado desde la última vez que entré?"**

Tarea principal (job-to-be-done): **detectar empresas con alertas activas, entrar directamente a la configuración de la que requiere acción y confirmar que la plataforma está sana antes de cerrar la sesión.**

Tareas secundarias en orden de frecuencia:
1. Filtrar el directorio por estado para revisar un subconjunto (ej.: solo las "En configuración").
2. Ver la actividad reciente para entender quién hizo qué y cuándo.
3. Llegar al historial completo de auditoría cuando necesita un contexto más amplio.
4. Registrar una nueva empresa (acción esporádica, accesible desde `PageHeader` → botón "Revisar empresas").

---

## 2. Alcance

### Dentro del alcance (este sprint)

- `DashboardClient.tsx` — orquestación, resumen operativo, layout 12 columnas, skeletons en paneles laterales.
- `TenantsTable.tsx` — fila clicable → detalle tenant, reconciliación de búsqueda global ↔ búsqueda local, empty states diferenciados.
- `SystemStatusPanel.tsx` — reordenamiento de indicadores (Atención operativa al frente), skeletons `isLoading`.
- `PanelCard.tsx` ("Directorio por estado") — filas accionables que filtran la tabla.

### Fuera del alcance (no tocar en este sprint)

- **Portal** (`apps/portal`) — diseño completamente independiente; ninguna decisión de esta spec aplica allí.
- **Sidebar** — el rediseño unificado (sidebar azul noche → firma iWana) está en fase 02 del plan de remediación; no se toca aquí.
- `KpiCard` de `@iwana/ui` — el componente fusionado de KPI card está planificado en fase 2.1 del plan Firma iWana; el `MetricCard.tsx` actual no se reemplaza en este sprint.
- Modales de usuarios, flujo de alta de tenants (`components/tenants/*`) — fases 02/03.
- Filtrado server-side, paginación real — fase 04.
- Persistencia de filtros en URL dentro de la tabla (más allá del `?q=` global) — afinamiento post-auditoría.

---

## 3. User journey (5 pasos)

```
[Paso 1] Aterrizaje y lectura rápida
  ↓  El operador llega al dashboard; ve los skeletons que toman la forma de los
     paneles reales mientras se carga. En < 300 ms aparecen resumen y conteos.

[Paso 2] Detección de alertas
  ↓  Lee "Resumen operativo": N activas y M en seguimiento.
     En el panel lateral izquierdo "Salud de plataforma", el primer indicador
     visible es "Atención operativa" (reordenado al frente; CA-05).
     Si hay empresas con error, el badge es rojo. Si todo está bien, es verde.

[Paso 3] Filtrado del directorio
  ↓  Hace clic en la fila "Con error" del panel "Directorio por estado"
     (CA-02) → la tabla filtra automáticamente por `PROVISIONING_FAILED`.
     Alternativa: teclea en el buscador de la tabla o selecciona el filtro
     de estado. La URL global `?q=` del buscador global también filtra la
     tabla (reconciliado, CA-09).

[Paso 4] Acción sobre una empresa
  ↓  Hace clic en cualquier celda de la fila de la empresa (CA-01) →
     navega a `/tenants/{id}/settings`.
     Si necesita una acción rápida (suspender/reactivar), usa el menú
     ··· que se conserva en la columna de acciones.

[Paso 5] Confirmación de estado
  ↑  Revisa el panel "Actividad reciente" para ver si el cambio ya
     se refleja. Opcionalmente navega a "Abrir historial completo"
     para trazabilidad detallada.
```

---

## 4. Criterios de aceptación CA-01 a CA-09

### CA-01 — Fila de tabla clicable → detalle tenant (menú ··· se conserva) · **BLOQUEANTE**

**Enunciado:** Cualquier clic en una celda de la fila de la tabla (columnas Empresa, Estado, Última actualización, Fecha creación) navega a `/tenants/{id}/settings`. El botón ··· en la columna Acciones sigue funcionando de forma independiente y **no** hereda el cursor pointer de la fila.

**Comportamiento esperado:**
- La fila `<tr>` recibe `role="link"` o se envuelve el área clicable de cada celda con `<a href>` invisible de tamaño completo (patrón cell-link), **sin** envolver `<td>` con `<a>` (HTML inválido).
- El elemento activo (fila/celda) muestra el focus ring de Firma iWana al navegar con teclado (`Tab` → `Enter`).
- Target mínimo de fila: 48 px de altura (no regresión; la altura actual cumple con `py-4`).
- El ··· conserva `stopPropagation` para no disparar la navegación de fila.

**Evidencia archivo:línea:**
- `TenantsTable.tsx:439-480` — `<tr>` sin `onClick` ni `href`; solo `hover:bg-gray-50`.
- `TenantsTable.tsx:169-171` — `ActionsDropdown` navega a settings desde el menú; esa lógica se reubica como acción primaria de fila (se puede conservar en el menú como redundancia accesible).

---

### CA-02 — Directorio por estado accionable (filtra tabla o navega con query) · **BLOQUEANTE**

**Enunciado:** Las filas del panel lateral "Directorio por estado" son clicables. Al hacer clic en "Activas", "En configuración", "Con error" o "Suspendidas", la tabla principal filtra por ese estado. El filtro se refleja en el selector de estado de la tabla (`<Select>` de `TenantsTable`). Si el panel tiene `0` empresas para un estado, la fila no es interactiva (cursor default, sin hover).

**Comportamiento esperado:**
- `DashboardClient.tsx` eleva el estado de filtro de estado (`statusFilter`) al nivel del cliente y lo pasa a `TenantsTable` como prop controlada (`statusFilter` + `onStatusFilterChange`).
- `PanelCard` recibe una prop opcional `onRowClick?: (rowValue: string) => void`; la fila muestra cursor pointer y foco visible cuando es clicable.
- El mapa de valor de fila → `TenantStatus`: "Activas" → `ACTIVE`, "En configuración" → `PROVISIONING`, "Con error" → `PROVISIONING_FAILED`, "Suspendidas" → `SUSPENDED`.

**Evidencia archivo:línea:**
- `DashboardClient.tsx:361-383` — `PanelCard` "Directorio por estado" sin `onFooterClick` ni callback de fila.
- `TenantsTable.tsx:208-236` — modo dual controlado/no-controlado existente; solo falta que `DashboardClient` pase los props de control.

---

### CA-03 — Skeletons en resumen y paneles laterales; sin ceros falsos mientras isLoading · **BLOQUEANTE**

**Enunciado:** Mientras `isLoading === true`, los tres paneles del lado derecho (`SystemStatusPanel`, "Actividad reciente", "Directorio por estado") muestran un skeleton con la silueta del contenido. El resumen operativo (headline "N activas y M en seguimiento") muestra un skeleton de texto en lugar de "0 activas y 0 en seguimiento". Los skeletons desaparecen al resolverse la carga, nunca antes.

**Comportamiento esperado del resumen operativo (`DashboardClient.tsx:298-313`):**
- Mientras `isLoading`, el `<h2>` del headline muestra un skeleton `h-7 w-72 animate-pulse rounded-lg bg-gray-200` en lugar de `{summary.active} empresas activas y {summary.attention} en seguimiento directo`.
- Los dos mini-cards "Empresas visibles" y "Cambios esta semana" muestran un skeleton de cifra (`h-7 w-12`) en lugar de `0`.

**Comportamiento esperado de paneles laterales:**
- `SystemStatusPanel`: cuando `isLoading`, los 4 indicadores se reemplazan por skeletons de card (`h-20 w-full animate-pulse rounded-2xl bg-gray-200`). El título y el resumen no cambian.
- `PanelCard` ("Actividad reciente"): mientras `isLoading`, 3–5 filas skeleton de `h-5 w-full` con `animate-pulse`.
- `PanelCard` ("Directorio por estado"): mientras `isLoading`, 4 filas skeleton.

**Evidencia archivo:línea:**
- `TenantsTable.tsx:377-399` — patrón de skeleton existente en la tabla; replicar a paneles laterales.
- `DashboardClient.tsx:298-325` — `summary.active` y `summary.attention` se calculan de `tenants` que es `[]` mientras carga → produce ceros falsos visibles.
- `SystemStatusPanel.tsx:98-123` — sin lógica de `isLoading`.
- `PanelCard.tsx:60-76` — sin lógica de `isLoading`.

---

### CA-04 — Empty "primera vez" con CTA diferible · **DIFERIBLE** (no bloqueante)

**Enunciado:** Cuando no hay empresas registradas (directorio vacío, sin filtros activos), el empty state de la tabla muestra una explicación orientada a la primera vez más un CTA opcional "Registrar primera empresa" (`Button variant="secondary"` que navega a `/tenants/new`). Este CTA puede omitirse si el operador no tiene permisos de alta (diferible).

**Comportamiento esperado:**
- El copy del empty state "primera vez" ya es correcto (`TenantsTable.tsx:428-433`): "Aún no hay empresas registradas / Cuando registres la primera empresa, aparecerá aquí con su estado operativo."
- Agregar, bajo ese copy, el botón "Registrar primera empresa" con `asChild` + `<Link href="/tenants/new">`, condicionado a `!hasActiveFilters`.
- El botón es `size="sm" variant="secondary"` según la jerarquía Firma iWana (lima = acción principal de página; azul sólido = acciones de sección; ghost = secundarias). Aquí es secundaria porque el flujo principal del dashboard no es registrar, sino monitorear.

**Evidencia archivo:línea:**
- `TenantsTable.tsx:421-437` — empty state sin CTA.
- `TenantsTable.tsx:244` — `hasActiveFilters` ya calculado; condicionar el CTA a `!hasActiveFilters`.

---

### CA-05 — Reordenar indicadores de "Salud de plataforma": Atención operativa al frente · **BLOQUEANTE**

**Enunciado:** El indicador "Atención operativa" pasa a la primera posición del array `healthIndicators` en `DashboardClient.tsx`, antes de "API de plataforma". El operador debe ver el estado operativo de las empresas antes que el estado técnico de infraestructura.

**Orden propuesto (de mayor a menor relevancia operativa):**
1. Atención operativa
2. API de plataforma
3. Base de datos
4. Redis y colas

**Evidencia archivo:línea:**
- `DashboardClient.tsx:210-261` — `healthIndicators` array: "API de plataforma" (pos 0), "Base de datos" (pos 1), "Redis y colas" (pos 2), "Atención operativa" (pos 3). Reordenar sin cambiar lógica.

---

### CA-06 — Skeletons con forma correcta en `SystemStatusPanel` · **BLOQUEANTE**

**Enunciado:** Cuando `isLoading` se pasa a `SystemStatusPanel`, los 4 indicadores muestran skeletons de la forma real del card (2 × 2 grid, `rounded-2xl`, misma altura que el card real). El título y el texto de resumen (si está disponible) siguen visibles. La prop `isLoading` se añade al contrato de `SystemStatusPanel`.

**Referencia de forma:**
```
┌──────────────────────┐  ┌──────────────────────┐
│  ░░░░░░░░░  (dot+label) │  │  ░░░░░░░░░            │
│  ░░░░░░░░░  (título)    │  │  ░░░░░░░░░            │
│  ░░░░░░░    (detalle)   │  │  ░░░░░░               │
└──────────────────────┘  └──────────────────────┘
```
Clases de referencia del skeleton: `animate-pulse rounded-2xl bg-gray-200 dark:bg-dark-surface-4`.

**Evidencia archivo:línea:**
- `SystemStatusPanel.tsx:12-18` — interfaz sin `isLoading`.
- `DashboardClient.tsx:340-345` — llamada a `SystemStatusPanel` sin `isLoading`.

---

### CA-07 — Skeletons en `PanelCard` · **BLOQUEANTE**

**Enunciado:** `PanelCard` recibe una prop `isLoading?: boolean`. Cuando es `true`, las filas de datos se reemplazan por N skeletons (donde N es `rows.length` o un valor fijo de 4 si `rows` está vacío durante la carga). El título y los `columnHeaders` siguen visibles; el footer no se muestra mientras carga.

**Referencia de skeleton de fila:**
```
<div class="flex items-center justify-between py-3 border-b ...">
  <div class="h-4 w-32 animate-pulse rounded bg-gray-200" />
  <div class="h-4 w-8 animate-pulse rounded bg-gray-200" />
</div>
```

**Evidencia archivo:línea:**
- `PanelCard.tsx:60-76` — renderizado de filas sin lógica `isLoading`.
- `DashboardClient.tsx:347-383` — ambos `PanelCard` reciben `rows` calculados de `recentAudit`/`summary`, que son `[]`/`0` mientras carga.

---

### CA-08 — El resumen operativo no muestra ceros mientras isLoading · **BLOQUEANTE**

**Enunciado:** La sección "Resumen operativo" de `DashboardClient` evita renderizar cifras derivadas de `summary` mientras `isLoading === true`. Se aplica skeleton al headline y a los dos mini-cards de conteo.

**Copy de skeleton accesible:** `<span class="sr-only">Cargando resumen operativo...</span>` dentro del contenedor del headline skeleton.

**Evidencia archivo:línea:**
- `DashboardClient.tsx:298-326` — `summary.active` y `summary.attention` usados directamente sin guardia de `isLoading`.
- `DashboardClient.tsx:311-322` — mini-cards "Empresas visibles" y "Cambios esta semana" usan `visibleTenants.length` y `summary.updatedLast7Days`.

---

### CA-09 — Reconciliar búsqueda global (?q=) y búsqueda local de la tabla · **BLOQUEANTE**

**Enunciado:** Existe un conflicto de estado entre la búsqueda global (`?q=` en URL, gestionada por `DashboardClient`) y la búsqueda interna de `TenantsTable`. El objetivo es una fuente única de verdad para la búsqueda dentro del dashboard.

**Diseño acordado (modo totalmente controlado):**
- `DashboardClient` eleva la búsqueda: lee `?q=` de `useSearchParams` y lo pasa como `searchQuery` + `onSearchChange` a `TenantsTable`.
- `onSearchChange` actualiza la URL con `router.replace('?q=...')` (sin push) para que el browser back funcione correctamente.
- `TenantsTable` no mantiene `internalSearch` cuando `onSearchChange` está provisto (ya implementado en `TenantsTable.tsx:219`).
- El resultado: el buscador global del header, el buscador de la tabla y el selector de estado actúan sobre el mismo dataset visible.

**Estado actual del conflicto:**
- `DashboardClient.tsx:329-336` pasa `searchQuery={globalQuery}` pero **omite** `onSearchChange`. La tabla queda en modo semi-controlado: inicializa desde la URL pero los cambios del usuario en el input de la tabla no actualizan la URL.
- `TenantsTable.tsx:238-242` — `useEffect` que sincroniza `internalSearch` desde `searchQuery` solo cuando `!onSearchChange`; como no se pasa, la tabla cae a modo no controlado tras el primer render.

**Evidencia archivo:línea:**
- `DashboardClient.tsx:329-336` — `<TenantsTable searchQuery={globalQuery} />` sin `onSearchChange`.
- `TenantsTable.tsx:219` — `const search = onSearchChange ? searchQuery : internalSearch;` — modo dual ya implementado; solo falta que el padre pase el callback.

---

## 5. Estados completos de la pantalla

### 5.1 Loading (isLoading === true)

- **Resumen operativo:** headline → skeleton de texto (`h-7 w-72`). Mini-cards → skeleton de cifra (`h-6 w-12`). Eyebrow "Resumen operativo" visible. Subtítulo visible.
- **Tabla:** 5 filas skeleton con forma real (implementado, `TenantsTable.tsx:377-399`).
- **SystemStatusPanel:** 4 cards skeleton 2×2; título y "Última lectura — Pendiente" visibles.
- **PanelCard "Actividad reciente":** 5 filas skeleton.
- **PanelCard "Directorio por estado":** 4 filas skeleton.
- **Acciones del PageHeader** (botones "Ver historial" y "Revisar empresas"): visibles y operables; no dependen del estado de carga.

### 5.2 Empty — primera vez (sin empresas, sin filtros)

- **Tabla:** copy "Aún no hay empresas registradas / Cuando registres la primera empresa, aparecerá aquí." + CTA diferible "Registrar primera empresa" (`Button size="sm" variant="secondary"`, `href="/tenants/new"`).
- **Resumen operativo:** headline "0 empresas activas y 0 en seguimiento directo" (no skeleton; es un estado real).
- **Directorio por estado:** conteos en `0`; filas no interactivas (CA-02).
- **Actividad reciente:** copy existente "Aún no hay cambios recientes para mostrar."

### 5.3 Empty — sin resultados de filtro (hasActiveFilters === true)

- **Tabla:** copy "Sin empresas con estos filtros / Ajusta la búsqueda o el estado, o limpia el filtro para ver todo el directorio." + botón "Limpiar filtro" (ya implementado, `TenantsTable.tsx:311-322`).
- Sin CTA de alta; no es un empty de primera vez.
- **Referencia:** `TenantsTable.tsx:424-437` — distinción ya presente, sin cambios de copy.

### 5.4 Error (error !== null)

- **Tabla:** copy del error con botón "Reintentar" (implementado, `TenantsTable.tsx:401-418`).
- **SystemStatusPanel:** indicador "API de plataforma" en estado `warning`; detail = "No pudimos cargar el directorio principal." (implementado, `DashboardClient.tsx:215-219`).
- **Actividad reciente:** si `auditError`, el panel muestra el mensaje de error como única fila (implementado, `DashboardClient.tsx:351-356`).
- Los paneles que sí cargaron (p. ej. salud si el endpoint de health respondió) siguen mostrando sus datos reales.
- Degradación parcial es el patrón correcto: no bloquear la pantalla completa por el fallo de un solo servicio.

### 5.5 Success (isLoading === false, error === null, tenants.length > 0)

- Resumen operativo con cifras reales.
- Tabla con datos, filas clicables, menú ··· operativo.
- Paneles laterales con datos reales.
- Directorio por estado con filas interactivas (CA-02).

---

## 6. Criterios de accesibilidad mínimos (WCAG 2.2 AA)

### Foco visible

- Las filas clicables de la tabla deben tener focus ring visible al navegar con teclado. Clase de referencia: `focus-visible:ring-2 focus-visible:ring-iwana-secondary/20 focus-visible:ring-offset-1 focus-visible:outline-none` (Firma iWana §3.6 — anillo lima al 15-20%).
- Las filas del `PanelCard` que sean interactivas (CA-02) deben tener el mismo focus ring.
- El DropdownMenuTrigger (···) ya tiene `min-h-11 min-w-11` (target ≥44px); no regresionar.

### Navegación por teclado

- `Tab` recorre: acciones del PageHeader → buscador → selector de estado → filas de tabla → menú ··· → paneles laterales.
- `Enter` sobre una fila clicable navega al detalle del tenant.
- `Escape` dentro del menú ··· lo cierra y devuelve el foco al trigger (comportamiento de `DropdownMenu` de Radix, no regresionar).

### Lectores de pantalla

- `<table aria-label="Lista de empresas">` ya existente (`TenantsTable.tsx:330`); no cambiar.
- Las filas clicables deben tener `aria-label` que incluya el nombre del tenant: `aria-label={`Ver detalle de ${tenant.name}`}` en el elemento que recibe el `onClick`/`href`.
- Los skeletons de carga deben tener `aria-hidden="true"` en sus `<div>` de placeholder; el `<sr-only>` de texto "Cargando..." en el contenedor padre.
- Contraste de color: los badges de estado ya cumplen AA (tokens `success-700`/`error-700`/`warning-700` sobre `*-50`).

---

## 7. Nota de implementación: empty "primera vez" vs filtro activo en TenantsTable.tsx:424-434

La distinción de empty states ya existe en el código:

```
TenantsTable.tsx:425-433
  {hasActiveFilters
    ? 'Sin empresas con estos filtros'
    : 'Aún no hay empresas registradas'}
  {hasActiveFilters
    ? 'Ajusta la búsqueda o el estado...'
    : 'Cuando registres la primera empresa...'}
```

**Qué falta (CA-04):** debajo del copy "primera vez" agregar el CTA diferible, condicionado a `!hasActiveFilters`. El botón no va en el caso de filtro activo porque el usuario sabe que hay datos, solo está filtrando.

**Riesgo de falso positivo de "primera vez":** cuando `isLoading === true`, `tenants` es `[]` y `filtered.length === 0` → la tabla entraría al branch del empty state mostrando el copy "Aún no hay empresas registradas" durante la carga. Solución: **el branch de empty state no debe evaluarse mientras `isLoading === true`**; el skeleton de filas (ya implementado) cubre ese estado y debe tener prioridad (`isLoading` va en el primer branch del condicional ternario anidado, que ya es el caso en `TenantsTable.tsx:377`).

---

## 8. Lista de CA bloqueantes para AI-FE-PLATFORM en este sprint

Los siguientes criterios deben quedar en verde **antes de cerrar el sprint** para que la pantalla sea funcional y accesible:

| # | Criterio | Archivo principal a tocar |
|---|---|---|
| CA-01 | Fila tabla clicable → detalle tenant (menú ··· se conserva) | `TenantsTable.tsx` |
| CA-02 | Directorio por estado filtra tabla | `DashboardClient.tsx`, `PanelCard.tsx` |
| CA-03 | Sin ceros falsos en resumen mientras isLoading | `DashboardClient.tsx` |
| CA-05 | Atención operativa al frente en healthIndicators | `DashboardClient.tsx` |
| CA-06 | Skeletons con forma en SystemStatusPanel | `SystemStatusPanel.tsx`, `DashboardClient.tsx` |
| CA-07 | Skeletons en PanelCard | `PanelCard.tsx`, `DashboardClient.tsx` |
| CA-08 | Resumen operativo sin ceros falsos (misma causa que CA-03) | `DashboardClient.tsx` |
| CA-09 | Reconciliar búsqueda global ↔ búsqueda local | `DashboardClient.tsx` |

**Diferible al siguiente sprint (no bloqueante):**

| # | Criterio | Motivo del diferimiento |
|---|---|---|
| CA-04 | Empty "primera vez" con CTA | El empty state actual es funcional; el CTA es mejora UX no crítica para operación |

---

*Spec congelada. Cambios posteriores se versionan como `v1.1+` y se notifican a AI-FE-PLATFORM antes de implementar.*
