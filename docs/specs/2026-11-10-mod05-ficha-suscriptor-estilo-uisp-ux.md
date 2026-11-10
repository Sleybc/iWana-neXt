# Spec UX — MOD05 Suscriptores · Ficha y formularios con la composición de UISP

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-10 · decisiones D1–D5 resueltas · Plan: [2026-11-10-mod05-ficha-suscriptor-estilo-uisp](../plans/2026-11-10-mod05-ficha-suscriptor-estilo-uisp.md)
**Fecha:** 2026-11-10
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** `/dashboard/crm/subscribers/[id]` y los formularios que abre
**Origen:** [referencia UISP CRM v1.1](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md) §15.9 (instancia real, evidencia C26)
**Relacionado:** [spec del estado de cuenta en la ficha](2026-11-09-mod05-ficha-estado-de-cuenta-ux.md) (se conserva) · [spec UX de Suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) · [spec de exportación e importación](2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md)

---

## 0. Principio rector: complementar sin retroceso

Se adopta de UISP la **composición, la densidad y el patrón página/diálogo**. No se quita ninguna capacidad, pestaña, guarda, permiso ni dato que la ficha tiene hoy, y nada queda más lejos que hoy (más clics o más abajo). Cada bloque de §3 trae su columna «se conserva» y un criterio de no regresión (§5).

## 1. Hechos verificados (2026-11-10, `main` en `a1d1f187` más el árbol de trabajo)

| # | Hecho | Fuente |
|---|---|---|
| H1 | Pestañas: Vista general, Servicios, Facturación (con `BILLING_INVOICES_READ`), Soporte, Datos, Tributario y Cumplimiento | `SubscriberDetailClient.tsx:176-270` |
| H2 | La Vista general pone el estado de cuenta a todo el ancho y debajo dos columnas: Servicios y Contacto; Facturación, Oportunidad de origen y Privacidad | `SubscriberOverviewTab.tsx:503-518` |
| H3 | El encabezado ofrece acciones de estado (Agregar contacto, Cambiar estado, Suspender o Reactivar servicios con motivo visible cuando están deshabilitadas) y «Más acciones» | `SubscriberHeader.tsx:120-200` |
| H4 | El detalle del contrato es un panel lateral, y el alta de contrato es otro panel lateral de 893 líneas | `ContractDetailDrawer.tsx`, `CreateContractDialog.tsx` |
| H5 | La edición del titular vive en «Datos», con secciones Identificación, Contacto y Dirección que se guardan por separado; el mapa solo aparece allí | `SubscriberSections.tsx:446-760` |
| H6 | Soporte reúne tickets (con creación) y visitas | `SubscriberSupportTab.tsx:236-261` |
| H7 | Existe historial de ciclo de vida por API, sin pantalla de bitácora unificada ni nota manual del suscriptor | `subscribers.controller.ts:725`; referencia §10.3 |
| H8 | `@iwana/ui` tiene `Card`, `Avatar`, `Badge`, `Tabs`, `Dialog`, `DropdownMenu`, `Popover`, `FormSection`, `SectionAccordion`, `RadioCardGroup`, `CheckboxCard`, `DatePicker`. **No** tiene interruptor, control segmentado ni tooltip | `packages/ui/src/components/` |
| H9 | `SubscriberStatementSummary` ya muestra deuda y saldo a favor en la Vista general | `components/billing/SubscriberStatementSummary.tsx` |

## 2. Problema

La rev. 4 de la referencia comparó con capturas de 2018 y 2020 y marcó como alineados patrones que en la instancia real son distintos. La ficha de iWana dispersa en pestañas lo que el operador de UISP ve en una pantalla (identidad, servicios con ubicación, actividad, tickets y tareas abiertos, siguiente cobro). Además, alta y detalle de servicio viven en paneles laterales angostos para formularios largos.

