---
name: iwana-identity-ui-review
description: Disciplina de diseño, alineacion y auditoria de UI para iWana neXt. Usar siempre que se cree, construya, revise, refine, mejore o audite cualquier pantalla, componente, modulo, dashboard, formulario, tabla, modal, drawer, settings, estado vacio o patron visual del portal o del backoffice — aunque nadie mencione la palabra iWana. Tambien cuando una UI se sienta generica, ruidosa, pesada, "de template" o fuera de identidad; cuando se pida "alinear al estilo", "que se vea como el resto", "mejorar el diseño"; cuando se evalue adoptar una tendencia de diseño o un patron tipo TailAdmin/Linear/Attio; y antes de introducir un patron visual o primitive nuevo. En modo diseño alinea la construccion a la identidad con playbook, recetas y tokens reales; en modo review produce hallazgos P0-P3 con evidencia verificable y un informe estandar. Incluye un script de auditoria mecanica de reglas duras.
metadata:
  category: discipline
  triggers: identidad, UI, interfaz, pantalla, componente, modulo, seccion, dashboard, settings, diseño, visual, estilo, alinear, iWana, brand, tokens, auditoria, review, accesibilidad, responsive, tendencia, TailAdmin
---

# iWana Identity UI Review

Disciplina para traducir la identidad corporativa iWana a interfaces operativas del producto, alinear toda construccion de UI a esa identidad y auditarla con criterio verificable.

## Regla de hierro

**Toda interfaz nueva o refinada debe sentirse iWana: fresca, minimalista, equilibrada, profesional, accesible y clara para trabajo operativo real.**

La identidad no es decoracion. Si un efecto, borde, card, gradiente o animacion no mejora claridad, escaneo, confianza o accion, no pertenece a la interfaz. Esta regla existe porque el producto es una herramienta B2B multi-tenant de uso diario: cada elemento decorativo que compite con la tarea del usuario tiene costo operativo real. La postura de la marca (spec Firma iWana): **visualmente sobrio, interactivamente denso** — el color comunica significado (estado, avance, foco, accion), nunca adorno; el ancla diferencial es el duo azul noche → lima como codificacion de estado y progreso.

## Cuando usarla

- Antes de crear o rediseñar una pantalla, seccion, componente o modulo.
- Al mejorar dashboards, settings, tablas, formularios, modales, drawers o estados vacios.
- Cuando una UI se siente generica, pesada, plana, ruidosa o poco alineada a iWana.
- Cuando se vaya a introducir un nuevo patron visual, una primitive o una tendencia de diseño.
- Cuando se pida una auditoria o review de calidad de una UI existente.

## Cuando NO usarla (delegar)

Delegar evita hallazgos redundantes entre skills y mantiene cada informe enfocado:

| Necesidad | Skill responsable | Esta skill aporta |
| --- | --- | --- |
| Auditoria WCAG profunda con evidencia formal | `wcag-audit-patterns` | Solo el barrido AA basico del checklist |
| Propuesta de direccion visual nueva (2-3 opciones) | `senior-ui-systems-designer` | El marco de identidad que la propuesta debe respetar |
| Copy visible, labels, vocabulario de producto | `system-vocabulary-review` | Solo detectar el sintoma (enum crudo, tono incorrecto) y derivar |
| Consolidacion de componentes compartidos | `core-components` | Detectar el patron repetible y proponer la promocion |
| Heuristicas UX genericas ampliadas | `ui-ux-pro-max` (subordinada) | El filtro: toda sugerencia generica se adapta o descarta segun iWana y `references/trends-2026.md` |

Si el problema es solo backend, contratos API o arquitectura tecnica sin superficie visual, esta skill no aplica.

## Fuentes de verdad y precedencia

