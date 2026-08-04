# ADR-075: Contrato de capas de superposición mediante tokens `--z-*`

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-08-04
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano (2026-08-04), con la enmienda del séptimo escalón ya incorporada
**Origen:** [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) §6, escalación 2 — el CTO eligió la vía de ADR el 2026-08-04
**Relacionado:** [ADR-056](ADR-056-Integridad-Base-Normativa-Diseno.md) (Aprobado) — precedente de tokenizar una norma huérfana; [ADR-023](ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) (Aprobado) — sistema CSS-first, sin `tailwind.config`

---

## Contexto

La auditoría del `/dashboard` del portal encontró `z-35` en el velo del menú lateral móvil, un valor fuera de la escala de Tailwind. Al buscar la norma que ese valor incumplía, apareció que **la norma no existe**.

Dos hechos verificados:

1. **`packages/ui/src/styles/globals.css` no declara ningún token `--z-*`.** El archivo se recorrió entero.
2. El portal usa hoy **once valores de z distintos, seis de ellos fuera de la escala de Tailwind**: `z-35`, `z-[120]`, `z-[1200]`, `z-[1201]`, `z-10000`, `z-10001`.

La disciplina de identidad `iwana-identity-ui-review` cita una escala «0/10/20/40/100/1000» y marca como violación la «guerra de z-index tipo `z-9999+`». Pero esa escala **no está respaldada por ningún ADR aprobado ni materializada en tokens**. Es exactamente el patrón que ADR-056 §5 persigue: una regla que se cita como norma sin artefacto que la sostenga.

### Causa raíz

El sistema tokeniza el color de superficie de tarjeta, la superficie suave, las cuatro superficies oscuras y los dos bordes oscuros. **No tokeniza el orden de apilamiento.** Cada componente que necesita superponerse elige un número por comparación local con sus vecinos inmediatos, y el resultado es correcto localmente e incoherente globalmente.

El síntoma concreto en el alcance auditado: el encabezado usa `z-30`, el velo `z-35`, el menú lateral `z-40`. La secuencia es coherente — y `z-35` existe únicamente porque hacía falta un valor entre dos números que ya estaban tomados. Eso es un contrato negociado en el código, no en el sistema.

Con dos aplicaciones (`apps/web` y `apps/portal`), superposiciones de terceros (Radix: diálogo, menú desplegable, popover, calendario) y valores de cuatro y cinco cifras ya en uso, el siguiente componente con superposición negociará de nuevo su propio número.

---

## Decisión

Se declaran normativos **tokens de capa con nombre semántico** en `packages/ui/src/styles/globals.css`, y se prohíbe el valor numérico literal en código de aplicación.

### 1. Escala semántica

| Token | Propósito | Ejemplos en el repo |
| --- | --- | --- |
| `--z-base` | Contenido en flujo con apilamiento propio | Elementos posicionados dentro de una tarjeta |
| `--z-sticky` | Cabeceras y barras adheridas al desplazamiento | `TopHeader` del portal y de la consola |
| `--z-overlay` | Velo que oscurece el contenido bajo un panel | Velo del menú lateral móvil (hoy `z-35`) |
| `--z-drawer` | Paneles laterales y cajones deslizantes | `Sidebar` móvil (hoy `z-40`) |
| `--z-modal` | Diálogos que capturan el foco | Diálogos de Radix |
| `--z-popover` | Superficies flotantes ancladas a un control, que deben pintarse **por encima** del diálogo o cajón que las contiene | Listas de selección, menús desplegables, popovers |
| `--z-toast` | Notificaciones efímeras, por encima de todo | Avisos del sistema |

> **Enmienda del 2026-08-04, previa a la aprobación** — `[CONSULTA]` C-DS-01 de AI-DS-OWNER, aceptada por AI-EM-ARCH. La versión inicial declaraba seis capas. AI-DS-OWNER demostró al fijar los valores que **falta una**: tres primitives del sistema ya se pintan hoy por encima de un diálogo, con la razón escrita en el propio código (una lista de selección a 11000, un popover a 10002, un menú desplegable a 1200). Sin el séptimo escalón, esos componentes tendrían que alojarse en `--z-modal`, y su apilamiento pasaría a depender del orden de inserción en el árbol del documento — un contrato implícito que **ya está vivo y ya falla**: hay cajones y menús compartiendo el mismo valor. La alternativa (prohibir listas de selección y menús dentro de diálogos y cajones) rompería formularios en producción.
>
> Esto es §2 funcionando como se diseñó: un componente que no encajaba **no inventó un número**, propuso una capa. Se incorpora antes de la aprobación para que el CTO decida sobre el contrato completo y no sobre uno que ya sabemos incompleto.

**Los nombres son la decisión; los valores numéricos concretos son detalle de implementación** y los fija AI-DS-OWNER en el contrato de tokens, con separación suficiente entre escalones para absorber terceros. Este ADR no los duplica como autoridad paralela — la fuente de verdad de los valores son los tokens, igual que estableció ADR-056 §2 para la escala oscura.

### 2. Regla

> En código de aplicación (`apps/*/src`, `packages/ui/src` fuera de la definición de tokens) **no se escriben valores de z literales**: ni utilidades numéricas de Tailwind, ni valores arbitrarios. Se usa el token de la capa semántica que corresponda.

