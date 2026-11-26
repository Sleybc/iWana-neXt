# UX spec — Empresas · directorio (apps/web)

**Fecha:** 2026-08-11  
**Versión:** 1.1  
**Estado:** Congelado — v1.1 aprobada por el CTO el 2026-11-25  
**Aclaración 2026-08-11:** §5 — las cifras KPI son del parque, no del lote de la tabla. Fuente vigente: `tenantApi.summary()` (v1.1).  
**Aclaración 2026-08-11 (K):** se retira el enlace `Volver al centro de control` y la cáscara extra del bloque KPI. El sidebar ya cubre ese destino. Quedan solo los 3 chips como pulso del parque.  
**Aclaración 2026-08-11 (B0):** `Nueva empresa` sale del PageHeader y pasa al chrome de la tabla (junto a búsqueda y filtro). El header queda en H1 + subtítulo.  
**Propietario:** AI-PROD-UX  
**Alcance:** `/tenants` de `apps/web` → [`page.tsx`](../../apps/web/src/app/(protected)/tenants/page.tsx) (listado)  
**No aplica a:** `apps/portal`  
**Prompt:** [`PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-EMPRESAS-DIRECTORIO-ALINEACION-v1.0.md)  
**Informe:** [`INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md)  
**UX padre (portada):** [`2026-08-11-web-centro-control-portada-senal-ux-spec.md`](2026-08-11-web-centro-control-portada-senal-ux-spec.md)  
**Contrato DS hermano:** [`2026-08-11-web-empresas-directorio-ds-contrato.md`](2026-08-11-web-empresas-directorio-ds-contrato.md)  
**Identidad:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**Copy de producto:** [`apps/web/src/lib/platform-ui-copy.ts`](../../apps/web/src/lib/platform-ui-copy.ts) → `dashboard.status*` / `directoryError` / `chip*`

### Changelog

| Ver | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-08-11 | Congelación inicial. |
| **1.1** | 2026-11-25 | Franja de pulso compartida en lugar de 3 chips; sin eyebrow; H2 `Directorio` en la tabla; cifras de `tenantApi.summary()`; error propio del resumen. CA-EMP-06 reescrito. |

---

## 1. Persona / tarea

**Persona:** operador de plataforma (`SYSTEM_ADMIN`) en `apps/web`.

**Tarea (un ciclo, sin wizard ni tabs):**

1. **Encuentra** una empresa (búsqueda o filtro de estado, incluido el deep-link desde el centro de control).
2. **Reconoce** el estado con el **mismo lenguaje** de la portada (chips y distribución del home).
3. **Actúa** sobre la fila: entrar a la ficha, suspender, reactivar o reintentar el alta.

El directorio canónico sigue siendo `/tenants`. Esta spec **alinea** chrome, copy, empty, KPI y a11y de tabla. No rediseña el listado.

---

## 2. Arquitectura de página

Sin wireframe ornamental. Tres bloques, en este orden. La tabla no queda bajo prosa.

```text
375 / 768 (1 col)                  1280
─────────────────                  ────────────────────────────
B0 PageHeader                      B0 PageHeader
K  Pulso · 3 celdas apiladas       K  Pulso · 3 celdas en fila
T  Tabla (filtros + filas)         T  Tabla
```

### B0 · PageHeader

| Pieza | Valor |
| --- | --- |
| H1 | `Empresas` |
| Subtítulo | `Estado, contacto y última actualización de cada empresa.` |
| CTA primario | **Ninguno en el header.** `Nueva empresa` vive en el chrome de la tabla. |

Un solo H1. El único H2 es el título de la tabla. **Sin** párrafo de hero debajo del header.

### K · Pulso

| Pieza | Valor |
| --- | --- |
| Nombre accesible | `Resumen de empresas por estado`. Sin eyebrow visible. |
| Celdas | exactamente **3** (Activas / En configuración / Requieren atención) |
| Enlace secundario | **Ninguno.** El sidebar ya lleva a Centro de control. |

