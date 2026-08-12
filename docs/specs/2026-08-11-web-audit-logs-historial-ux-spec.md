# UX spec — Historial de cambios · apps/web

**Versión:** 1.2  
**Estado:** Congelado  
**Fecha:** 2026-08-11  
**Propietario:** AI-PROD-UX  
**Alcance:** `/audit-logs` de `apps/web`. **No aplica a** `apps/portal`.  
**Prompt base:** [`PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md)  
**Prompt delta:** [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md)  
**Prompt fuente filtro:** [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md)  
**Plan:** [`2026-08-11-web-audit-logs-filtro-resumen.md`](../plans/2026-08-11-web-audit-logs-filtro-resumen.md)  
**Informe:** [`INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md)  
**Contrato DS hermano:** [`2026-08-11-web-audit-logs-historial-ds-contrato.md`](2026-08-11-web-audit-logs-historial-ds-contrato.md) v1.2 (track B en paralelo)  
**Identidad:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**Copy vivo:** [`apps/web/src/lib/platform-ui-copy.ts`](../../apps/web/src/lib/platform-ui-copy.ts) → bloque `audit` (`title`, `subtitle`, tabs/secciones, `loadError`, `actionLabels`, `actionVerbs`, …)  
**Vocabulario vivo:** `apps/web/src/lib/platform-audit-vocabulary.ts`  
**Forma de referencia (estructura, no copy):** [`2026-08-11-web-empresas-directorio-ux-spec.md`](2026-08-11-web-empresas-directorio-ux-spec.md)

### Changelog

| Ver | Estado | Cambio |
| --- | --- | --- |
| 1.0 | Congelado (superado en §5) | Alineación chrome/copy/empty/a11y; CA-AUD-09 = solo foco a título de tabla; **prohibido** disclaimer permanente «solo esta página». |
| 1.1 | Congelado (superado en fuente §5) | Delta filtro del resumen sobre el lote cargado ([prompt FILTRO-RESUMEN-v1.1](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md)): Opción 1 aprobada; CA-AUD-09 reescrito; chip de alcance obligatorio; tercera receta empty; CA-FR-01…10. Chip «Mostrando: {label} · solo esta página» como control descartable. |
| **1.2** | **Congelado** | Corrige fuente del filtro ([prompt FUENTE-v1.2](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md)): con preset activo, filtrar el **lote del resumen** (summary entries + ventana 24h/7d), **no** la página del pager. Chip → `Mostrando: {label} · lote del resumen`. Pager deshabilitado/oculto con preset. Empty/hint sin sentido «página del pager». CA-FR-11…13. |

---

## 1. Persona / tarea

**Persona:** operador de plataforma (`SYSTEM_ADMIN`) en `apps/web`.

**Tarea (un ciclo de revisión):**

1. **Revisa** qué cambió — en la plataforma o dentro de una empresa — con el mismo lenguaje que el centro de control («Abrir historial»).
2. **Reconoce** la acción en frase humana (quién + verbo + qué), no en jerga de auditoría interna.
3. **Profundiza** solo si necesita detalle: IP, identificadores, UTC y metadata quedan en el modo Detalle.
4. **Acota** opcionalmente el mismo lote que alimenta las cifras del resumen (preset cliente + chip de alcance), sin mentir sobre el alcance.

Esta spec **alinea** chrome, copy, resumen, empty, filtro honesto del resumen (v1.2: lote del resumen + chip) y a11y de fila. **No rediseña:** las tabs, el modo denso (renombrado a Detalle), las 4 señales de resumen y el pager cursor + 10/20/50 se quedan (pager solo aplica **sin** preset activo).

---

## 2. Arquitectura de página

Sin wireframe ornamental. Cuatro bloques, en este orden. **Sin párrafo bajo las tabs.**

```text
375 / 768 (1 col)                  1280
─────────────────                  ────────────────────────────
B0 PageHeader                      B0 PageHeader
   Tabs de ámbito                     Tabs de ámbito
K  Resumen · 4 señales             K  Resumen · 4 señales en fila
T  Tabla (chrome + filas + pie)    T  Tabla
```

### B0 · PageHeader

| Pieza | Valor |
| --- | --- |
| H1 | `Historial de cambios` |
| Subtítulo | `Qué cambió el equipo en empresas, accesos y la plataforma.` |
| CTA primario en header | Ninguno |

Un solo H1. **Sin** H2 instructivo de hero. **Sin** párrafo de sección bajo el header ni bajo las tabs.

