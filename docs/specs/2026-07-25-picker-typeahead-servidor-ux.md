# Spec UX — Picker con búsqueda tipo-ahead contra servidor (E-4)

**Versión:** 1.0  
**Estado:** **Congelada** — desbloquea DS-OWNER (contrato) y FE-PLATFORM (migración)  
**Fecha:** 2026-07-25  
**Autor:** AI-PROD-UX  
**Escalación:** [E-4](../plans/2026-07-24-escalaciones-abiertas-paginacion.md#e-4--pickers-con-soft-cap-silencioso--deuda-p1-independiente) · [plan remediación](../plans/2026-07-24-pickers-softcap-remediacion.md)  
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) §Excepciones («Pickers y selectores en modal») · cota [ADR-064](../adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md) §8  
**Kickoff:** [INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0](../informes/INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md)  
**Precedentes API (lookup, no listado):** `GET /crm/subscribers/search` · `GET /purchasing/suppliers/lookup`  
**Skills:** `system-vocabulary-review`, `wcag-audit-patterns`, `iwana-identity-ui-review`  
**Contrato DS:** **Vigente** — [`2026-07-25-searchable-picker-ds-contrato.md`](2026-07-25-searchable-picker-ds-contrato.md) (`SearchablePicker` / `SearchableMultiPicker`)

---

## 1. Problema que resuelve

Hoy los selectores de entidad (usuarios, planes, productos, ítems, ubicaciones, proveedores, prospectos/suscriptores) cargan un lote fijo (`limit` 6–100) **sin aviso y sin avance**. Si el tenant supera ese tope, el operador **no ve** opciones válidas y cree que no existen.

ADR-065 no aplica: un picker **nunca** lleva pie de paginación. La salida es **búsqueda tipo-ahead contra el servidor** (lookup), no directorio ni feed.

---

## 2. Tarea del operador

| Campo | Definición |
| --- | --- |
| Persona | Operador ISP en portal tenant (CRM, comercial, inventario, operaciones, compras) |
| Tarea | Elegir **una** (o varias) entidad(es) ya existente(s) para completar un formulario, diálogo o drawer |
| Éxito | Encuentra y confirma la entidad correcta en pocos caracteres, sin perder el contexto del modal/drawer |
| Fracaso a evitar | Truncamiento silencioso; paginar dentro del picker; materializar el catálogo completo |

---

## 3. Patrón único (canon)

**Nombre de producto (experiencia):** selector con búsqueda.  
**Nombre técnico (para DS/FE):** `SearchablePicker` (single) · `SearchableMultiPicker` (multi).  
**API de componente:** [contrato DS](2026-07-25-searchable-picker-ds-contrato.md) — esta spec fija comportamiento y criterios; props y tokens viven en el contrato.

### 3.1 Anatomía

1. **Campo de búsqueda** (siempre visible al abrir el selector; en single, el valor seleccionado se muestra en el trigger o en el mismo campo según variante DS).
2. **Listbox** de resultados (dropdown en desktop; hoja inferior o pantalla completa en viewport estrecho — ver §6).
3. **Opcional:** acción «Limpiar» cuando hay valor seleccionado.
4. **Sin** pie de paginación, sin «Cargar más», sin selector de filas, sin números de página.

### 3.2 Formato de fila

Cada resultado muestra **dos líneas conceptuales** en un solo ítem:

- **Principal:** `label` (nombre legible).
- **Secundaria:** `sublabel` (detalle corto: código, SKU, documento enmascarado, estado amigable, etc.).

Presentación visual canónica: `nombre — detalle` cuando ambas existen (raya larga `—`, no guion corto). Si no hay `sublabel`, solo el nombre.

Ejemplos sin PII real:

- `Plan fibra 200 — Activo`
- `Router Wi-Fi 6 — SKU RTR-001`
- `Proveedor Andes Tech — NIT ····1234`

El módulo provee el sustantivo del recurso (`usuario` / `usuarios`, `plan` / `planes`, …) para copy de estados y anuncios.

### 3.3 Contrato de datos esperado (referencia; dueño SR-FULL)

Lookup con respuesta acotada (plan: máx. **20** por query) e indicador de universo filtrado:

- Entrada: `q` (string), `limit` (default del dominio ≤ 20), filtros de contexto (`status=ACTIVE`, `isActive=true`, …).
- Salida: lista `{ id, label, sublabel? }[]` + `total` (conteo del conjunto que coincide con `q`, no del tenant completo).