## 3. Alcance por bloques

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Vista general en dos columnas** | Izquierda: `SubscriberStatementSummary` (H9) → Servicios con punto de estado, plan, precio, «+» y mapa de los puntos de servicio dentro de la tarjeta → **Actividad** (bloque D). Derecha: tarjeta de identidad (iniciales, nombre, insignias, ID visible, documento enmascarado, correo y teléfonos con acciones de contacto, nota; «Mostrar más» con dirección, tipo de persona, segmento, fecha de alta y origen) → **Siguiente cobro** (lectura de MOD14) → Visitas abiertas → Tickets activos → Privacidad | Paneles Contacto, Oportunidad de origen y Privacidad: su contenido pasa a la tarjeta de identidad o queda como tarjeta. Mapa solo con el permiso que hoy lo muestra en Datos |
| **B · Encabezado con «Registrar ▾»** | Botón dividido junto al nombre: Pago, Ticket, Visita, Documento, Servicio, filtrado por permiso y delegado al diálogo o la página que ya tiene cada módulo | Todas las acciones de H3 y su lógica de estado; «Más acciones» |
| **C · Estilo denso** | Tarjetas con borde fino, título en versalitas pequeñas, filas etiqueta–valor alineadas, acciones del encabezado de tarjeta como enlace, vacíos con ícono y una frase. Se define con `ds-owner` como **variante** de `PortalPanel`/`Card`, no como componente nuevo | Tokens de la identidad Firma iWana; contraste AA; tamaño táctil mínimo en móvil |
| **D · Actividad del suscriptor** | Tarjeta con bitácora unificada de lectura (ciclo de vida, cambios de datos, documentos, tickets, visitas, cobros y pagos) más **nota manual**. Filtro por tipo y paginación | La auditoría sigue siendo la fuente de verdad; la nota es un registro aparte, no editable después |
| **E · Servicio en página** | Detalle del contrato en ruta propia `…/subscribers/[id]/services/[contractId]`: estado con sus acciones, plan y velocidades, condiciones de cobro, ubicación con mapa, aprovisionamiento y técnico. El alta de contrato pasa a página completa en dos columnas con secciones plegables y **vista previa del primer cobro** | Todos los campos, validaciones, IVA y estrato con evidencia, concurrencia (`expectedUpdatedAt`) y vista previa del efecto en ciclo de vida. El panel lateral se retira solo cuando la página cubre el 100 % de sus acciones |
| **F · Documentos** | Pestaña o tarjeta «Documentos» del suscriptor: lista (tipo, fecha, autor, versión, visible para el titular) que reúne los soportes del expediente de origen, la evidencia de estrato y los PDF de cobro; «+ Documento» con **Subir**. Generar desde plantilla llega con la fase «Cierre de venta» (D4) | Soportes versionados del expediente y su estado; cifrado y control de acceso existentes |
| **G · Insignias derivadas** | Insignias de color en ficha y lista calculadas desde datos reales: tratamiento de IVA, datos fiscales incompletos, contacto pendiente, deuda vencida, suspendido. Etiquetas manuales solo para criterio del operador (decisión D2) | Colas de la lista; ninguna insignia se escribe a mano si existe el dato |

**Fuera de alcance:** pestañas separadas por tipo de documento de cobro (MOD14 ya las agrupa en Facturación), bandeja de tickets dividida (dueño MOD09), página de ajustes (dueño de cada módulo), portal del suscriptor.

## 4. Patrón página o diálogo

| Acción | Contenedor |
|---|---|
| Crear o editar entidad con más de un bloque de campos (titular, contrato, visita) | Página completa, dos columnas, secundarios plegables con `SectionAccordion`, Cancelar/Guardar arriba y abajo |
| Acción rápida de un bloque (pago, ticket, documento, nota) | `Dialog` pequeño, etiquetas a la izquierda en escritorio y arriba en móvil, ayuda bajo el campo, monto precargado cuando aplique |
| Acción con efecto en red o cobro (suspender, reactivar, terminar) | Se mantiene el diálogo actual con vista previa del efecto |

## 5. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Ninguna acción, campo o pestaña de H1–H6 desaparece; un test de inventario las enumera antes y después |
| CA-2 | Con permisos de lectura de ficha, la Vista general muestra identidad, servicios, deuda, siguiente cobro, tickets y visitas abiertos sin cambiar de pestaña |
| CA-3 | Cada opción de «Registrar ▾» respeta el permiso del módulo dueño y abre su flujo existente |
| CA-4 | El mapa y el documento de identidad solo se muestran con el permiso que hoy los muestra; el documento sale enmascarado |
| CA-5 | La página de servicio cubre todas las acciones del panel lateral, incluida la concurrencia y la vista previa del efecto |
| CA-6 | Ninguna insignia de G se puede asignar a mano cuando su dato existe |
| CA-7 | Densidad: la Vista general de un titular con un servicio cabe sin desplazamiento a 1440×900; en 375 px las columnas se apilan en el orden de §3 A |
| CA-8 | WCAG 2.2 AA en ficha, página de servicio y diálogos; ayuda accesible con teclado |

## 6. Decisiones abiertas