### Tabs de ámbito

Horizontales. Se quedan.

| Tab | Texto |
| --- | --- |
| Tab 1 | Cambios de plataforma |
| Tab 2 | Cambios por empresa |

En tab empresa: selector de empresa (copy compartido `shared.*`). Params de URL `tenant=` / `scope=empresa` se mantienen (no son chrome visible).

**Prohibido:** párrafos `platformSectionSubtitle` / `tenantSectionSubtitle` visibles bajo las tabs. Esos strings no alimentan prosa de página en esta fase.

### K · Resumen · 4 señales

Cuatro señales. No se convierten en los 3 chips de Empresas. Ventana temporal en palabras: `Últimas 24 h` · `Últimos 7 días` (targets ≥ 44 px; receta visual = contrato DS).

| Señal | Label | Ámbito |
| --- | --- | --- |
| 1 | Cambios críticos | Ambos |
| 2 | Accesos | Ambos |
| 3 | Acceso y seguridad | Ambos |
| 4a | Empresas con cambios | Solo tab plataforma |
| 4b | Quién cambió | Solo tab empresa |

Cifras mono/tabular (DS). Lima ≠ urgencia. Sin `iwana-secondary-50` de fondo. Carga: skeleton con forma de card; prohibido `0` o `...` mientras carga.

CTA de tarjeta (`Ver críticos` / `Ver accesos` / `Ver seguridad` / `Ver actividad`) con `count > 0`: aplica preset de resumen (§5). Con `count = 0`: no interactivo.

### T · Tabla

- Título de tabla (punto de foco tras aplicar preset, CA-AUD-09 / CA-FR). **No** es un segundo H1.
- Chip de alcance de preset (§5) visible **sobre** el chrome/listado mientras el preset esté activo.
- Chrome: modo Lectura / Detalle + filtros (acción, fechas) + Descargar.
- Filas narrativas + control de expansión.
- Pie: Anterior / Siguiente por **cursor** + tamaño **10 / 20 / 50**. ADR-065 fuera. **Con preset activo:** pie de pager deshabilitado u oculto (no paginar el lote del resumen).

API de listado intacta (sin endpoints nuevos):

```text
platformAuditApi.list({ limit, cursor?, action?, fromDate?, toDate? })
auditApi.list({ limit, cursor?, action?, fromDate?, toDate? }, tenantSlug)
```

No existe query `actions` (plural) ni `severity`. Esta spec **no las inventa**. El preset de resumen **no** escribe `?action=` ni contamina export CSV.

---

## 3. Copy literal

Congelado tal cual (prompt alineación §7.2 + delta filtro-resumen + FUENTE-v1.2). Sentence case. Fuente: extender `PLATFORM_UI_COPY.audit`; cero strings sueltos nuevos en JSX. Track C mete las claves nuevas/actualizadas en `platform-ui-copy.ts`.

| Superficie | Texto |
| --- | --- |
| H1 | Historial de cambios |
| Subtítulo | Qué cambió el equipo en empresas, accesos y la plataforma. |
| Tab 1 | Cambios de plataforma |
| Tab 2 | Cambios por empresa |
| Modo diario | Lectura |
| Modo denso | Detalle |
| Descargar | Descargar |
| Exportando | Descargando… |
| Error listado | `audit.loadError` → No pudimos cargar el historial. Reintenta en unos minutos. |
| Error descarga | No pudimos descargar el archivo. Reintenta en unos minutos. |
| Recorte descarga | La descarga se limitó a 5000 cambios. |
| Ventana | Últimas 24 h · Últimos 7 días |
| Críticos | Cambios críticos |
| Accesos | Accesos |
| Seguridad | Acceso y seguridad |
| Empresas (resumen plataforma) | Empresas con cambios |
| Personas (resumen empresa) | Quién cambió |
| Empty parque | Sin actividad registrada |
| Empty filtro | Sin cambios con estos filtros |
| Empty preset resumen | Sin cambios en el lote del resumen con este filtro |
| Empty preset resumen · hint | Quita el filtro del resumen para ver todos los cambios. |
| Chip preset resumen | Mostrando: {label} · lote del resumen |
| Quitar preset resumen | Quitar filtro |
| Filtro acción | Todas las acciones / labels de `actionLabels` |
| Expandir | Ver detalle / Ocultar |
| Tamaño de página | `audit.pageSizeLabel` → Cambios por página |
| Ámbito (a11y tabs) | `audit.scopeLabel` → Ámbito del historial |
| Fallback de persona | `audit.actorFallback` → Alguien del equipo |