1. `packages/ui/src/styles/globals.css` — tokens reales Tailwind v4 CSS-first. **Es la fuente primaria para afirmar que un token, utility o sombra existe o no existe.**
2. `apps/portal/src/components/shared/portal-ui.tsx` — primitives del portal (PortalPanel, PortalAlert, PortalEmptyState, PortalSkeletonBlock, `interactiveFocusClassName`, class-tokens de tabla/tabs/metricas, etc.).
3. `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — **direccion visual vigente "Firma iWana"**. Los componentes/tokens de fases aun no ejecutadas se citan como direccion aprobada, no como existentes.
4. `docs/identity/Manual_Implementacion_Identidad_Iwana.md` — personalidad, principios y decisiones de uso de color.
5. `.github/instructions/system-vocabulary.instructions.md` — tono y copy.

Si este documento y los tokens reales divergen, mandan los tokens reales; documenta la divergencia en lugar de inventar un valor intermedio. Nunca recomiendes crear `tailwind.config.js` (el sistema es CSS-first por ADR) ni tokens que no existan en `globals.css` sin marcarlos explicitamente como propuesta de token nuevo.

## Referencias de esta skill — cuando leer cual

| Referencia | Leela cuando... |
| --- | --- |
| `references/tokens.md` | Vayas a citar, aplicar o negar un color, radio, sombra, superficie o token dark. Contiene los hex exactos, la regla AA del lima y las divergencias conocidas |
| `references/firma-elements.md` | Construyas o evalues una pantalla: los 9 elementos de firma con receta de clases, las reglas semanticas del lima y la jerarquia de botones |
| `references/component-recipes.md` | Construyas cualquier patron (KPI, tabla, panel, tabs, empty, loading, formulario, side peek, shell, auth, timeline): que primitive/class-token real usar y que nunca hacer |
| `references/prototype-map.md` | Necesites la Estrella Polar: sus 3 capas de precedencia (spec Firma > identidad/prototipo > codigo real), que referentes externos ya estan en el canon, que define cada prototipo y que esta prohibido copiar de TailAdmin (ADR-023) |
| `references/trends-2026.md` | Alguien proponga una tendencia ("es lo que hace Linear/Attio", "es tendencia 2026") o evalues un patron nuevo: veredicto Adoptar/Adaptar/Rechazar con ancla |
| `references/evaluation-criteria.md` | Ejecutes la metodologia completa de review: detalle de las 7 dimensiones |

## Modos de operacion

Elige el modo segun la tarea y declaralo al inicio de la respuesta. Mezclarlos produce informes inconsistentes.

**Modo diseño** — la tarea es crear o refinar una UI. Sigue el playbook de alineacion; no generes informe de auditoria. La salida es la UI (o especificacion) mas una nota corta de decisiones de identidad tomadas.

**Modo review** — la tarea es evaluar una UI existente (codigo, screenshot o ambos). Sigue la metodologia completa y entrega el informe con el formato estandar de la seccion "Formato de salida".

## Playbook de alineacion (modo diseño)

Cada construccion o refinamiento de UI sigue estos pasos — es lo que garantiza que cada invocacion alinee el resultado a iWana en vez de improvisar:

1. **Clasifica la pantalla**: dashboard · tabla operativa · formulario · detalle/expediente · auth · settings · modal/drawer · estado (empty/error). Define la tarea principal del usuario en una frase.
2. **Lee la receta del patron** en `references/component-recipes.md` y usa las primitives/class-tokens reales que indica (`portal-ui.tsx`, `@iwana/ui`). Estilar a mano lo que ya existe como primitive es el error mas caro.
3. **Aplica ≥2 elementos de firma con funcion real** de `references/firma-elements.md` (barra lima activa, sombra dual, par tonal, gramatica de 3 estados, mono tecnico, etc.). Verifica las reglas semanticas del lima: nunca urgencia, nunca fondo base, texto siempre `-700+`.
4. **Verifica cada token contra `references/tokens.md`** (y ante la duda, contra `globals.css`): superficies, dark con `dark-surface-*`, radios (2xl superficie / xl control / full pill), sombra dual como unica profundidad.
5. **Corre el script de auditoria** sobre los archivos tocados (seccion siguiente) y corrige los hallazgos deterministas antes de entregar.
6. **Checklist de cierre** (seccion "Validacion antes de cerrar"): reconocible sin logo, tarea visible en primer viewport, AA, estados completos, patron promovible identificado.

Si el patron que necesitas no tiene receta ni token: no lo inventes en la pantalla — proponlo explicitamente como patron/token nuevo (via DS-OWNER / `senior-ui-systems-designer`) y usa lo existente mientras tanto.

## Script de auditoria mecanica

`scripts/audit-ui.mjs` detecta violaciones de reglas duras con archivo:linea, sin depender del juicio del agente. Usalo en ambos modos: en diseño sobre los archivos tocados antes de entregar; en review como primer barrido de evidencia.

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs [rutas...] [--json]
# sin rutas: escanea apps/portal/src, apps/web/src y packages/ui/src
```