Un componente que no encaje en ninguna de las capas **no inventa un número**: propone una capa nueva a AI-DS-OWNER, que la incorpora al contrato o le asigna la existente. La enmienda de §1 es el primer caso de esta regla en funcionamiento.

### 3. Alcance de la remediación

Los once valores en uso se migran **por bloque, no uno a uno** — es la lección del patrón P6 de ADR-056 §Segunda pasada: parchear una línea suelta de un defecto sistémico genera duplicados. La migración entra en la fase de saneamiento del portal ya autorizada, y `apps/web` se audita en el mismo acto.

Los valores de cuatro y cinco cifras (`z-10000`, `z-10001`, `z-[1200]`, `z-[1201]`) se revisan uno por uno antes de migrarlos: alguno puede existir para superponerse a una biblioteca de terceros, y en ese caso la razón se documenta en el contrato de tokens en lugar de perderse.

### 4. Verificación

Regla estructural que falle ante valores de z literales en código de aplicación, con el molde ya probado de `apps/portal/src/components/shared/aria-busy-contrast.structure.spec.ts`. Sin barrera ejecutable, la norma se erosiona igual que se erosionó la escala no escrita que este ADR sustituye.

> **Enmienda del 2026-08-04** — `[CONSULTA]` C-DS-03 de AI-DS-OWNER, aceptada. La regla debe cubrir **las dos formas de emisión**: la utilidad de Tailwind (`z-40`, `z-[1200]`) **y** el objeto de estilo en JavaScript (`zIndex: 11000`). Los valores del repo no son once sino **doce**, y tres de ellos se emiten por la segunda vía. Una regla que solo busque clases de Tailwind los dejaría pasar intactos — y son precisamente los de mayor magnitud, los que motivan el séptimo escalón.

---

## Consecuencias

**Positivas**

- El orden de apilamiento pasa de negociarse en el código a declararse en el sistema.
- Cierra un hueco estructural del contrato de tokens, no un defecto de una pantalla.
- La disciplina de identidad recupera un ancla real para una regla que hoy cita sin respaldo — se corrige un caso vivo del defecto que ADR-056 formalizó.
- Los nombres semánticos hacen evidente el error de diseño: si un componente «necesita» estar por encima de un aviso efímero, el problema es el componente.

**Negativas / costo**

- Migración de once sitios en dos aplicaciones. Trabajo mecánico, riesgo de regresión visual bajo pero **no nulo**: un orden mal migrado se manifiesta como un panel tapado.
- Añade una barrera más que puede rechazar código legítimo si aparece un caso de superposición no previsto. Mitigado por la vía de proponer capa nueva.

**Riesgos**

- **Un escalón mal dimensionado deja sin hueco a un tercero.** Mitigación: la separación entre escalones la fija DS-OWNER con los valores reales de Radix a la vista, no a ojo.
- **La migración se hace parcial y conviven dos sistemas.** Mitigación: migración por bloque + regla estructural activada en el mismo acto. Una remediación parcial es tan defectuosa como el defecto original y más peligrosa, porque aparenta estar cerrada (ADR-056 §Lección de gobernanza).

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin impacto — decisión de sistema de diseño |
| **Seguridad** | Sin impacto directo. Nota menor: un velo con orden incorrecto puede dejar interactivo contenido que debía quedar bloqueado; el contrato reduce esa clase de error |
| **Escala** | Sin impacto |
| **Regulación** | Sin impacto. WCAG 2.2 AA sigue aplicando por otras vías; el criterio 2.4.11 (foco no oscurecido) se beneficia de un orden coherente |

## Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| **A — Fijar la escala en la disciplina de identidad, sin tokens** | Más barato, y deja el valor en el código en vez de en el sistema. Reproduce el defecto de origen: una regla citada como norma sin artefacto que la respalde. Fue la opción B de la escalación; el CTO eligió la vía de ADR |
| **B — Aplazar hasta que un incidente lo justifique** | `z-35` no rompe nada hoy, cierto. Pero el costo de la decisión crece con cada componente nuevo con superposición, y ya hay dos aplicaciones y superposiciones de terceros en juego |
| **C — Tokens numéricos sin nombre semántico** (`--z-10`, `--z-20`) | Tokeniza el valor sin resolver el problema: seguiría siendo una negociación de números, solo que con prefijo |

## Plan de ejecución

| # | Acción | Responsable | Estado |
| --- | --- | --- | --- |
| 1 | Aprobación del ADR | CTO | **Pendiente** |
| 2 | Valores concretos de los seis escalones en el contrato de tokens | AI-DS-OWNER | Pendiente de 1 |
| 3 | Declaración de los tokens en `globals.css` | AI-FE-PLATFORM | Pendiente de 2 |
| 4 | Migración por bloque de los once sitios, con revisión individual de los de cuatro y cinco cifras | AI-FE-PLATFORM | Pendiente de 3 |
| 5 | Regla estructural anti-z-literal | AI-FE-PLATFORM | Pendiente de 3 |
| 6 | Auditoría equivalente en `apps/web` | AI-DS-OWNER | Pendiente de 2 |

**Nota de estado:** mientras este ADR esté en **Propuesto**, toda cita suya lleva el marcador `(propuesto)` y **no confiere autoridad normativa** (protocolo §7.4, convención de cita histórica de ADR-056 §5). El gate `pnpm audit:adr-citations` lo bloquea si se cita sin marcador.