### Copy canónico (delta v1.2 → `PLATFORM_UI_COPY.audit`)

Claves sugeridas para track C (nombres orientativos; el texto es canónico):

| Clave sugerida | Texto exacto |
| --- | --- |
| `summaryFilterChip` | `Mostrando: {label} · lote del resumen` |
| `summaryFilterClear` | `Quitar filtro` |
| `emptySummaryPreset` | `Sin cambios en el lote del resumen con este filtro` |
| `emptySummaryPresetHint` | `Quita el filtro del resumen para ver todos los cambios.` |

`{label}` usa el **label de la señal** ya congelado (§2 K / tabla §3): `Cambios críticos` · `Accesos` · `Acceso y seguridad` · `Empresas con cambios` · `Quién cambió`. No usar ids técnicos (`critical`, `access`, …) en UI.

**Prohibido en UI (modo Lectura y chrome diario):** Técnico · Básico (sustituido por Lectura) · Actor · CSV · Metadata técnica · Timestamp UTC · Slug · Schema Name · Mfa Enabled · tenant · 24h · 7d · Top actores · Eventos críticos · Informativo (usar Normal u ocultar el badge).

«Puesta en marcha» solo como verbo de historial (`actionVerbs`), no como título de pantalla.

Filename de descarga: nombre de producto (p. ej. prefijo de historial), **sin** `audit-logs` en el nombre visible al usuario.

---

## 4. Modos Lectura vs Detalle

El modo denso **se queda**; solo se renombra a **Detalle**. Default = **Lectura**.

| Dato | Lectura | Detalle |
| --- | --- | --- |
| Frase quién + verbo + qué | sí | sí (más columnas / densidad) |
| Badge de acción / entidad | sí (humano, `actionLabels` / `entityTypeLabels`) | sí |
| Nombre de persona / empresa | sí (o «Alguien del equipo») | sí |
| Relativo `<time>` | sí | sí + fecha completa |
| IP, UUID, requestId, user-agent, UTC | **no** | sí |
| Diff de campos | nombres de producto; sin slug / schema / camelCase | completo |
| Copiar ID | **no** | sí |
| Bloque «Metadata…» | **no** | sí (solo aquí; sin etiqueta «Metadata técnica») |

Tooltip de fila en Lectura: sin «Actor: … · ID {uuid}». Sin IP en fila colapsada de Lectura.

---

## 5. Filtro del resumen (CA-AUD-09) — v1.2

**Cambio de decisión (v1.1 → v1.2):** en v1.1 el preset filtraba `entries` de la **página del pager**. Eso producía empty falso («Empresas con cambios» con Tenant solo en el lote `SUMMARY_LIMIT`, no en la página). EM-ARCH ([prompt FUENTE-v1.2](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md)) desempata: con preset activo, filtrar el **mismo lote que alimenta las cifras del resumen**.

**Problema:** el operador espera que el CTA de una señal del resumen acote lo que ve en la tabla, alineado con las cifras que acaba de ver, sin creer que el API filtró todo el parque histórico ni que «esta página» del pager es la fuente.

**Decisión v1.2 (congelada):** clic en CTA de tarjeta con `count > 0` filtra la tabla sobre el **lote del resumen** (`summaryEntries` / `platformSummaryEntries` · `tenantSummaryEntries`, con la misma ventana 24h/7d del resumen) aplicando el predicado del preset. **No** usa `platformTable.entries` / `tenantTable.entries` (página del pager). **No** se pide un preset al API. **No** se inventa `?actions=` / `severity` en query. Al quitar el preset, la tabla vuelve al lote del pager.