- Reglas **deterministas** (alta confianza, citables directo como evidencia): `dark:bg-gray-{700-950}` (ADR-056 §2), `tailwind.config.*` presente, hex de marca sin tokenizar, z-index tipo `z-9999`.
- Reglas **heuristicas** (el script las marca `[revisar]`): lima sin sufijo AA en texto, `bg-iwana-secondary-50` como posible fondo base, degradado de marca fuera de progreso, spinner como carga primaria, posible enum crudo en JSX. **Un hallazgo heuristico requiere confirmacion manual antes de entrar al informe** (regla anti-falso-positivo 2).
- Exit code 1 si hay P0/P1 — util como gate local antes de commit.

El script no reemplaza la metodologia: cubre lo grep-able. Jerarquia, flujo, densidad y firma requieren el juicio de las dimensiones.

## Referencia rapida — que revisar primero

Orden de prioridad al construir o revisar (el detalle vive en las referencias):

| # | Categoria | Checks clave | Anti-patron tipico |
| --- | --- | --- | --- |
| 1 | Accesibilidad | AA (lima solo `-700+` en texto), foco visible (`interactiveFocusClassName`), teclado, labels, no-solo-color | `text-iwana-secondary` sobre blanco; foco invisible |
| 2 | Identidad / firma | ≥2 elementos de firma con funcion; lima = avance/accion, nunca urgencia ni fondo base; duo azul→lima solo progreso | Lima en alertas; degradado decorativo; pantalla "de template" |
| 3 | Superficie y profundidad | Card blanca + `iwana-surface-soft` de apoyo; sombra dual unica profundidad; dark solo `dark-surface-*` | `dark:bg-gray-800`; glass en tablas; cards anidadas |
| 4 | Primitives y tokens | Receta del patron antes que estilo manual; tokens antes que hex; promocion de repetidos | Reimplementar `PortalPanel`; hex `#17163A` en codigo |
| 5 | Tipografia y datos | Escala dual title/UI; mono/tabular en IDs y cifras; eyebrows del sistema; nada <12px operativo | Cifras que saltan; eyebrow manual |
| 6 | Densidad y responsive | 5-9 KPIs nucleo; targets ≥44px; acciones frecuentes visibles; tablas scrollean en su shell | >12 KPIs; acciones solo en hover; scroll horizontal de layout |
| 7 | Estados y motion | loading (skeleton con forma) / empty (con accion) / error (junto al campo) / success; 150-300ms solo transform/opacity | Spinner bloqueante; vacio sin accion; animacion por hover de tabla |

## Metodologia de review

El orden importa: recolectar evidencia antes de opinar es lo que reduce falsos positivos.

1. **Recolectar contexto real.** Corre `scripts/audit-ui.mjs` sobre los archivos de la pantalla. Lee el codigo, los tokens vigentes en `globals.css` y las primitives disponibles. Si solo hay screenshot, marca el informe como "revision visual sin codigo" y limita los hallazgos tecnicos a lo observable.
2. **Clasificar la pantalla** (dashboard, listado, formulario, configuracion, detalle, modal/drawer, estado) y **definir la tarea principal del usuario**. Todo hallazgo posterior se pondera contra esa tarea: lo que no la afecta baja de severidad.
3. **Evaluar por dimensiones.** Recorre las 7 dimensiones. Para el detalle de criterios por dimension, lee `references/evaluation-criteria.md`.
4. **Verificar cada hallazgo** contra las reglas anti-falso-positivo antes de incluirlo; los hallazgos heuristicos del script se confirman o descartan aqui.
5. **Clasificar severidad, impacto y esfuerzo** segun el sistema P0-P3.
6. **Redactar el informe** con el formato estandar, hallazgos deduplicados por causa raiz y priorizados.

### Dimensiones de evaluacion

| Dimension | Pregunta central |
| --- | --- |
| Identidad iWana | ¿Se reconoce como iWana sin logo? ¿Tokens y rasgos de marca bien aplicados? |
| Usabilidad | ¿Claridad visual, jerarquia, navegacion, descubribilidad y consistencia sostienen la tarea principal? |
| UX | ¿Friccion, carga cognitiva, feedback, estados vacios y manejo de errores estan resueltos? |
| Accesibilidad | ¿Contraste AA, teclado, labels, ARIA, foco visible y no depender solo del color? |
| Diseño visual | ¿Espaciado, tipografia, color y densidad son consistentes y escalables? |
| Responsive | ¿Mobile, tablet y desktop mantienen jerarquia y acciones operables? |
| Ingenieria frontend | ¿Usa primitives y tokens en vez de estilos locales? ¿Patrones repetibles promovidos? |

