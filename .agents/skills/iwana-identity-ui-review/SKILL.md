---
name: iwana-identity-ui-review
description: Disciplina de diseño y auditoria de UI para iWana neXt. Usar siempre que se cree, revise, refine o audite cualquier pantalla, modulo, dashboard, formulario, tabla, modal, drawer, settings, estado vacio o patron visual del portal o del backoffice, y tambien cuando una UI se sienta generica, ruidosa, pesada o fuera de identidad aunque nadie mencione la palabra iWana. Produce hallazgos con severidad P0-P3, evidencia verificable contra tokens y primitives reales del repo, y un informe con formato estandar.
metadata:
  category: discipline
  triggers: identidad, UI, interfaz, pantalla, modulo, seccion, dashboard, settings, diseño, visual, iWana, brand, tokens, auditoria, review, accesibilidad, responsive
---

# iWana Identity UI Review

Disciplina para traducir la identidad corporativa iWana a interfaces operativas del producto y para auditarlas con criterio verificable.

## Regla de hierro

**Toda interfaz nueva o refinada debe sentirse iWana: fresca, minimalista, equilibrada, profesional, accesible y clara para trabajo operativo real.**

La identidad no es decoracion. Si un efecto, borde, card, gradiente o animacion no mejora claridad, escaneo, confianza o accion, no pertenece a la interfaz. Esta regla existe porque el producto es una herramienta B2B multi-tenant de uso diario: cada elemento decorativo que compite con la tarea del usuario tiene costo operativo real.

## Cuando usarla

- Antes de crear o rediseñar una pantalla, seccion o modulo.
- Al mejorar dashboards, settings, tablas, formularios, modales, drawers o estados vacios.
- Cuando una UI se siente generica, pesada, plana, ruidosa o poco alineada a iWana.
- Cuando se vaya a introducir un nuevo patron visual o una nueva primitive.
- Cuando se pida una auditoria o review de calidad de una UI existente.

## Cuando NO usarla (delegar)

Delegar evita hallazgos redundantes entre skills y mantiene cada informe enfocado:

| Necesidad | Skill responsable | Esta skill aporta |
| --- | --- | --- |
| Auditoria WCAG profunda con evidencia formal | `wcag-audit-patterns` | Solo el barrido AA basico del checklist |
| Propuesta de direccion visual nueva (2-3 opciones) | `senior-ui-systems-designer` | El marco de identidad que la propuesta debe respetar |
| Copy visible, labels, vocabulario de producto | `system-vocabulary-review` | Solo detectar el sintoma (enum crudo, tono incorrecto) y derivar |
| Consolidacion de componentes compartidos | `core-components` | Detectar el patron repetible y proponer la promocion |
| Heuristicas UX genericas ampliadas | `ui-ux-pro-max` (subordinada) | El filtro: toda sugerencia generica se adapta o descarta segun iWana |

Si el problema es solo backend, contratos API o arquitectura tecnica sin superficie visual, esta skill no aplica.

## Fuentes de verdad y precedencia