| Regla | Valor |
| --- | --- |
| Fuente con preset | Lote del resumen (summary entries + ventana 24h/7d del resumen) filtrado por `matchesSummaryPreset` |
| Fuente sin preset | Lote del pager (`pageSize` / cursor vigente) — comportamiento de listado normal |
| Presets | `critical` · `access` · `security` · `tenants` (plataforma) · `actors` (empresa) — ids internos; UI usa labels §3 |
| Predicado | Mismas reglas que el conteo del resumen (severity / AUTH_ACTIONS / SECURITY∪TENANT / entityType Tenant / actores → filas del actor). Predicado `tenants` = `entityType === 'Tenant'` (sin ampliar en esta fase). |
| Chip | Obligatorio mientras el preset esté activo: «Mostrando: {label} · lote del resumen» + control «Quitar filtro» |
| Pager con preset | Controles de cursor/pager (Anterior / Siguiente / tamaño de página) **deshabilitados u ocultos** — no tiene sentido paginar el lote del resumen |
| Toggle | Segundo clic en la **misma** tarjeta = quitar preset |
| Un solo preset | Clic en otra tarjeta **reemplaza** el preset (no acumula) |
| Reset | Cambio de ventana 24h/7d, filtro `action` servidor, fechas, pageSize, cursor/siguiente-anterior, o tab de ámbito → limpia preset |
| Empty | Tercera receta (§6): sin filas tras preset sobre el lote del resumen ≠ empty parque ≠ empty filtros servidor |
| Foco | Tras aplicar preset, enfocar título de tabla (`tabIndex={-1}`) |
| Export / URL | Export CSV y query URL `action` **no** se contaminan con el preset |
| count = 0 | CTA no interactivo (igual que v1.0) |

| Chip (label) | ¿1:1 con `action` de API? | Comportamiento v1.2 |
| --- | --- | --- |
| Cambios críticos | **No** | Filtra lote del resumen (`critical`) + chip. Prohibido query `severity`. |
| Accesos | **No** | Filtra lote del resumen (`access`) + chip. Prohibido `actions=`. |
| Acceso y seguridad | **No** | Filtra lote del resumen (`security`) + chip. |
| Empresas con cambios | **No** | Filtra lote del resumen (`tenants`) + chip. |
| Quién cambió | **No** | Filtra lote del resumen (`actors`) + chip. |

**Ningún CTA del resumen** dispara `setActionFilter` / `?action=`. El filtro de acción del **chrome de la tabla** sigue siendo independiente (query servidor `action` singular + reset de cursor).

**CA-AUD-09 (vigente v1.2):** el resumen **sí** puede recortar el lote del resumen en cliente **si y solo si** el chip de alcance («lote del resumen») está visible y es descartable. Recorte sin chip = defecto bloqueante. Interpretación de «lote» = summary entries + ventana, **no** la página del pager.

**Prohibido:**

- Recorte silencioso sin chip visible y descartable.
- Filtrar con preset sobre `table.entries` (página del pager) como fuente.
- Query `actions` (plural) o `severity`.
- Contaminar export CSV o URL `action` con el preset de resumen.
- Acumular varios presets a la vez.
- Dejar el pager operable mientras el preset esté activo (mezclaría lotes).

Sin endpoint de agregación: las cifras del resumen siguen siendo las del lote/ventana vigente (deuda de agregación servidor = fuera). El resumen y la tabla con preset comparten la **misma fuente** (lote del resumen); sin preset, la tabla vuelve al lote del pager.

---

## 6. Empty — tres recetas

No unificar. Sin CTA de alta (no aplica en historial).

| Condición | Título | Hint / comportamiento |
| --- | --- | --- |
| **Sin actividad** — listado vacío **sin** filtros de acción/fechas activos **ni** preset de resumen | Sin actividad registrada | Primera vez / parque sin eventos en la ventana. No se finge un fallo de red. |
| **Sin resultados de filtro** — listado vacío **con** filtro de acción y/o rango de fechas (servidor) | Sin cambios con estos filtros | Invita a ajustar o limpiar filtros (copy de apoyo breve; sin CTA de creación). |
| **Sin resultados de preset de resumen** — el lote del resumen tiene filas (o al menos se evaluó), pero tras ventana + predicado ninguna fila coincide | Sin cambios en el lote del resumen con este filtro | Hint: «Quita el filtro del resumen para ver todos los cambios.» Chip + «Quitar filtro» siguen visibles. Distinto de empty parque y de empty filtros servidor. Empty C solo si lote del resumen + ventana + predicado = 0. |

Orden de evaluación sugerido (experiencia): error de listado → empty parque (sin datos servidor y sin filtros) → empty filtros servidor → empty preset (preset activo, tabla filtrada vacía sobre el lote del resumen).

Error de listado ≠ empty: `Alert` + `audit.loadError` + reintento. No se muestra empty de parque ante fallo de red.

---

## 7. Accesibilidad (WCAG 2.2 AA)

