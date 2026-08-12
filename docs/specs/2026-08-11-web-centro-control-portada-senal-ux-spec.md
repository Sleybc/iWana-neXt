# UX spec — Centro de control · portada de señal (apps/web)

**Fecha:** 2026-08-11  
**Versión:** 1.0  
**Estado:** Congelado — desbloqueante para AI-DS-OWNER (contrato hermano) y AI-FE-PLATFORM  
**Propietario:** AI-PROD-UX  
**Decisión de enfoque:** **A — Portada de señal** (confirmada al ejecutar el plan de lluvia de ideas; B y C quedan descartados)  
**Alcance:** `/dashboard` de `apps/web` → [`DashboardClient.tsx`](../../apps/web/src/components/dashboard/DashboardClient.tsx)  
**No aplica a:** `apps/portal`  
**Padre (parcialmente superado):** [`2026-07-20-web-dashboard-centro-control-ux-spec.md`](2026-07-20-web-dashboard-centro-control-ux-spec.md)  
**Contrato DS hermano:** [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](2026-08-11-web-centro-control-portada-senal-ds-contrato.md)  
**Identidad:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**Copy de producto:** [`apps/web/src/lib/platform-ui-copy.ts`](../../apps/web/src/lib/platform-ui-copy.ts)  
**Aclaración 2026-08-11:** §5 — B0 sin CTAs de salto. Destinos viven en la señal y el sidebar.

---

## 1. Decisión — por qué A

El operador SYSTEM_ADMIN abre el Centro de control para resolver, en menos de 30 segundos:

> ¿Qué está bien, qué requiere acción y a dónde voy?

La spec 2026-07-20 resolvió detección + filtro *en sitio* montando el mismo [`TenantsTable`](../../apps/web/src/components/dashboard/TenantsTable.tsx) que ya vive en `/tenants`. Eso duplica el directorio, infla el resumen con prosa fija y deja «Directorio por estado» como filtro de una tabla que no debería estar en el home.

| Enfoque | Veredicto |
| --- | --- |
| **A · Portada de señal** | **Elegido.** Cuatro chips, distribución accionable, Monitoreo intacto, actividad al pie. Sin tabla. |
| B · Pulso mínimo | Descartado: pierde el escaneo de activas / en configuración / cambios de la semana. |
| C · Lista de atención | Descartado: reintroduce filas de `/tenants` en el home. |

`/tenants` sigue siendo el **directorio canónico** (tabla, `?status=`, `?search=`, suspender/activar, load-more).

---

## 2. Qué entra y qué no

### Entra

1. Sustituir el bloque «Resumen operativo» (titular + párrafo + dos mini-cards) por una **franja de 4 chips de señal**.
2. **Retirar** `TenantsTable` del home. El `PageHeader` **no** lleva CTAs de salto («Revisar empresas», «Ver historial»): eso vive en chips, D, A y el sidebar.
3. Convertir «Directorio por estado» en **distribución accionable** (barra de proporción + segmentos/chips con cifra) que **navega** a `/tenants?status=`.
4. Mover «Actividad reciente» a **ancho completo al pie**, máximo **5** eventos, semántica de timeline.
5. Conservar **Monitoreo** (`SystemStatusPanel`) sin cambio de contenido ni orden de indicadores (CA-05 vigente).
6. Empty de primera vez **sin tabla**: mensaje + CTA «Registrar primera empresa» → `/tenants/new`.

### No entra

- Portal, endpoints nuevos, `@Roles`, migraciones, tokens de marca, primitive nueva en `@iwana/ui`.
- Cambiar el subtítulo largo del `PageHeader` a un rediseño de marca (solo se permite acortarlo; ver §5).
- Filtro `?q=` en el home: deja de aplicar a una tabla local. La búsqueda de empresas vive en `/tenants`.
- Acciones de ciclo de vida (suspender/activar) en el home.
- G6.5 / G7.

### Qué queda superado de la spec 2026-07-20

| CA 2026-07-20 | En esta spec |
| --- | --- |
| CA-01 fila → detalle | Sigue vigente **en `/tenants`**, no en el home. |
| CA-02 filtra la tabla del home | **Superado.** El clic navega a `/tenants?status=`. |
| CA-03 / CA-08 ceros falsos del resumen | **Reescritos** como CA-PS-03 (skeletons de chips). |
| CA-04 empty + CTA | **Reescrito** como CA-PS-06 (ya no cuelga de la tabla del home). |
| CA-05 Atención operativa al frente | **Vigente** sin cambio. |
| CA-06 / CA-07 skeletons Monitoreo y PanelCard | Vigentes para Monitoreo; actividad y estados usan CA-PS-03. |
| CA-09 `?q=` ↔ tabla del home | **Superado** en el home. `/tenants` conserva `?search=` / `?status=`. |

---

## 3. Layout