Una sola franja (contrato DS hermano). Sin cuarta celda «Directorio total». Sin párrafo instructivo. Sin botón de retorno.

Carga: skeleton con forma de celda. Prohibido pintar `0` o `...` mientras `isLoading`. Si falla el resumen, un error con un solo `Reintentar` sustituye la franja; nunca ceros.

### T · Tabla

- Un título H2: `Directorio`, que nombra la región desplazable de la tabla. **Sin** segundo párrafo.
- Filtro de estado + búsqueda + CTA `Nueva empresa` → `/tenants/new` en el chrome de la tabla.
- Pie: **load-more** (offset). No pager numerado.

### Empty

Dos recetas. No unificar.

| Condición | Qué se ve | CTA |
| --- | --- | --- |
| **Primera vez** — parque total = 0 y **sin** filtros (`status` ausente o `TODAS`, `search` vacío) | Título `Aún no hay empresas registradas` + hint de registro | `Registrar primera empresa` → `/tenants/new` |
| **Filtros / búsqueda sin filas** — hay parque o hay query activa | Título `Sin empresas con estos filtros` + hint para ajustar o limpiar | **No** hay CTA de primera empresa |

El CTA `Registrar primera empresa` **solo** si el parque total es 0 y no hay filtros. El CTA `Nueva empresa` del chrome de la tabla permanece en todos los estados operables.

---

## 3. Copy literal

Congelado tal cual. Sentence case. Fuente de rótulos de estado: `PLATFORM_UI_COPY.dashboard`.

| Superficie | Texto |
| --- | --- |
| H1 | Empresas |
| Subtítulo | Estado, contacto y última actualización de cada empresa. |
| Nombre accesible del pulso | Resumen de empresas por estado |
| Pista de celda que filtra | Filtrar directorio |
| Pista de «Requieren atención» | Ir al directorio |
| Error del resumen | No pudimos cargar el resumen de empresas. |
| Título de tabla | Directorio |
| CTA tabla | Nueva empresa |
| Búsqueda | Buscar por empresa o contacto… |
| Error listado | No pudimos cargar el directorio. Reintenta en unos minutos. |
| Empty parque 0 | CTA Registrar primera empresa |
| Éxito suspender | Empresa suspendida. |
| Éxito reactivar | Empresa reactivada. |
| Éxito reintentar | Reintento de alta enviado. |
| Fallo acción | No pudimos completar la acción. Reintenta en unos minutos. |
| Reintentar | Reintentar |

**Prohibido en UI:** `tenant`, `slug`, `identificador`, `MFA`, `CRUD`, «puesta en marcha» como **estado**, «Activo», «Configurando», «Configuración fallida», «correctamente», «Error al…», «No fue posible cargar empresas.»

«Puesta en marcha» solo vive en el hint de historial/centro (`statusHintFailed`: «La puesta en marcha no terminó.»). No en KPI, badge, filtro ni H1/subtítulo.

El error de listado es `PLATFORM_UI_COPY.dashboard.directoryError`. No un string suelto.

---

## 4. Estados — plural vs singular

Un helper. Un mapa. Fuente plural: `PLATFORM_UI_COPY.dashboard.status*`.

| Enum (copy) | Query / API | Plural (filtro, KPI, chip) | Singular (badge de fila) |
| --- | --- | --- | --- |
| `ACTIVE` | `ACTIVE` | Activas | Activa |
| `PROVISIONING` | `PROVISIONING` | En configuración | En configuración |
| `FAILED` | `PROVISIONING_FAILED` | Con error | Con error |
| `SUSPENDED` | `SUSPENDED` | Suspendidas | Suspendida |
| `INACTIVE` | `INACTIVE` | Inactivas | Inactiva |
| `MARKED_FOR_DELETION` | `MARKED_FOR_DELETION` | En eliminación | En eliminación |

Cero: Activo · Configurando · Configuración fallida · En puesta en marcha (como estado).

El valor de URL y de `tenantApi.list({ status })` para «Con error» es el que **ya** usa la página y el deep-link del home (`PROVISIONING_FAILED`). No se introduce `?status=FAILED`.