- **Un H1:** `Historial de cambios`. El título de tabla no es un segundo `h1`.
- **Un control de expansión por fila:** botón «Ver detalle» / «Ocultar» (o chevron equivalente). **Prohibido** `<tr role="button">` anidado con otro botón.
- **Ventana temporal** `Últimas 24 h` / `Últimos 7 días`: alto mínimo ≥ 44 px (`min-h-11`).
- Fechas con `<time dateTime>` (relativo en Lectura; completo adicional en Detalle).
- Foco visible: receta del contrato DS (`interactiveFocusClassName`).
- Nombre accesible del ámbito: `Ámbito del historial` (tabs).
- Tras aplicar preset del resumen (count > 0): el título de la tabla recibe foco.
- Chip y «Quitar filtro»: nombre accesible (texto visible canónico); CTA de tarjeta con estado pressed cuando el preset activo coincide (contrato DS).
- Con preset activo: controles de pager no enfocables (ocultos) o `disabled` con nombre que explique que el filtro del resumen está activo (contrato DS).
- Targets ≥ 44 px en controles operativos del chrome.
- Color no es la única señal: badges llevan texto humano.

---

## 8. Estados de la pantalla

| Estado | Qué se ve |
| --- | --- |
| **Carga** | B0 + tabs operables. Resumen en skeleton. Tabla en skeleton de filas. Sin ceros falsos. |
| **Éxito** | 4 señales con cifras. Tabla con frases. Modo Lectura por defecto. Pager operable. |
| **Preset activo** | Chip «Mostrando: {label} · lote del resumen» + «Quitar filtro». Tabla = lote del resumen filtrado por predicado + ventana. Resumen sigue mostrando cifras del lote completo. CTA de la señal activa en pressed. Pager deshabilitado u oculto. |
| **Sin actividad** | Empty parque (§6). |
| **Filtro servidor sin filas** | Empty filtro (§6). |
| **Preset sin filas en el lote del resumen** | Empty preset resumen (§6) + chip visible. |
| **Error de listado** | `Alert` + `loadError`. No se finge historial vacío. |
| **Descarga en curso** | Botón «Descargando…». |
| **Error / recorte de descarga** | Copy §3 (error descarga / límite 5000). |
| **Modo Detalle** | Columnas densas + metadata / IP / UUID / UTC solo aquí. |

---

## 9. Criterios de aceptación

Base (informe / v1.0). **CA-AUD-09** vigente con copy/fuente v1.2. Delta filtro-resumen: **CA-FR-01…10** del prompt FILTRO-RESUMEN-v1.1 §4 (referencia; «lote» = lote del resumen cuando hay preset). Delta fuente: **CA-FR-11…13** del prompt FUENTE-v1.2 §3.

| ID | Criterio |
| --- | --- |
| **CA-AUD-01** | Chrome diario sin «Técnico», «Actor», «CSV», «24h», «7d», «Top actores», «Metadata técnica», «tenant», «slug». Sí: Historial, Detalle, Descargar, Últimas 24 h. |
| **CA-AUD-02** | Frases, acciones y entidades salen de `PLATFORM_UI_COPY.audit`. Campos visibles: nombre de producto, no camelCase/`Slug`/`Schema Name`. |
| **CA-AUD-03** | Error de listado = `audit.loadError` en `Alert`. |
| **CA-AUD-04** | Empty parque ≠ empty filtros servidor ≠ empty preset de resumen. Copy canónico; no unificar. |
| **CA-AUD-05** | Descarga: «Descargar»; error `No pudimos descargar el archivo. Reintenta en unos minutos.`; recorte `La descarga se limitó a 5000 cambios.` Export **no** aplica el preset de resumen. |
| **CA-AUD-06** | Un H1. Tabs `Cambios de plataforma` / `Cambios por empresa`. Sin párrafo bajo las tabs. |
| **CA-AUD-07** | Un control de expansión por fila; ventana temporal ≥ 44 px; foco visible. |
| **CA-AUD-08** | Resumen: 4 señales con receta de superficie iWana; cifras mono; lima ≠ urgencia; labels §7 del prompt de alineación. |
| **CA-AUD-09** | El resumen puede filtrar el **lote del resumen** **solo** con chip obligatorio «Mostrando: {label} · lote del resumen» + «Quitar filtro». Sin chip = recorte silencioso = fallo. No inventar `actions[]` / `severity` en API. Foco al título de tabla tras aplicar. Con preset: pager oculto/deshabilitado. |
| **CA-AUD-10** | IDs, IP, UTC y user-agent solo en modo Detalle. |