1. `packages/ui/src/styles/globals.css` — tokens reales Tailwind v4 CSS-first. **Es la fuente primaria para afirmar que un token, utility o sombra existe o no existe.**
2. `apps/portal/src/components/shared/portal-ui.tsx` — primitives del portal (PortalPanel, PortalAlert, PortalEmptyState, PortalSkeletonBlock, `interactiveFocusClassName`, etc.).
3. `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — **direccion visual vigente "Firma iWana"**: elementos de firma (barra lima de navegacion, sombra dual soft/active, degradado azul→lima solo para progreso, par tonal lima, mono tecnico, escala tipografica dual, gramatica de 3 estados), reglas semanticas del lima y plan por fases. Los componentes/tokens de fases aun no ejecutadas se citan como direccion aprobada, no como existentes.
4. `docs/identity/Manual_Implementacion_Identidad_Iwana.md` — personalidad, principios y decisiones de uso de color.
5. `.github/instructions/system-vocabulary.instructions.md` — tono y copy.

Si este documento y los tokens reales divergen, mandan los tokens reales; documenta la divergencia en lugar de inventar un valor intermedio. Nunca recomiendes crear `tailwind.config.js` (el sistema es CSS-first por ADR) ni tokens que no existan en `globals.css` sin marcarlos explicitamente como propuesta de token nuevo.

## Modos de operacion

Elige el modo segun la tarea y declaralo al inicio de la respuesta. Mezclarlos produce informes inconsistentes.

**Modo diseño** — la tarea es crear o refinar una UI. Aplica el checklist y las reglas como guia de construccion; no generes informe de auditoria. La salida es la UI (o especificacion) mas una nota corta de decisiones de identidad tomadas.

**Modo review** — la tarea es evaluar una UI existente (codigo, screenshot o ambos). Sigue la metodologia completa y entrega el informe con el formato estandar de la seccion "Formato de salida".

## Metodologia de review

El orden importa: recolectar evidencia antes de opinar es lo que reduce falsos positivos.

1. **Recolectar contexto real.** Lee el codigo de la pantalla, los tokens vigentes en `globals.css` y las primitives disponibles. Si solo hay screenshot, marca el informe como "revision visual sin codigo" y limita los hallazgos tecnicos a lo observable.
2. **Clasificar la pantalla** (dashboard, listado, formulario, configuracion, detalle, modal/drawer, estado) y **definir la tarea principal del usuario**. Todo hallazgo posterior se pondera contra esa tarea: lo que no la afecta baja de severidad.
3. **Evaluar por dimensiones.** Recorre las 7 dimensiones de la tabla siguiente. Para el detalle de criterios por dimension, lee `references/evaluation-criteria.md`.
4. **Verificar cada hallazgo** contra las reglas anti-falso-positivo antes de incluirlo.
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

Estas reglas son mecanicamente comprobables en el codigo. Un hallazgo basado en ellas es de alta confianza; citalas por nombre en la evidencia.

| Regla | Como detectarla | Severidad base |
| --- | --- | --- |
| Texto `text-iwana-secondary` (sin sufijo 700+) sobre fondo claro — no pasa AA | grep `text-iwana-secondary[^-]` en superficie clara; usar `iwana-secondary-700` | P1 |
| `dark:bg-gray-{700,800,900,950}` en codigo nuevo — prohibido por ADR-026; usar `dark-surface-*` / `dark-border-*` | grep `dark:bg-gray-(700|800|900|950)` | P1 |
| Interactivo custom sin foco visible — usar `interactiveFocusClassName` o `focus-visible:ring` | elementos clickeables sin `focus-visible:` | P1 |
| Enum crudo o `UPPER_SNAKE_CASE` visible al usuario | render directo de valores de enum | P1 (derivar a `system-vocabulary-review`) |
| Acciones frecuentes ocultas o comprimidas en mobile | breakpoints que esconden acciones primarias | P1 |
| Estados loading / empty / error ausentes en vistas con datos remotos | falta `PortalSkeletonBlock`, `PortalEmptyState`, `PortalAlert` o equivalente | P1-P2 segun flujo |
| `iwana-secondary-50` como fondo base de paneles, toolbars o empty states — reservado a acentos de interaccion; el fondo suave es `iwana-surface-soft` | grep `bg-iwana-secondary-50` en contenedores | P2 |
| Valores arbitrarios repetidos (`tracking-[...]`, hex, sombras locales) sin promocion a utility o primitive | grep de valores arbitrarios duplicados | P2 |
| Cards dentro de cards sin funcion (superficies anidadas) | `rounded-2xl` + borde/sombra anidados | P2 |
| Glass, gradiente o blur masivo en tablas o formularios — glassmorphism es selectivo (overlays, drawers, controles flotantes) | `.iwana-glass` / `backdrop-blur` fuera de overlays | P2 |
| Lima usado como señal de urgencia, prioridad alta o alerta — el lima significa avance/exito/accion (spec Firma iWana §3); urgencia usa escalas `warning`/`error` | tinte `iwana-secondary*` en badges/textos de prioridad alta, alertas o riesgos | P1 |
| Degradado azul→lima fuera de indicadores de progreso — es firma de avance, no decoracion | `from-iwana-primary to-iwana-secondary` (o `.iwana-gradient`) en fondos, headers o cards sin semantica de progreso | P2 |
| Variante local nueva de un patron firma ya unificado (KPI card, tabla, page header, sidebar) en vez del primitive/contrato vigente | componente ad hoc que duplica un patron cubierto por `portal-ui.tsx` / `@iwana/ui` | P2 |
| Spinner bloqueante en vista principal en vez de skeleton con forma de contenido | spinner/`Loader` como estado de carga primario de una pagina o tabla | P3 |
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
2. **Verifica contra las fuentes.** Antes de afirmar "no usa el token X" o "deberia usar la utility Y", confirma que X/Y existen en `globals.css` o `portal-ui.tsx`. Recomendar tokens inexistentes es el falso positivo mas dañino de esta skill.
3. **Una causa raiz, un hallazgo.** Si diez celdas repiten el mismo hex, es un hallazgo con diez ocurrencias, no diez hallazgos.
4. **No reportes lo que las primitives ya resuelven.** Si la pantalla usa `PortalAlert`, su semantica ARIA ya esta cubierta; no la audites de nuevo.
5. **Preferencia no es hallazgo.** Si no puedes anclar la observacion a una regla de esta skill, del manual o de un criterio WCAG, es una opinion: omitela o marcala como "sugerencia opcional" fuera del conteo de severidad.
6. **Legacy en fases.** Flujos legacy que adoptan identidad por fases no se penalizan por lo pendiente; solo se reporta si introducen patrones **nuevos** contrarios al manual.
7. **Presupuesto de atencion.** Reporta todos los P0/P1. De P2/P3 incluye solo los de mejor relacion impacto/esfuerzo (tipicamente ≤ 8); el resto se resume en una linea agregada.

## Formato de salida (modo review)

Usa siempre esta estructura exacta. Español, sentence case, sin exponer enums crudos.

```markdown
# Review UI — [pantalla] ([modulo])

## Resumen ejecutivo
[2-4 frases: tipo de pantalla, tarea principal, estado general, riesgo dominante]
**Modo:** [codigo | visual sin codigo | codigo + screenshot]
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
- La pantalla se reconoce como iWana sin depender del logo (≥2 elementos de firma de la spec Firma iWana presentes **con funcion**: barra lima activa, sombra dual, badge tonal de completitud, degradado de progreso, mono tecnico, gramatica de estados).
- El lima solo comunica avance, exito o accion principal; nunca urgencia ni fondo base.
- Mobile y desktop mantienen jerarquia y acciones operables.
- Contraste y foco pasan revision basica WCAG AA.
- El patron reusable quedo en primitive, utility o instruccion si puede repetirse.
- Estados resueltos: hover, focus, active, disabled, loading, empty, error, success, warning y readonly.

## Excepciones

- Flujos legacy pueden adoptar la identidad por fases, pero no deben introducir nuevos patrones contrarios al manual.
- Si identidad y accesibilidad chocan, prevalece accesibilidad y se documenta la adaptacion.
- Si una regla de esta skill contradice tokens reales o un ADR vigente, prevalece el repo y se reporta la divergencia para actualizar esta skill.