Filtro «todas»: `TODAS` en cliente; **no** se escribe en la URL (se omite `status`).

---

## 5. Navegación del pulso

Tres celdas, este orden, ni uno más:

| Celda | Label (copy vivo) | Cifra | Destino si count > 0 |
| --- | --- | --- | --- |
| Activas | `chipActive` | `status === 'ACTIVE'` en el **parque** | `/tenants?status=ACTIVE` |
| En configuración | `chipProvisioning` | `status === 'PROVISIONING'` en el **parque** | `/tenants?status=PROVISIONING` |
| Requieren atención | `chipAttention` | `PROVISIONING_FAILED` + `SUSPENDED` + `INACTIVE` + `MARKED_FOR_DELETION` en el **parque** | **Ninguno.** No inventa query. Mismo criterio S-3 del home: mueve el foco al título de la tabla. |

Las cifras salen de `tenantApi.summary()` (conteo por estado del parque). El lote filtrado alimenta solo la tabla. Filtrar no altera las celdas.

Reglas:

1. Cifra `0` (estado real, no carga): la celda **no** es interactiva.
2. Mientras carga: skeleton; prohibido `0` o `...`.
3. Aplicar `?status=` **conserva** `search` / `sort` / `dir` si ya estaban; no los borra.
4. Clic en Activas o En configuración con cifra > 0 resetea el listado a `offset = 0` y pide al servidor el `status` correspondiente.

---

## 6. Filtros URL

Persistidos con `router.replace` (sin scroll). Deep-link del home (`/tenants?status=ACTIVE` · `/tenants?status=PROVISIONING` · `/tenants?status=PROVISIONING_FAILED`) **sigue funcionando**.

| Param | Ya vive en `/tenants` | Semántica |
| --- | --- | --- |
| `status` | sí | Enum de §4 (query). Ausente = todas. Valor inválido = todas. |
| `search` | sí — **este es el nombre; no `q`** | Texto de búsqueda. Vacío se omite. Se pasa al API como `search`. |
| `sort` | no (hoy solo en memoria) | Columna ya ordenable: `name` · `status` · `updatedAt` · `createdAt`. |
| `dir` | no (hoy solo en memoria) | `asc` · `desc`. |

No se inventa un segundo nombre de búsqueda. La página ya lee y escribe `searchParams.get('search')`.

Comportamiento de fetch (contrato API intacto, sin endpoint nuevo):

```
tenantApi.list({
  limit,
  offset,          // 0 cuando cambian status o search
  status: statusFilter !== 'TODAS' ? statusFilter : undefined,
  search: searchQuery.trim() || undefined,
})
```

- Cambiar filtro o búsqueda → `offset = 0` y nueva petición.
- «Cargar más» → `offset += limit` **con los mismos** `status` / `search`.
- No recortar en cliente un lote sin filtrar para simular el deep-link.

---

## 7. Accesibilidad (WCAG 2.2 AA)