### Delta CA-FR (prompt FILTRO-RESUMEN-v1.1) — referencia; «lote» reinterpretado en v1.2

| ID | Criterio |
| --- | --- |
| **CA-FR-01** | Clic «Ver críticos» con count>0 filtra la tabla al predicado critical del lote del resumen. |
| **CA-FR-02** | Chip visible con copy canónico + «Quitar filtro» restaura lista del pager. |
| **CA-FR-03** | Segundo clic en la misma tarjeta quita el preset. |
| **CA-FR-04** | Clic en otra tarjeta cambia el preset (no acumula). |
| **CA-FR-05** | count=0 → CTA no interactivo. |
| **CA-FR-06** | Cambiar `action` del chrome o ventana 24h/7d limpia el preset. (También: fechas, pageSize, cursor, tab — §5 Reset.) |
| **CA-FR-07** | Empty de preset distinto de emptyFiltered / emptyPark (copy en `PLATFORM_UI_COPY.audit`). |
| **CA-FR-08** | Export / query URL `action` no se contaminan con el preset. |
| **CA-FR-09** | Jest: AuditSummary + page (o helper de predicado) cubren apply/clear/toggle. |
| **CA-FR-10** | axe / a11y: chip y botones con nombre accesible; sin regresión CA-AUD fila. |

### Delta CA-FR fuente (prompt FUENTE-v1.2)

| ID | Criterio |
| --- | --- |
| **CA-FR-11** | Preset `tenants` con Tenant solo en el lote del resumen (no en la página del pager) → la tabla muestra esas filas Tenant; **no** empty C. |
| **CA-FR-12** | Chip indica «lote del resumen» (no «solo esta página» del pager). |
| **CA-FR-13** | Quitar filtro restaura `entries` del pager. |

---

## 10. Fuera de alcance

No entra. No se abre en esta fase. **Sin `[BLOQUEO]`:** CA-AUD-09 se cierra con filtro cliente del lote del resumen + chip; no hace falta endpoint nuevo ni pager ADR-065. No se unifican fetches summary/table en esta fase.

| Fuera | Motivo |
| --- | --- |
| Pager numerado / `meta.capabilities.randomAccess` (**ADR-065**) | Deuda declarada. El pie sigue siendo Anterior/Siguiente por cursor + 10/20/50 (solo sin preset). |
| `apps/portal` e import desde portal | Superficie distinta / boundary |
| Agregación de resumen en servidor («Fase 5») | Exige contrato API. Fuera. |
| Unificar fetches summary / table | Fuera del delta FUENTE-v1.2 |
| Endpoints nuevos, OpenAPI, migraciones, `@Roles` | Contrato API intacto |
| Query `actions[]` / `severity` | Prohibido inventar; preset es solo cliente |
| Filtrar CSV con preset de resumen | Export sigue filtros de servidor |
| Primitive nueva en `@iwana/ui`, tokens de marca / sidebar / canvas | Carril rápido DS |
| Empresas, ficha, NotificationBell, centro de control (salvo enlace cruzado de una línea) | Fuera de `/audit-logs` |
| Rediseño de anatomía de las 4 tarjetas | Ya restauradas; fuera del delta |
| Reabrir `dashboard.status*` | Ya congelado |
| Quitar tabs o eliminar modo Detalle | Decisiones ya tomadas |
| Ampliar predicado `tenants` más allá de `entityType === 'Tenant'` | Fuera salvo nueva decisión EM-ARCH |
| G6.5 / G7 / commit / push | No se anticipan |

---

## Decisiones no reabiertas

| Asunto | Decisión |
| --- | --- |
| Tabs | Se quedan |
| Modo denso | Se queda; se renombra a **Detalle** |
| Resumen | 4 señales; no se convierte en 3 chips de Empresas |
| Pager | Cursor + 10/20/50 **sin** preset; con preset → deshabilitado/oculto |
| Filtro resumen | **v1.2:** filtrar **lote del resumen** (summary entries + ventana) + chip «lote del resumen» + «Quitar filtro»; sin query API nueva. La v1.1 «filtrar página del pager / solo esta página» queda **superada** (root cause empty falso en Empresas con cambios). |

---

*Congelado 2026-08-11 por AI-PROD-UX · v1.2. Track A del prompt FUENTE-v1.2 (protocolo §3bis). Corrige fuente del filtro; no inventa API ni tokens.*