La UX **no** pagina ese `total`; solo lo usa para el estado **truncado** (§4.6).

---

## 4. Estados de experiencia

Gramática cerrada. Un solo estado dominante en el listbox a la vez (salvo hint de truncado, que es banda dentro de «resultados»).

| ID | Estado | Cuándo | Qué ve el operador | Acción |
| --- | --- | --- | --- | --- |
| S0 | **Cerrado / valor** | Listbox cerrado | Trigger o campo con valor seleccionado, o placeholder | Abrir; Limpiar si hay valor |
| S1 | **Vacío (umbral)** | Abierto y `q.trim().length < minChars` | Sin lista de entidades; mensaje de guía | Seguir escribiendo |
| S2 | **Cargando** | Tras debounce, petición en vuelo | Skeleton con **forma de filas** (no spinner suelto); listbox abierto | Esperar; puede seguir tipando (cancela petición anterior) |
| S3 | **Resultados** | `data.length ≥ 1` | Lista con resaltado de ítem activo; foco en combobox | Elegir con clic o teclado |
| S4 | **Sin resultados** | Respuesta OK y `data.length === 0` | Mensaje de vacío de búsqueda (no empty de «primera vez») | Cambiar texto; no hay CTA de crear entidad salvo que el módulo lo declare fuera de este patrón |
| S5 | **Error** | Fallo de red/API | Mensaje recuperable + «Reintentar» | Reintentar sin cerrar el modal padre |
| S6 | **Truncado** | `data.length > 0` y hay más coincidencias que las mostradas (`total > data.length` o flag equivalente) | Misma lista S3 + **aviso no bloqueante** bajo o sobre la lista | Afina la búsqueda; **no** hay avance de página |

### 4.1 Copy congelado (es-CO, sentence case)

| Situación | Texto exacto |
| --- | --- |
| Placeholder genérico | `Buscar {singular}…` (módulo puede especializar: `Buscar proveedor por nombre`) |
| Umbral (S1) | `Escribe al menos 2 caracteres` |
| Cargando (anuncio SR) | `Buscando…` |
| Sin resultados (S4) | `No hay {plural} que coincidan` |
| Error (S5) | `No fue posible cargar {plural}.` |
| Acción error | `Reintentar` |
| Truncado (S6) | `Mostrando los {n} más relevantes. Afina la búsqueda.` (`n` = ítems visibles) |
| Limpiar | `Limpiar selección` (`aria-label`) |
| Anuncio conteo (SR) | `{n} {singular\|plural}` · si truncado: `{n} de {total} {plural}. Afina la búsqueda.` |
| Listbox `aria-label` | `Resultados de {plural}` |

**Prohibido:** «No results», «Loading…», «entries», «ítems» genérico sin sustantivo, enums crudos (`ACTIVE`), «Página 1 de N», «Cargar más», «Mostrar todos», mayúsculas de título.

### 4.2 Distinción empty

- **S1** ≠ **S4**: umbral invita a escribir; sin resultados invita a cambiar la consulta.
- Este patrón **no** usa empty de «primera vez» (ilustración + CTA de alta): el alta de entidad, si existe, vive fuera del picker (botón del formulario padre).

---

## 5. Interacción

### 5.1 Umbral y debounce

| Parámetro | Valor canónico | Notas |
| --- | --- | --- |
| `minChars` | **2** | Contados sobre `trim()`. Por debajo → S1, **sin** request |
| `debounceMs` | **300** | Alineado a búsqueda de tablas del portal y a `SupplierPicker` actual |
| Cancelación | Obligatoria | Nueva tecla o cierre cancela/ignora respuesta obsoleta |
| Espacios | `trim` antes de comparar umbral y de enviar `q` | No disparar búsqueda solo con espacios |

Al borrar por debajo de `minChars`: cerrar resultados previos, volver a S1, limpiar error de carga anterior.

### 5.2 Apertura y cierre

- Abrir al enfocar el campo (si ya hay ≥ `minChars`) o al escribir el primer carácter válido tras el umbral.
- Cerrar con: selección, `Escape`, clic fuera, blur según reglas a11y del combobox (sin perder el valor seleccionado).
- Tras seleccionar (single): listbox cierra; el campo/trigger muestra el `label` elegido; el foco permanece en el combobox (o vuelve al trigger).
- Multi: la selección **añade chip/tag**; el campo de búsqueda se limpia y el listbox puede permanecer abierto para otra búsqueda (comportamiento esperado en multi).

