# Criterios de evaluacion por dimension

Referencia detallada para el modo review de `iwana-identity-ui-review`. Leer cuando se ejecuta la metodologia completa. Cada criterio incluye el ancla iWana concreta para que el hallazgo sea verificable y no una heuristica generica.

Los valores exactos viven en las referencias hermanas — no los dupliques desde aqui: `tokens.md` (hex, escalas, radios, sombras, dark), `firma-elements.md` (recetas de los 9 elementos de firma y reglas del lima), `component-recipes.md` (primitives y class-tokens reales por patron), `prototype-map.md` (Estrella Polar y reglas TailAdmin), `trends-2026.md` (veredictos de tendencias).

## 1. Identidad iWana

- **Reconocibilidad sin logo**: radio `rounded-2xl` en superficies principales, sombras suaves (`shadow-iwana*`), Exo 2, paleta primario/lima/neutros. Una pantalla hecha solo con grises de Tailwind y bordes `rounded-md` es un hallazgo de identidad.
- **Elementos de firma** (direccion vigente, `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`): barra lima `w-1 rounded-r-full` en navegacion activa con sidebar atenuada; sombra dual (`soft` reposo, `active` foco/edicion) como unica tecnica de profundidad; degradado `from-iwana-primary to-iwana-secondary` reservado a indicadores de progreso; par tonal lima (`iwana-secondary-100`/`-900`) para badges de completitud/exito; IDs, SKUs, timestamps y columnas numericas en mono/tabular; gramatica de 3 estados en acordeones y wizards (activo = borde + sombra active, completado = hundido con badge tonal, pendiente = neutro con hover lima). Una pantalla nueva debe exhibir ≥2 de estos elementos con funcion real.
- **Rol de cada color**: `iwana-primary` comunica estructura, confianza y acciones secundarias importantes; `iwana-secondary` es acento (boton primario, señales de interaccion, avance/exito/completitud). Invertir los roles (secundario como color estructural masivo) diluye la marca. **El lima nunca comunica urgencia, prioridad alta ni alerta** — eso corresponde a las escalas `warning`/`error`. Jerarquia de botones: lima = accion principal de pagina; azul solido = acciones de seccion; ghost/outline = secundarias.
- **Superficies**: card base blanca; `iwana-surface-soft` para superficies suaves de apoyo (cards de navegacion, fondos de icono, empty states activos); `iwana-secondary-50` solo para acentos de interaccion (tab activa, filtro seleccionado, pill transitoria, hover marcado).
- **Glassmorphism selectivo**: `.iwana-glass` en overlays, drawers, controles flotantes o botones sobre contenido. Nunca masivo en tablas o formularios.
- **Dark mode**: solo tokens `dark-surface-{1..4}` y `dark-border{,-2}` (ADR-026). `dark:bg-gray-*` esta prohibido en codigo nuevo.
- **Microinteracciones**: rapidas (150-300 ms), naturales, nunca bloquean la tarea. Elevacion dramatica (lift/scale agresivos) no corresponde a herramientas operativas.

## 2. Usabilidad

- **Claridad visual**: la tarea principal es identificable en < 5 segundos en el primer viewport. Un bloque dominante; secundarios subordinados.
- **Jerarquia**: tamaños, pesos y color siguen la importancia real de la informacion, no el orden del DOM. Eyebrows (`.portal-eyebrow`) discretos, no compitiendo con titulos.
- **Navegacion**: la ubicacion actual es evidente (tab activa con `portalTabActiveClassName`, breadcrumb o titulo de seccion); volver atras no pierde estado de filtros.
- **Descubribilidad**: acciones frecuentes visibles sin hover-only ni menus colapsados por defecto; acciones destructivas separadas y con confirmacion.
- **Consistencia**: misma accion, mismo patron en todo el modulo (mismo drawer, mismo toolbar, mismos labels). Comparar contra pantallas hermanas del mismo modulo antes de reportar.

## 3. UX