## Reglas duras verificables

Estas reglas son mecanicamente comprobables en el codigo (el script cubre las marcadas ⚙). Un hallazgo basado en ellas es de alta confianza; citalas por nombre en la evidencia.

| Regla | Como detectarla | Severidad base |
| --- | --- | --- |
| ⚙ Texto `text-iwana-secondary` (sin sufijo 700+) sobre fondo claro — no pasa AA | grep `text-iwana-secondary[^-]` en superficie clara; usar `iwana-secondary-700` | P1 |
| ⚙ `dark:bg-gray-{700,800,900,950}` en codigo nuevo — prohibido por ADR-056 §2; usar `dark-surface-*` / `dark-border-*` | grep `dark:bg-gray-(700|800|900|950)` | P1 |
| ⚙ `tailwind.config.{js,ts}` presente en apps/packages — el sistema es CSS-first por ADR | existencia del archivo | P0 |
| Interactivo custom sin foco visible — usar `interactiveFocusClassName` o `focus-visible:ring` | elementos clickeables sin `focus-visible:` | P1 |
| ⚙ Enum crudo o `UPPER_SNAKE_CASE` visible al usuario | render directo de valores de enum | P1 (derivar a `system-vocabulary-review`) |
| Acciones frecuentes ocultas o comprimidas en mobile | breakpoints que esconden acciones primarias | P1 |
| Estados loading / empty / error ausentes en vistas con datos remotos | falta `PortalSkeletonBlock`, `PortalEmptyState`, `PortalAlert` o equivalente | P1-P2 segun flujo |
| Lima usado como señal de urgencia, prioridad alta o alerta — el lima significa avance/exito/accion (spec Firma iWana §3); urgencia usa escalas `warning`/`error` | tinte `iwana-secondary*` en badges/textos de prioridad alta, alertas o riesgos | P1 |
| ⚙ Hex de marca sin tokenizar (`#17163A`, `#A5C330`, `#F8F8FB`, `#EDF8CC`, ...) fuera de `globals.css`/`tokens/` | grep de hex de marca en codigo de apps | P2 |
| ⚙ `iwana-secondary-50` como fondo base de paneles, toolbars o empty states — reservado a acentos de interaccion; el fondo suave es `iwana-surface-soft` | grep `bg-iwana-secondary-50` en contenedores | P2 |
| Valores arbitrarios repetidos (`tracking-[...]`, hex, sombras locales) sin promocion a utility o primitive | grep de valores arbitrarios duplicados | P2 |
| Cards dentro de cards sin funcion (superficies anidadas) | `rounded-2xl` + borde/sombra anidados | P2 |
| Glass, gradiente o blur masivo en tablas o formularios — glassmorphism es selectivo (overlays, drawers, controles flotantes) | `.iwana-glass` / `backdrop-blur` fuera de overlays | P2 |
| ⚙ Degradado azul→lima fuera de indicadores de progreso — es firma de avance, no decoracion | `from-iwana-primary to-iwana-secondary` (o `.iwana-gradient`) en fondos, headers o cards sin semantica de progreso | P2 |
| ⚙ Guerra de z-index heredada de template (`z-9999+`) — la escala iWana es corta (0/10/20/40/100/1000) | grep `z-[9]{3,}` | P2 |
| Variante local nueva de un patron firma ya unificado (KPI card, tabla, page header, sidebar) en vez del primitive/contrato vigente | componente ad hoc que duplica un patron cubierto por `portal-ui.tsx` / `@iwana/ui` | P2 |
| ⚙ Tabla operativa sin cota de pagina / listado unbounded (ADR-064 §8, vigente) — o pie ornamental «Fin de resultados» / conteo duplicado | fetch sin `limit` materializado en grilla; conteo repetido en strip y pie | P1 |
| Tabla que monta los dos pies a la vez, o que decide el modo en el frontend en vez de leer `meta.capabilities.randomAccess` (ADR-065) | `PortalTablePagination` y `PortalTablePager` en el mismo shell; condicional por modulo | P1 |
| Pagina, tamaño de pagina, filtros u orden fuera de la URL en una tabla paginada (ADR-065 §9) | estado de paginacion solo en `useState`; el boton Atras no vuelve a la pagina anterior | P1 |
| Lima en el pager de paginacion o en el encabezado ordenable — el lima es avance; pagina y orden son posicion | `iwana-secondary*` en botones de pagina o en el control de orden | P2 |
| ⚙ Encabezado ordenable sin `aria-sort` en el `<th>`, o mas de un `aria-sort` distinto de `none` por tabla (ADR-065 §22) | control de orden en `<th>` sin `aria-sort` | P1 |
| Columna con control de orden que no esta declarada en `meta.capabilities.sortableFields`, o lista de columnas ordenables hardcodeada en la pantalla (ADR-065 §18) | array local de campos ordenables en el componente | P1 |
| Estado de orden comunicado solo por el icono, sin cambio de peso ni texto accesible (WCAG 1.4.1) | encabezado activo identico al inactivo salvo el caret | P2 |
| Ciclo de orden reimplementado en la pantalla en vez de delegarlo al primitive | logica `asc`/`desc` local en un componente de tabla | P2 |
| ⚙ Spinner bloqueante en vista principal en vez de skeleton con forma de contenido | spinner/`animate-spin` como estado de carga primario de una pagina o tabla | P3 |
| Cifras en columnas de datos sin figuras tabulares o mono — provocan saltos de layout | columnas numericas de tabla sin `font-mono` / `tabular-nums` | P3 |
| Eyebrow manual en vez de `.portal-eyebrow` / `.portal-eyebrow-muted`, o letter-spacing exagerado | estilos de eyebrow ad hoc | P3 |