```text
375 / 768 (1 col)                  1280 (12 col)
─────────────────                  ────────────────────────────
B0 PageHeader                      B0 PageHeader
S  4 chips (1 / 2 / 4 cols)        S  4 chips en una fila
M  Monitoreo                       M  Monitoreo (7) | D Estados (5)
D  Distribución por estado         A  Actividad reciente (12, al pie)
A  Actividad reciente (5)
```

Sin `TenantsTable`. Sin cards dentro de cards en el resumen.

---

## 4. Chips de señal (S)

Cuatro, en este orden, ni uno más:

| ID | Rótulo (sentence case) | Cifra | Acento | Destino al clic |
| --- | --- | --- | --- | --- |
| S-1 | Activas | `status === 'ACTIVE'` | `primary` | `/tenants?status=ACTIVE` |
| S-2 | En configuración | `status === 'PROVISIONING'` | `warning` | `/tenants?status=PROVISIONING` |
| S-3 | Requieren atención | `PROVISIONING_FAILED` + `SUSPENDED` + `INACTIVE` + `MARKED_FOR_DELETION` | `danger` | No hay un `status` único. Clic **mueve el foco** al encabezado de la distribución (D). No inventar query. |
| S-4 | Cambios esta semana | `updatedAt` en los últimos 7 días (misma regla `isWithinDays` vigente) | `neutral` | **No navegable.** No existe filtro temporal en `/tenants`. |

Reglas:

1. Cifra `0` (estado real, no carga): el chip **no** es interactivo.
2. Mientras `isLoading`: skeleton con la forma del chip; **prohibido** pintar `0`.
3. Sin párrafo instructivo. Sin «Empresas visibles». El eyebrow de sección es `Resumen operativo` (una vez, encima de la franja).
4. Nombre accesible del chip navegable: `Ver empresas {rótulo en minúsculas}` (p. ej. «Ver empresas activas»).
5. S-3 accesible: `Ver el desglose por estado` (destino = encabezado de D, `tabIndex={-1}`).

---

## 5. Encabezado (B0)

- Título: `Centro de control` (`PLATFORM_UI_COPY.dashboard.title`).
- Subtítulo visible (reemplaza el párrafo largo actual del resumen; más corto que el hardcode de `DashboardClient` hoy):

  `Salud de plataforma, altas en curso y lo que requiere atención.`

- **Sin acciones en el header.** «Ver historial» y «Revisar empresas» competían con el sidebar (`Empresas`, `Historial de cambios`) y con los destinos ya contextuales: chips S-1/S-2 → `/tenants?status=`, pie D `Ver todas las empresas`, pie A `Abrir historial`. El contenedor B0 solo orienta (título + subtítulo).

---

## 6. Distribución por estado (D)

Sustituye el `PanelCard` de cuatro filas estáticas.

**Título:** `Empresas por estado` (deja de llamarse «Directorio por estado» para no competir con el ítem de nav «Empresas»).

**Anatomía:**

1. Encabezado al patrón de Monitoreo: eyebrow `Directorio`, título, frase de lectura y chip `En el directorio` con el total.
2. Barra apilada horizontal: un tramo por estado con conteo **> 0**. Ancho proporcional al conteo.
3. Leyenda en teselas 2×2: rótulo + cifra `font-mono tabular-nums` + hint de una línea (qué significa el estado).

| Tramo | Rótulo | `status` | Tono (no lima) |
| --- | --- | --- | --- |
| D-1 | Activas | `ACTIVE` | `success` |
| D-2 | En configuración | `PROVISIONING` | `warning` |
| D-3 | Con error | `PROVISIONING_FAILED` | `error` |
| D-4 | Suspendidas | `SUSPENDED` | `neutral` |
| D-5 | Inactivas | `INACTIVE` | `neutral` — **solo si conteo > 0** |
| D-6 | En eliminación | `MARKED_FOR_DELETION` | `error` — **solo si conteo > 0** |

Clic en tramo o chip con conteo > 0 → `Link` a `/tenants?status={valor}`. Cero → no interactivo, no se finge botón.

Si el parque total es 0 (primera vez): no se pinta una barra vacía decorativa. Se muestra el empty de §8.

Pie opcional: `Ver todas las empresas` → `/tenants` (sin query).

---

## 7. Actividad reciente (A)

- Ancho completo **debajo** de M+D.
- Máximo **5** eventos (`platformAuditApi.list({ limit: 5 })`; hoy pide 10 y recorta).
- Cada fila: frase humana `{quién} {verbo} {qué}` (`describePlatformActivityLine`, sin enum crudo ni id) + `<time dateTime>` con relativo («Hace 12 min»).
- Footer: `Abrir historial` → `/audit-logs`.
- `/audit-logs` reutiliza el mismo helper y el chrome `Historial de cambios` (sin «Auditoria», MFA ni ids en modo Básico).
- Error de auditoría: degrada solo este bloque + «Reintentar». No tumba chips ni Monitoreo.