| # | Decisión | Dueño |
|---|---|---|
| D1 | **Resuelta 2026-11-10:** variante de densidad compacta sobre `PortalPanel`, validada por `ds-owner`; sin primitives nuevas. El interruptor SÍ/NO queda fuera de esta fase | Usuario |
| D2 | **Resuelta 2026-11-10:** las etiquetas manuales van en la fase siguiente, junto con la importación desde UISP. Aquí solo las insignias derivadas de G | Usuario |
| D3 | **Resuelta 2026-11-10 con la recomendación.** Fuente de la bitácora: v1 compuesta en el portal con lecturas que ya existen y respetan permisos (`GET :id/lifecycle-changes`, tickets, visitas, documentos y pagos de MOD14) más una tabla de notas manuales (migración tenant + endpoint). La auditoría no sirve: `GET /audit` es solo ADMIN y AUDITOR y no agrupa por suscriptor. Una proyección unificada en servidor queda para después, con ADR | Arquitectura + `sr-backend` |
| D4 | **Resuelta 2026-11-10:** las plantillas y el contrato firmado van en la fase propia «Cierre de venta» (contrato generado y firmado en la instalación + primer cobro). Aquí F solo lista y sube documentos | Usuario |
| D5 | **Resuelta por hecho:** `POST /billing/policy/preview` con `contractId` devuelve periodo, fecha de generación, vencimiento y corte (`BillingPolicyPreviewSchema`), con el mismo permiso que el estado de cuenta. «Siguiente cobro» = esas fechas + precio mensual del contrato, rotulado «estimado». Sin endpoint nuevo | — |

## 7. Orden sugerido

C (estilo) y A (composición) primero, porque no tocan API. Luego B, G y E. D lleva la única pieza de backend (tabla y endpoint de notas). F solo lista y sube. El plan de orquestación se emite tras el G0 de esta spec.

**Fases posteriores ya decididas:** etiquetas manuales + importación desde UISP (D2); «Cierre de venta»: contrato generado y firmado en la instalación + primer cobro (D4).

## 8. Contrato de densidad (D1)

**Dueño:** `ds-owner` · **Fecha:** 2026-11-10 · **Estado:** congelado para el bloque C (v1.0). Cambio aditivo sobre `PortalPanel` (carril rápido §3bis.3): no altera las variantes existentes ni crea primitives en `@iwana/ui` ni tokens. Implementa `fe-platform`; verifica `sr-qa`. Todo valor se cita por token o utilidad Tailwind ya resuelta en `packages/ui/src/styles/globals.css`.

### 8.1 API

**`PortalPanel`** (`apps/portal/src/components/shared/portal-ui.tsx`) recibe una prop nueva:

| Prop | Tipo | Default | Regla |
|---|---|---|---|
| `density` | `'default' \| 'dense'` | `'default'` | `'dense'` = estilo de ficha de §3 bloque C. No se llama `compact`: ese nombre ya existe como booleano del inicio (DS v1.6, solo `p-4`) y no se toca |

- `compact` y `density="dense"` son excluyentes; si llegan ambos gana `dense`. `compact` no se depreca en esta fase.
- `eyebrow` y `description` se ignoran visualmente en `dense` (el título es la única cabecera); el consumidor no los pasa. `titleAddon`, `actions`, `labelled`, `busy`, `titleRef` y `titleTabIndex` mantienen su contrato.
- `as="section"` y `labelled` son obligatorios en la ficha (cada tarjeta es una región localizable).

**`PortalFieldRow`** (nuevo export del mismo archivo, no de `@iwana/ui`) y su contenedor **`PortalFieldList`**:

| Componente | Props | Render |
|---|---|---|
| `PortalFieldList` | `children`, `className?` | `<dl>` |
| `PortalFieldRow` | `label: string`, `children: ReactNode` (valor), `empty?: boolean`, `mono?: boolean`, `action?: ReactNode`, `className?` | `<div>` con `<dt>` + `<dd>` |

- `empty` muestra «Sin dato» atenuado en lugar del valor; nunca una fila con valor vacío ni «—» suelto.
- `mono` aplica `font-mono` (ID visible, documento enmascarado, importes).
- `action` es un enlace o botón de icono alineado al final del `dd` (llamar, copiar, correo).
- Consolida los `<dl>` ad hoc de `SubscriberOverviewTab`, `SubscriberSections`, `SubscriberPeek`, `ServiciosTab`, `SubscriberVisitsSection`, `SubscriberTechnicalServiceSection`, `CutoffAgendaClient`, `ConvertExpedienteToContractDialog` y `VatTreatmentBanner`: la ficha migra en este bloque; el resto queda como deuda de consolidación de `fe-platform` sin obligación en esta fase.

### 8.2 Clases por elemento (`density="dense"`)