### 5.3 Teclado (patrón combobox)

| Tecla | Comportamiento |
| --- | --- |
| Caracteres | Actualizan `q`; reinician debounce |
| `ArrowDown` / `ArrowUp` | Mueven el ítem activo en la lista; no mueven el caret del input de forma que rompa el patrón |
| `Home` / `End` (con listbox abierto) | Primer / último ítem |
| `Enter` | Confirma el ítem activo (si hay lista) |
| `Escape` | Cierra listbox; conserva texto de búsqueda o restaura label seleccionado (single: preferir restaurar label del valor si había selección) |
| `Tab` | Cierra y mueve el foco al siguiente control del formulario |
| `Backspace` en multi con campo vacío | Quita el último chip (si el módulo habilita chips) |

Foco visible en campo e ítem activo. Targets de fila ≥ 44×44 px. Ninguna acción solo en hover.

### 5.4 Lectores de pantalla

- Rol: **combobox** + listbox (`aria-expanded`, `aria-controls`, `aria-activedescendant` en el ítem activo).
- Región `aria-live="polite"` anuncia conteo al estabilizar resultados (tras debounce + respuesta), **una vez** por consulta estable — no por cada tecla.
- Durante S2: `aria-busy="true"` en el contenedor del listbox.
- El aviso S6 se incluye en el anuncio de conteo; no requiere `assertive`.

### 5.5 Foco y modal/drawer padre

- Abrir el picker **no** atrapa el foco fuera del diálogo padre: el foco cicla dentro del modal/drawer según el shell existente.
- «Reintentar» recibe foco al aparecer el error solo si el fallo ocurrió tras una acción explícita de reintento previo; en el primer error, el foco permanece en el campo de búsqueda.
- Nunca mover el foco al `<body>` al cerrar el listbox.

---

## 6. Responsive

| Viewport | Despliegue del listbox |
| --- | --- |
| ≥ `md` | Dropdown anclado al campo, máx. altura ~8–10 filas con scroll interno |
| &lt; `md` | **Bottom sheet** o superficie casi full-screen con campo de búsqueda fijo arriba y teclado del sistema; misma gramática de estados |

El teclado virtual no debe tapar el ítem activo: al mover con flechas (si aplica) o al abrir, el ítem activo permanece visible en el área scrolleable.

---

## 7. Variantes

| Variante | Comportamiento UX |
| --- | --- |
| Single | Un valor; nueva selección reemplaza; Limpiar deja `null` |
| Multi | Varios valores como chips; búsqueda añade; quitar chip es explícito; el truncado S6 aplica a **cada** consulta, no al conjunto ya elegido |
| Con filtros de contexto | El padre puede fijar `status`, `isActive`, etc. **sin** exponerlos como segunda búsqueda en el picker, salvo que el módulo ya tenga chips de filtro fuera |

Prefetch de catálogo completo o soft-cap local **queda fuera de norma** tras la migración E-4.

---

## 8. Qué NO es este patrón

| No es | Por qué |
| --- | --- |
| Pie de paginación numerada | ADR-065 lo excluye explícitamente en pickers/modales |
| «Cargar más» / infinite scroll en el listbox | Sustituye un truncamiento opaco por otro; el operador debe **afinar `q`** |
| Tabla operativa embebida | Densidad y pie de directorio no caben en diálogo |
| Combobox solo-cliente sobre array prefetchado | Origen del soft-cap silencioso |
| Command palette global (Cmd+K) | Otro patrón Firma; este es selección contextual de campo |
| Typeahead de creación («crear si no existe») | Alcance distinto; requiere PRD del módulo |
| Empty de onboarding / primera vez | No aplica dentro del selector |

---

## 9. Criterios de aceptación CA-PICK-\*

Observables sin leer código. Aplican a single y multi salvo nota.