- **Un H1** (`Empresas`). El título de tabla no es un segundo `h1`. Es el único H2 (`Directorio`).
- **`aria-sort`** en cada `<th>` ordenable. Exactamente **uno** distinto de `none` (el activo: `ascending` o `descending`). Los demás `none`.
- **Un solo control de fila al teclado:** el nombre de la empresa → ficha. Quitar `onClick` de celdas de estado y fechas. Esas celdas no fingen botón.
- Fechas con `<time dateTime>`.
- Targets ≥ 44 px. Foco: receta del contrato DS hermano (`interactiveFocusClassName`).
- Color no es la única señal: el badge lleva texto singular de §4.
- Nombre accesible de la celda navegable: el del home (`Ver empresas activas` / `Ver empresas en configuración`). Atención: `Requieren atención. Ir al directorio`. Este nombre sustituye al contenido y la cifra no se anuncia: deuda conocida, dueño AI-DS-OWNER ([contrato](2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md#7bis2-pulsestrip-primitive) §7bis.2).
- `sr-only` de carga: una frase breve («Cargando el directorio»).
- Tras clic en «Requieren atención», el título de la tabla recibe foco visible (`tabIndex={-1}`), también con movimiento reducido.
- La región desplazable de la tabla es enfocable y la nombra el H2.

---

## 8. Estados de la pantalla

| Estado | Qué se ve |
| --- | --- |
| **Carga** | B0 operable. Pulso en skeleton. Tabla en skeleton de filas. Sin ceros falsos. |
| **Éxito** | Cifras reales. Celdas con 0 no interactivas. Filas con badge singular. |
| **Primera vez** | Pulso en 0 no interactivo. Empty de parque 0 + CTA `Registrar primera empresa`. |
| **Filtro / búsqueda vacíos** | Empty de filtros. Sin CTA de primera empresa. |
| **Error de listado** | Alert/bloque recuperable con `directoryError` + `Reintentar`. No se finge un directorio vacío. |
| **Error del resumen** | Error con un solo `Reintentar` en lugar de la franja. La tabla sigue operable. |
| **Éxito de acción** | Mensaje breve de §3 (suspender / reactivar / reintentar). |
| **Fallo de acción** | `No pudimos completar la acción. Reintenta en unos minutos.` |

Acciones de fila que **ya existen** y se conservan (solo cambia el copy de resultado): entrar, suspender, reactivar, reintentar alta. El diálogo de confirmación permanece; su foco no es alcance de esta spec.

---

## 9. Criterios de aceptación

Origen: informe; CA-EMP-06 reescrito en v1.1. No reenumerar.

| ID | Criterio |
| --- | --- |
| **CA-EMP-01** | Badges, filtro y pulso usan `PLATFORM_UI_COPY.dashboard.status*`. Cero «Configurando», «Configuración fallida», «En puesta en marcha», «Activo». |
| **CA-EMP-02** | `/tenants?status=PROVISIONING` muestra «En configuración» en filtro y filas. |
| **CA-EMP-03** | Error de listado: `No pudimos cargar el directorio. Reintenta en unos minutos.` |
| **CA-EMP-04** | Empty primera vez ≠ empty de filtros. CTA `Registrar primera empresa` solo en parque vacío. |
| **CA-EMP-05** | Búsqueda sin «identificador», «tenant» ni «slug». |
| **CA-EMP-06** | Un H1, un subtítulo corto y un único H2 `Directorio` (título de la tabla). Pulso con nombre accesible `Resumen de empresas por estado`, sin eyebrow `Directorio`. |
| **CA-EMP-07** | Toasts/Alertas: éxito breve; error `No pudimos… Reintenta…`. |
| **CA-EMP-08** | Celdas Activas y En configuración (cifra > 0) aplican `?status=`. |
| **CA-EMP-09** | `aria-sort` en encabezados ordenables; un solo control de fila al teclado. |
| **CA-EMP-10** | Listado pide `status`/`search` al servidor. |

---

## 10. Fuera de alcance

No entra. No se abre en esta fase.

| Fuera | Motivo |
| --- | --- |
| Pager numerado / `meta.capabilities.randomAccess` (**ADR-065**) | Deuda declarada. El pie sigue siendo load-more. |
| `apps/portal` e import desde portal | Superficie distinta / boundary |
| Ficha `/tenants/[id]`, `/tenants/new` (más allá del CTA), settings, usuarios | Fuera del listado |
| NotificationBell | Otro lema de estado; deriva hermana |
| G6.5 / G7 / commit / push | No se anticipan |
| Endpoints, OpenAPI, migraciones, `@Roles` | Contrato API intacto |
| Primitive nueva en `@iwana/ui` (se reutiliza `PulseStrip`), tokens de marca | Carril rápido DS |
| Reabrir enfoque A del home ni copy `status*` del dashboard | Ya congelado |
| Foco de `ConfirmDialog` | Fuera del núcleo |

---

*v1.0 congelada 2026-08-11 por AI-PROD-UX. Track A-1 del prompt G4. Transcribe informe + §7; no inventa flujo. v1.1: aprobada por el CTO.*