## Sistema de severidad

Cada hallazgo lleva severidad, impacto y esfuerzo. La severidad mide daño al usuario o a la marca; el esfuerzo ordena la ejecucion.

| Nivel | Definicion | Ejemplos |
| --- | --- | --- |
| **P0 Critico** | Bloquea o corrompe la tarea principal; fallo AA en flujo critico; riesgo de perdida de datos o de accion equivocada | Accion primaria inoperable en mobile; error de datos sin feedback; contraste ilegible en el flujo principal |
| **P1 Alto** | Friccion significativa en la tarea principal; violacion de regla dura; fallo AA en flujo secundario | Texto de acento sin AA; foco invisible; estado de error ausente |
| **P2 Medio** | Inconsistencia con identidad o sistema que no bloquea la tarea | Superficies anidadas; valores arbitrarios repetidos; glass decorativo |
| **P3 Bajo** | Pulido; mejora perceptible pero marginal | Espaciado irregular menor; eyebrow ad hoc |

- **Impacto**: a quien afecta y en que flujo (una frase concreta, no "afecta la UX").
- **Esfuerzo**: S (< 1 h, cambio local), M (1 h - 1 dia, varios archivos), L (> 1 dia o requiere primitive/ADR).
- **Quick win** = severidad P1-P2 con esfuerzo S.

### Puntaje derivado

El puntaje global se calcula, no se estima, para que dos reviews de la misma pantalla den el mismo numero:

`Puntaje = max(0, 100 − 20·P0 − 10·P1 − 3·P2 − 1·P3)`

Bandas: 90-100 alineada; 75-89 aceptable con mejoras; 50-74 requiere trabajo antes de cerrar; < 50 no cumple identidad ni calidad minima.

## Anti-falsos-positivos

Un informe con 5 hallazgos verificados vale mas que uno con 20 especulativos. Antes de incluir un hallazgo:

1. **Evidencia obligatoria.** Cada hallazgo cita archivo:linea, selector o zona concreta del screenshot. Sin evidencia localizable no es hallazgo: va a una lista corta "Por verificar" al final del informe, o se omite.
2. **Verifica contra las fuentes.** Antes de afirmar "no usa el token X" o "deberia usar la utility Y", confirma que X/Y existen en `globals.css` o `portal-ui.tsx` (atajo: `references/tokens.md` y sus divergencias conocidas). Recomendar tokens inexistentes es el falso positivo mas dañino de esta skill. Los hallazgos `[revisar]` del script no entran al informe sin esta confirmacion.
3. **Una causa raiz, un hallazgo.** Si diez celdas repiten el mismo hex, es un hallazgo con diez ocurrencias, no diez hallazgos.
4. **No reportes lo que las primitives ya resuelven.** Si la pantalla usa `PortalAlert`, su semantica ARIA ya esta cubierta; no la audites de nuevo.
5. **Preferencia no es hallazgo.** Un hallazgo con severidad solo se ancla en fuentes normativas: la spec Firma iWana, un ADR **aprobado**, el manual de identidad, los tokens reales de `globals.css` o un criterio WCAG. `trends-2026.md` **no es normativo**: su seccion A (Ecos de norma) sirve para localizar el artefacto — cita el artefacto, no la tabla; su seccion B (Propuestas DS) se ofrece como "sugerencia opcional" fuera del conteo de severidad. Antes de citar cualquier ancla, abrela y verifica que dice lo que afirmas (ver el caso ADR-026 en la cabecera de `trends-2026.md`).
6. **Legacy en fases.** Flujos legacy que adoptan identidad por fases no se penalizan por lo pendiente; solo se reporta si introducen patrones **nuevos** contrarios al manual.
7. **Presupuesto de atencion.** Reporta todos los P0/P1. De P2/P3 incluye solo los de mejor relacion impacto/esfuerzo (tipicamente ≤ 8); el resto se resume en una linea agregada.