| ID | Criterio |
| --- | --- |
| **CA-PICK-01** | Con `q` de longitud &lt; 2 (tras trim) **no** se dispara petición de lookup; se muestra el copy de umbral |
| **CA-PICK-02** | La petición se dispara como mínimo **300 ms** después de la última tecla que deja `q` ≥ 2 |
| **CA-PICK-03** | Mientras carga, el listbox muestra skeleton con forma de filas (no solo un spinner centrado) |
| **CA-PICK-04** | Con resultados, cada fila muestra `label` y, si existe, `sublabel` con separador `—` |
| **CA-PICK-05** | Cero coincidencias → copy «No hay {plural} que coincidan»; distinto del mensaje de umbral |
| **CA-PICK-06** | Error de red/API → mensaje recuperable + control «Reintentar» que vuelve a consultar con el mismo `q` |
| **CA-PICK-07** | Si el servidor indica más coincidencias que las mostradas, aparece el aviso de truncado; **nunca** pie de página ni «Cargar más» |
| **CA-PICK-08** | No existe control de paginación (números, anterior/siguiente, tamaño de página) dentro del picker |
| **CA-PICK-09** | Teclado: Abrir/navegar con flechas, confirmar con Enter, cerrar con Escape; orden de tabulación coherente con el formulario padre |
| **CA-PICK-10** | Combobox accesible: `aria-expanded`, `aria-controls`, `aria-activedescendant`; anuncio educado del conteo al estabilizar resultados |
| **CA-PICK-11** | Targets de opción ≥ 44×44 px; foco visible; no hay acción solo en hover |
| **CA-PICK-12** | En viewport estrecho, la lista usable no queda bajo el teclado virtual de forma que impida elegir el ítem activo |
| **CA-PICK-13** | Tras migrar un picker E-4, un tenant con cardinalidad &gt; soft-cap histórico puede encontrar entidades **más allá** del tope anterior tipando un `q` que las distinga |
| **CA-PICK-14** | El picker **no** materializa el catálogo completo del tenant en memoria como estrategia de búsqueda |
| **CA-PICK-15** | Microcopy en español, sentence case, con sustantivo del recurso; sin enums crudos ni copy en inglés |
| **CA-PICK-16** (multi) | Añadir una opción no cierra de forma que impida una segunda búsqueda inmediata; quitar un chip es explícito y anunciable |

---

## 10. Mapa de adopción (orden de dolor — plan fase 5)

Solo prioridad de experiencia; no prescribe sprint.

1. Atribución de usuarios en expediente (sin cursor hoy).
2. Catálogos en diálogos de contrato / conversión.
3. Pickers de inventario (alta dispersión).
4. Proveedores (`SupplierPicker` / multi) — ya typeahead; alinear a esta gramática (umbral 2, truncado, copy).
5. `TaskCoreFields` (hoy `limit: 6` silencioso).

Cada migración retira soft-cap / prefetch opaco y monta este patrón contra el lookup del dominio.

---

## 11. Pendientes y handoff

| Dueño | Entregable |
| --- | --- |
| **AI-DS-OWNER** | Contrato de componente `SearchablePicker` / `SearchableMultiPicker` — **entregado:** [2026-07-25-searchable-picker-ds-contrato.md](2026-07-25-searchable-picker-ds-contrato.md). |
| **AI-SR-FULL** | Lookups uniformes + `total` (o equivalente) para alimentar S6; máx. 20 por query |
| **AI-FE-PLATFORM** | Implementar contra esta spec + contrato DS; migrar inventario E-4 |
| **AI-SR-QA** | Casos CA-PICK-\* con tenant &gt; soft-cap histórico |

**Fuera de alcance de esta spec:** paginación de tablas (ADR-065), widgets con límite intencional de preview, matriz de balances (ya advierte truncamiento).

---

## 12. Registro de decisión UX

| Decisión | Elección | Motivo |
| --- | --- | --- |
| Umbral | 2 caracteres | Equilibrio ruido/red; plan E-4; evita lookups de 1 letra |
| Debounce | 300 ms | Consistencia portal + precedente SupplierPicker |
| Truncado | Aviso + afinar búsqueda | Honestidad sin convertir el picker en tabla |
| Paginación en picker | Prohibida | ADR-065 §Excepciones |
| Empty primera vez | Fuera del picker | Reduce carga cognitiva; alta es decisión de módulo |
| Mobile | Bottom sheet / nearly full-screen | Teclado usable; Firma: un job por superficie |

Cambios posteriores a v1.0 se versionan y se notifican a DS-OWNER, FE-PLATFORM y SR-QA; no se parchean en silencio.