| Elemento | Clases exactas |
|---|---|
| Contenedor | `rounded-xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2` · sin `shadow-iwana-soft` · sin padding propio (`p-0`) |
| Cabecera | `flex min-h-11 items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 dark:border-dark-border` |
| Título (`h2`) | `text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300` (versalitas pequeñas; no usa `.portal-eyebrow`, que es lima y reservado al eyebrow) |
| Acción de cabecera | Enlace o `button` tipo enlace: `inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary underline-offset-4 hover:underline dark:text-iwana-primary-300 sm:min-h-0` + `interactiveFocusClassName`. Máximo una visible; más de una → menú «⋯» existente. Nunca `Button` relleno en cabecera densa |
| Cuerpo | `px-4 py-3` (`contentClassName` puede anular solo el padding, p. ej. lista a sangre `px-0 py-0`) |
| `PortalFieldList` | `divide-y divide-gray-100 dark:divide-dark-border` |
| `PortalFieldRow` | `grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[minmax(7rem,38%)_1fr] sm:gap-3` |
| `dt` (etiqueta) | `text-sm text-gray-500 dark:text-gray-400` |
| `dd` (valor) | `flex min-w-0 items-center justify-between gap-2 text-sm text-gray-900 break-words dark:text-white` |
| Valor vacío | `text-gray-500 dark:text-gray-400` con texto «Sin dato» |
| Separación entre tarjetas | La pone la página: `gap-4` en la columna (no `space-y` dentro del panel) |

Radio `rounded-xl` = `--radius-xl`; bordes `dark-border` = `--color-dark-border`; superficie oscura `--color-dark-surface-2`. Ningún hex en el componente.

### 8.3 Estados

| Estado | Comportamiento |
|---|---|
| Normal | Cabecera + cuerpo según 8.2 |
| Hover | Solo en la acción de cabecera (subrayado) y en filas con `action`; la tarjeta no reacciona |
| Focus | `interactiveFocusClassName` en acciones; título con `titleTabIndex={-1}` cuando es destino de foco tras reintento |
| Cargando | `busy` → `aria-busy`; cabecera visible; cuerpo = 3 filas `PortalSkeletonBlock` `h-4` con la misma rejilla de 8.2 (no cambia la altura al resolver más de una fila) |
| Vacío | `PortalEmptyState embedded` dentro del cuerpo con ícono y **una frase** como `title`; `description` opcional y corta; acción solo si el rol puede crear. Nunca tarjeta oculta: el título sigue siendo región localizable |
| Error | `PortalAlert variant="error"` compacto dentro del cuerpo con «Reintentar»; la cabecera permanece; el foco vuelve al título tras reintentar |
| Deshabilitado / solo lectura | La acción de cabecera no se renderiza si falta el permiso (no se muestra deshabilitada); filas sin `action` |
| Éxito | Sin estado propio: lo comunica `PortalSuccessAlert` o el toast del flujo |

### 8.4 Accesibilidad

Contraste calculado sobre tokens reales (texto ≤14 px, umbral 4,5:1):

| Par | Claro (sobre `bg-white`) | Oscuro (sobre `--color-dark-surface-2`) |
|---|---|---|
| Título `gray-600` / `gray-300` | ≈ 7,5:1 | ≈ 11:1 |
| Etiqueta `gray-500` / `gray-400` | ≈ 4,8:1 | ≈ 6,0:1 |
| Valor `gray-900` / `white` | ≈ 17:1 | ≈ 15:1 |
| Enlace `iwana-primary` / `iwana-primary-300` | ≈ 16:1 | ≈ 7,0:1 |

- Borde `gray-200` es decorativo (la tarjeta se identifica por el título), no exige 3:1.
- Etiqueta nunca más clara que `gray-500` ni en tamaño menor a `text-sm`; el título es el único texto en `text-xs` y lleva `font-semibold`.
- Objetivo táctil ≥ 44 px (`min-h-11`) en acción de cabecera y `action` de fila por debajo de `sm`; desde `sm` puede bajar al alto del texto pero conserva área de foco visible.
- Semántica: `section` + `aria-labelledby` al `h2`; filas `dl/dt/dd`; acciones de fila con `aria-label` que nombra el dato («Llamar al 300…» no; «Llamar al teléfono principal»).
- Mayúsculas por CSS (`uppercase`), nunca escritas en el texto, para que el lector de pantalla no deletree.

### 8.5 Criterios de aceptación

1. `PortalPanel` sin `density` renderiza idéntico a hoy (prueba de instantánea de clases de `default` y `compact` sin cambios).
2. `density="dense"` aplica exactamente las clases de 8.2; sin `shadow-iwana-soft`; ningún hex ni token nuevo en el diff (`globals.css` intacto).
3. `PortalFieldRow` renderiza `dt`/`dd` dentro de `PortalFieldList` (`dl`); con `empty` muestra «Sin dato».
4. A 375 px: filas en una columna, sin scroll horizontal, acciones de cabecera y fila con alto ≥ 44 px.
5. Estados cargando, vacío y error de 8.3 cubiertos por prueba de componente; error conserva cabecera y devuelve foco al título.
6. axe sin violaciones de contraste en claro y oscuro sobre la ficha; revisión `iwana-identity-ui-review` sin P0/P1.
7. Ningún componente nuevo en `packages/ui`; ninguna variante de `Card` tocada.
8. Changelog del DS (`core-components`) registra: «v1.x — `PortalPanel density="dense"` y `PortalFieldRow/PortalFieldList` (aditivo, D1 MOD05)».