---

## 8. Estados de la pantalla

| Estado | Qué se ve |
| --- | --- |
| **Carga** | B0 operable. Chips, barra D y 5 filas de A en skeleton con forma. Monitoreo: skeletons de indicador (CA-06). `sr-only`: «Cargando el centro de control». |
| **Éxito** | Cifras reales. Chips/tramos con 0 no clicables. |
| **Primera vez** (`tenants.length === 0`, sin error) | Chips en 0 no clicables. D: «Aún no hay empresas registradas.» + CTA secundario `Registrar primera empresa` → `/tenants/new`. A: «Aún no hay cambios recientes para mostrar.» Monitoreo sigue. |
| **Error de directorio** | Chips/D en error recuperable («No pudimos cargar el directorio.» + Reintentar). Monitoreo y A, si cargaron, permanecen. |
| **Error de auditoría** | Solo A se degrada. |
| **Error de health** | Solo Monitoreo se degrada (comportamiento actual). |

---

## 9. Criterios de aceptación

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **CA-PS-01** | El home **no** monta `TenantsTable` ni el título «Directorio de empresas». | Código + Jest |
| **CA-PS-02** | Hay exactamente 4 chips S-1…S-4, sin párrafo de onboarding ni mini-cards «Empresas visibles». | Jest + captura |
| **CA-PS-03** | Mientras carga, ningún chip ni tramo D muestra `0`. | Jest |
| **CA-PS-04** | S-1 / S-2 con cifra > 0 navegan a `/tenants?status=ACTIVE` y `PROVISIONING`. S-3 enfoca el título de D. S-4 no es enlace. | Jest (href / `activeElement`) |
| **CA-PS-05** | Tramo/chip D con cifra > 0 navega a `/tenants?status=` correcto; cifra 0 no es control. `/tenants` ya lee `status` de la URL. | Jest + smoke `/tenants` |
| **CA-PS-06** | Parque vacío: empty en D + CTA a `/tenants/new`. Sin tabla. | Jest |
| **CA-PS-07** | Actividad al pie, ≤ 5 filas, `<time dateTime>`, sin enum/id. | Jest |
| **CA-PS-08** | Monitoreo conserva orden Atención operativa → API → BD → Redis. | Jest (ya existe; no regresionar) |
| **CA-PS-09** | 375: una columna chips → Monitoreo → D → A. 1280: chips; Monitoreo \| D; A a 12 col. | E2E o captura |
| **CA-PS-10** | Fallo parcial: un contrato caído no sustituye la página. | Jest `allSettled` / errores independientes |

---

## 10. Accesibilidad (WCAG 2.2 AA)

- Targets ≥ 44 px. Foco: `interactiveFocusClassName` de `@iwana/ui`.
- Color no es la única señal: cada tramo D tiene rótulo de texto.
- Barra D: `role="img"` + `aria-label` con el desglose («12 activas, 2 en configuración, 1 con error»).
- Tras clic en S-3, el encabezado de D recibe foco (`tabIndex={-1}`).
- `prefers-reduced-motion`: si hay `scrollIntoView` hacia D, solo se mueve el foco.
- Contraste: cifras `text-iwana-primary` / `dark:text-white`; acentos danger/warning según contrato DS (no `text-iwana-secondary` suelto).

---

## 11. Copy exacto

| Superficie | Texto |
| --- | --- |
| Eyebrow S | `Resumen operativo` |
| Subtítulo B0 | `Salud de plataforma, altas en curso y lo que requiere atención.` |
| Eyebrow D | `Directorio` |
| Título D | `Empresas por estado` |
| Chip D | `En el directorio` + `{n} empresas` |
| Pie D | `Ver todas las empresas` |
| Empty D | `Aún no hay empresas registradas.` |
| CTA empty | `Registrar primera empresa` |
| Título A | `Actividad reciente` |
| Footer A | `Abrir historial` |
| Empty A | `Aún no hay cambios recientes para mostrar.` |
| Error directorio | `No pudimos cargar el directorio. Reintenta en unos minutos.` |
| Error auditoría | `No pudimos cargar la actividad reciente.` |

Sentence case. Sin jerga (`tenant`, `PROVISIONING_FAILED`, ids).

---

## 12. Datos

Sin endpoints nuevos. El home sigue pidiendo:

- `tenantApi.list({ limit: 100, offset: 0 })` — misma cota actual; los chips se derivan en cliente.
- `platformAuditApi.list({ limit: 5 })`.
- `healthApi.get()`.

Si en el futuro el parque supera 100, el sesgo se declara: las cifras del home son del lote cargado, no un agregado servidor. No se inventa un endpoint de resumen en esta fase.