## Formato de salida (modo review)

Usa siempre esta estructura exacta. Español, sentence case, sin exponer enums crudos.

```markdown
# Review UI — [pantalla] ([modulo])

## Resumen ejecutivo
[2-4 frases: tipo de pantalla, tarea principal, estado general, riesgo dominante]
**Modo:** [codigo | visual sin codigo | codigo + screenshot]
**Script:** [n deterministas, n heuristicos confirmados, n descartados | no ejecutado (motivo)]
**Puntaje:** NN/100 (P0: n, P1: n, P2: n, P3: n)

## Hallazgos criticos (P0)
[lista o "Ninguno"]

## Hallazgos
[uno por causa raiz, ordenados por severidad; formato:]
### [P1][Accesibilidad] Titulo corto del problema
- **Evidencia:** `ruta/archivo.tsx:123` — que se observa
- **Impacto:** quien y que flujo se afecta
- **Recomendacion:** accion concreta con token/primitive real (`iwana-secondary-700`, `PortalEmptyState`, ...)
- **Esfuerzo:** S | M | L

## Quick wins
[P1-P2 con esfuerzo S, en orden de ejecucion]

## Mejoras estrategicas
[cambios L o transversales: primitives nuevas, promociones a @iwana/ui, ADRs]

## Por verificar
[dudas sin evidencia suficiente, si las hay; maximo 3]

## Veredicto
[Aprobada | Aprobada con cambios (listar bloqueantes) | Requiere rediseño] + 1 frase de justificacion
```

Ejemplo de hallazgo bien formado:

### [P1][Accesibilidad] Acento de marca ilegible en KPIs

- **Evidencia:** `apps/portal/src/components/inventory/StockKpis.tsx:48` — `text-iwana-secondary` sobre card blanca (contraste ~1.9:1).
- **Impacto:** Los valores de KPI del dashboard de inventario son ilegibles para baja vision; es el primer dato que lee el operador.
- **Recomendacion:** Cambiar a `text-iwana-secondary-700` (6.2:1, AA), regla documentada en `globals.css`.
- **Esfuerzo:** S

## Validacion antes de cerrar (ambos modos)

- La primera vista muestra que se puede hacer y donde actuar.
- La pantalla se reconoce como iWana sin depender del logo (≥2 elementos de firma de `references/firma-elements.md` presentes **con funcion**: barra lima activa, sombra dual, badge tonal de completitud, degradado de progreso, mono tecnico, gramatica de estados).
- El lima solo comunica avance, exito o accion principal; nunca urgencia ni fondo base.
- Mobile y desktop mantienen jerarquia y acciones operables.
- Contraste y foco pasan revision basica WCAG AA.
- El patron reusable quedo en primitive, utility o instruccion si puede repetirse.
- Estados resueltos: hover, focus, active, disabled, loading, empty, error, success, warning y readonly.
- El script de auditoria corre limpio sobre los archivos tocados (o sus hallazgos estan justificados en la entrega).

## Excepciones

- Flujos legacy pueden adoptar la identidad por fases, pero no deben introducir nuevos patrones contrarios al manual.
- Si identidad y accesibilidad chocan, prevalece accesibilidad y se documenta la adaptacion.
- Si una regla de esta skill contradice tokens reales o un ADR vigente, prevalece el repo y se reporta la divergencia para actualizar esta skill.
- Auth y pantallas de marca admiten decoracion organica y glass que las vistas operativas no admiten (ver recetas #12 y firma #9).