- **Friccion**: pasos que no aportan decision se eliminan; datos que el sistema conoce no se vuelven a pedir.
- **Carga cognitiva**: densidad suficiente para operar sin comprimir controles; agrupar formularios por decision de negocio, no por azar visual.
- **Flujos criticos**: crear, editar, despachar, anular — cada uno con camino feliz corto y salida clara ante error. Ponderar hallazgos por cercania a estos flujos.
- **Feedback del sistema**: toda accion asincrona muestra estado (loading en boton o `PortalSkeletonBlock`), resultado (exito/error via `PortalAlert` o toast) y siguiente paso.
- **Estados vacios**: `PortalEmptyState` con titulo, explicacion y accion; un vacio sin accion es un callejon sin salida.
- **Errores**: mensaje junto al campo que fallo, en español claro, sin codigos crudos; el error global no reemplaza al error de campo.

## 4. Accesibilidad (barrido AA basico)

Para auditoria profunda o evidencia formal, derivar a `wcag-audit-patterns`. Este barrido cubre:

- **Contraste**: 4.5:1 texto normal, 3:1 texto grande y componentes UI. Regla fija del repo: `iwana-secondary` sobre blanco NO pasa; usar `iwana-secondary-700` (6.2:1).
- **Teclado**: todo interactivo alcanzable y operable con Tab/Enter/Escape; orden de tabulacion = orden visual; drawers y modales atrapan y devuelven el foco.
- **Foco visible**: `interactiveFocusClassName` (o `focus-visible:ring-2 ring-iwana-primary` + offset) en todo interactivo custom.
- **Labels**: inputs con `<label>` asociado o `sr-only` (patron `PortalSearchField`); botones de solo icono con `aria-label`.
- **ARIA y lectores**: alertas con `role`/`aria-live` correctos (ya resuelto si se usa `PortalAlert`); iconos decorativos con `aria-hidden`; jerarquia de headings sin saltos.
- **No solo color**: estados y severidades acompañados de icono o texto, no solo tinte.

## 5. Diseño visual

- **Espaciado**: multiplos de 4 px; ritmo vertical consistente dentro del panel (`PortalPanel` ya define p-5 y separadores).
- **Tipografia**: escala del sistema, sin tamaños arbitrarios; peso semibold para titulos de panel, medium para enfasis; nada por debajo de 12 px para contenido operativo (los 10 px estan reservados al eyebrow del sistema).
- **Color**: tokens siempre; hex locales o paletas ad hoc son deuda. Estados semanticos con las escalas `success/warning/error` del sistema, no verdes/rojos inventados.
- **Consistencia**: sombras del set `shadow-iwana*`; radios del set del tema; un solo estilo de borde por contexto.
- **Escalabilidad**: el diseño soporta 10x los datos del mock (textos largos truncan con title, tablas paginan, grids colapsan) sin romperse.

## 6. Responsive

- **Mobile**: acciones frecuentes visibles y operables (no solo en hover ni escondidas en overflow); targets tactiles ≥ 44 px; sin scroll horizontal del layout (las tablas anchas scrollean dentro de su shell, `portalDataTableShellClassName` + overflow).
- **Tablet**: toolbars y headers pasan de columna a fila sin solaparse (patron `md:flex-row` de `PortalPanel`/`PortalSectionHeader`).
- **Desktop**: densidad aprovechada sin estirar lineas de texto mas alla de lo legible; paneles laterales y drawers en vez de navegacion a pantalla completa cuando se preserva contexto.
- **Adaptacion**: lo que se oculta por breakpoint debe seguir accesible por otra via; ocultar ≠ resolver.

## 7. Ingenieria frontend

- **Primitives primero**: antes de estilar a mano, verificar `portal-ui.tsx` y `@iwana/ui`. Reimplementar un panel, alerta, empty state o skeleton existente es un hallazgo.
- **Promocion de patrones**: un patron visual repetido ≥ 2 veces (clase compuesta, valor arbitrario, mini-componente local) se promueve a utility en `globals.css`, a primitive compartida o a instruccion — y el hallazgo debe decir a cual.
- **Design system compliance**: cero `tailwind.config.js`; tokens via `@theme`; variante dark via clase `.dark`.
- **Performance visual**: skeletons que reservan espacio (evitar layout shift); animaciones solo transform/opacity; imagenes y listas largas con carga diferida; respetar `prefers-reduced-motion` en animaciones no triviales.
