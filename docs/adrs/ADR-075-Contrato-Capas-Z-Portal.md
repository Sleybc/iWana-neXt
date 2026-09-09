# ADR-075: Contrato de capas de superposición mediante tokens `--z-*`

**Versión:** 1.1
**Estado:** Aprobado
**Fecha:** 2026-08-04
**Última enmienda:** 2026-09-07 — C-DS-04, incorporada a §1 (Adenda A), §2, §2bis y §2ter
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano (2026-08-04), con la enmienda del séptimo escalón ya incorporada; **enmienda C-DS-04 aprobada por el CTO el 2026-09-07** e incorporada a este documento (propuesta trazable en [`ADR-075-ENMIENDA-C-DS-04-PROPUESTA.md`](ADR-075-ENMIENDA-C-DS-04-PROPUESTA.md))
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

Cada escalón se nombra por su **relación de apilamiento**, no por el mueble que lo ocupa (Adenda A, enmienda C-DS-04 del 2026-09-07):

| Token | Valor | Relación de apilamiento | Consumidor real verificado |
| --- | --- | --- | --- |
| `--z-sticky` | 100 | Barra del shell en reposo, adherida al scroll, que pinta sobre el contenido que la atraviesa | `apps/portal/src/components/layout/TopHeader.tsx`; `apps/portal/src/components/shared/portal-ui.tsx` (`PortalModuleSubnav`) |
| `--z-shell-raised` | 200 | Superficie del shell que se eleva sobre **otra barra en reposo del mismo shell** sin llegar a ser panel: el velo del menú móvil, y el header mientras despliega su hoja de búsqueda **en el shell que tiene un subnav de módulo en `--z-sticky` posterior en el DOM**. Un shell sin ese competidor deja su header en `--z-sticky`: el escalón describe la vecindad, no el mueble | `apps/portal/src/app/dashboard/layout.tsx`; `apps/web/src/app/(protected)/layout.tsx`; `apps/portal/src/components/layout/TopHeader.tsx` (**el header**; el contenedor interior de la hoja es ordenación local, no consumidor del escalón) |
| `--z-shell-panel` | 300 | Chrome del shell que actúa como panel y **debe sobrevivir a su propio velo** — el único caso en que el velo queda por debajo del panel | `apps/portal/src/components/layout/Sidebar.tsx`; `apps/web/src/components/layout/Sidebar.tsx` |
| `--z-modal` | 400 | Capa portalada a `document.body` que captura el foco; **su velo viaja dentro de ella**, nunca en un escalón propio | `apps/portal/src/components/shared/PortalModalDrawerLayer.tsx`; `packages/ui/src/components/OperationalSidePeek.tsx` |
| `--z-popover` | 500 | Superficie flotante anclada a un disparador que puede vivir dentro de una capa 400 y debe seguir visible | `packages/ui/src/components/MultiSelect.tsx`; `packages/ui/src/components/Calendar.tsx` |
| `--z-toast` | 600 | **Reservado.** Sin consumidor ni componente en el monorepo | ninguno |

> **Enmienda del 2026-09-07, posterior a la aprobación** — `[CONSULTA]` C-DS-04 de AI-DS-OWNER, revisada por AI-EM-ARCH y **aprobada por el CTO el 2026-09-07**. La corrección de los cinco cajones modales de Inventario/Mesa de ayuda demostró que la tabla original no se sostenía: describía `--z-overlay` como «velo que oscurece el contenido bajo un panel», y un velo alojado en 200 es **estructuralmente incapaz** de cubrir el `Sidebar`, que ocupa 300. Causa raíz: **la tabla nombraba los escalones por el mueble que los ocupa, no por su relación de apilamiento**, y `--z-overlay` nombraba una *parte* de una capa como si fuera un escalón — de ahí que 200 alojara dos semánticas (un velo y un panel de chrome) y 300 otras dos (chrome persistente y cajón transitorio).
>
> **Ningún valor numérico cambia.** La escala sigue siendo 100/200/300/400/500/600 con separación de 100; el renombrado no mueve ni un elemento de escalón. Los cambios son: (a) la tabla de §1 se reemplaza por la Adenda A de arriba; (b) `--z-overlay` pasa a llamarse **`--z-shell-raised`** y `--z-drawer` a **`--z-shell-panel`** — los nombres anteriores nombraban una parte y un mueble; los nuevos nombran la franja del shell, los dos únicos escalones en que un velo y su panel son capas separadas, y existen solo porque el panel es chrome que no puede portalarse; (c) se **retira `--z-base`** (0), sin un solo consumidor en fuente, y `z-index: 0` no equivale a `auto`; (d) `--z-toast` se conserva marcado **reservado** — tampoco tiene consumidor, pero su escalón debe estar tomado antes de que exista el componente; (e) se incorporan §2bis y §2ter, y se amplía §2.
>
> Esto es §2 funcionando otra vez como se diseñó, ahora en la otra dirección: el defecto no fue un componente sin capa donde alojarse, sino una capa cuyo nombre describía un mueble y no una relación. Un contrato que nombra muebles se erosiona en cuanto entra el segundo mueble.

> **Enmienda del 2026-08-04, previa a la aprobación** — `[CONSULTA]` C-DS-01 de AI-DS-OWNER, aceptada por AI-EM-ARCH. La versión inicial declaraba seis capas. AI-DS-OWNER demostró al fijar los valores que **falta una**: tres primitives del sistema ya se pintan hoy por encima de un diálogo, con la razón escrita en el propio código (una lista de selección a 11000, un popover a 10002, un menú desplegable a 1200). Sin el séptimo escalón, esos componentes tendrían que alojarse en `--z-modal`, y su apilamiento pasaría a depender del orden de inserción en el árbol del documento — un contrato implícito que **ya está vivo y ya falla**: hay cajones y menús compartiendo el mismo valor. La alternativa (prohibir listas de selección y menús dentro de diálogos y cajones) rompería formularios en producción.
>
> Esto es §2 funcionando como se diseñó: un componente que no encajaba **no inventó un número**, propuso una capa. Se incorpora antes de la aprobación para que el CTO decida sobre el contrato completo y no sobre uno que ya sabemos incompleto.

**Los nombres son la decisión; los valores numéricos concretos son detalle de implementación** y los fija AI-DS-OWNER en el contrato de tokens, con separación suficiente entre escalones para absorber terceros. Este ADR no los duplica como autoridad paralela — la fuente de verdad de los valores son los tokens, igual que estableció ADR-056 §2 para la escala oscura.

### 2. Regla

> En código de aplicación (`apps/*/src`, `packages/ui/src` fuera de la definición de tokens) **no se escriben valores de z literales**: ni utilidades numéricas de Tailwind, ni valores arbitrarios. Se usa el token de la capa semántica que corresponda.

Un componente que no encaje en ninguna de las capas **no inventa un número**: propone una capa nueva a AI-DS-OWNER, que la incorpora al contrato o le asigna la existente. La enmienda de §1 es el primer caso de esta regla en funcionamiento.

> **Ampliación del 2026-09-07 (enmienda C-DS-04, punto 5)** — queda fuera de la prohibición de literales el apilamiento **local**: el de un elemento que **no compite en el contexto de apilamiento raíz**, sea porque no es capa de viewport (`relative`/`absolute` sin `fixed`) **o porque un ancestro ya creó contexto de apilamiento** (§2ter). La prohibición gobierna **capas de viewport**, no ordenación interna.
>
> La clave de la exención es el contexto de apilamiento, no la ausencia de `fixed`: `apps/web/src/components/layout/TopHeader.tsx` emite un `fixed` que aun así es apilamiento local, porque su ancestro `sticky` crea contexto. Clavar la exención en «sin `fixed`» —como hacía la redacción inicial de este punto— habría dejado el detector D1 de la regla estructural apoyado en una definición que no cubre su propio árbol.

### 2bis. Regla de decisión de velos

> El velo ocupa un escalón propio **si y solo si** su panel no puede portalarse a `document.body` — es decir, solo cuando el panel es chrome persistente del shell. En cualquier otro caso se emite **una sola capa** `fixed inset-0` portalada al `body`, con el velo como `absolute inset-0` dentro de ella y el panel como hermano posterior. Un velo que necesite cubrir el chrome no se sube de escalón: se sube **la capa entera** a `--z-modal`.
>
> El chrome **nunca se degrada de escalón** para dejarse tapar; conserva su token y recibe `inert` + `aria-hidden` por el canal de difusión del cajón. Degradarlo exige un viaje de evento + re-render, y el retardo es visible.

### 2ter. Regla del contexto de apilamiento

> Un escalón solo existe si el elemento que lo declara compite en el contexto de apilamiento raíz. Un `z-(--z-*)` declarado en un descendiente de un ancestro que ya crea contexto de apilamiento —`position: sticky` (que lo crea **siempre**, con o sin `z-index`), o cualquier `position` con `z-index` distinto de `auto`, o `transform`/`filter`/`backdrop-filter`/`contain`— **no es un escalón: es ordenación local**, y queda fuera de este contrato.
>
> De ahí se siguen dos obligaciones:
>
> 1. **El escalón se declara en el elemento que crea el contexto**, no en la capa visible que hay dentro. Si la capa visible necesita un escalón propio, primero tiene que salir: `createPortal` al `body`.
> 2. Un ancestro con `transform`, `filter` o `backdrop-filter` es además **bloque contenedor de descendientes `fixed`**: dentro de él, `fixed inset-0` cubre la caja del ancestro, no el viewport. Una capa de viewport nunca se emite bajo un ancestro así.
>
> Corolario para revisión: **el velo decide cuántos escalones ocupa un constructo (§2bis); el contexto de apilamiento decide si su escalón existe (§2ter).**

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
| 1 | Aprobación del ADR | CTO | **Hecho** (2026-08-04) |
| 2 | Valores concretos de los escalones en el contrato de tokens | AI-DS-OWNER | **Hecho** |
| 3 | Declaración de los tokens en `globals.css` | AI-FE-PLATFORM | **Hecho** — `packages/ui/src/styles/globals.css` |
| 4 | Migración por bloque de los sitios literales, con revisión individual de los de cuatro y cinco cifras | AI-FE-PLATFORM | **Hecho** (2026-09-07) — cero z literales en `apps/portal/src`, `apps/web/src` y `packages/ui/src`; los de cuatro y cinco cifras se revisaron uno a uno y su destino quedó registrado en el plan `docs/plans/2026-09-07-adr075-cierre-contrato-capas.md` |
| 5 | Regla estructural anti-z-literal | AI-FE-PLATFORM | **Hecho** — `apps/portal/src/components/shared/z-layer-contract.structure.spec.ts`: tres detectores (C-DS-03) + canario anti-vacío |
| 6 | Auditoría equivalente en `apps/web` | AI-DS-OWNER | **Hecho** (2026-09-07) — `apps/web` auditada; sus dos consumidores (`Sidebar.tsx`, `(protected)/layout.tsx`) figuran en la Adenda A de §1, y su `TopHeader` quedó documentado como caso vivo de §2ter |
| 7 | Incorporación de la enmienda C-DS-04 (Adenda A, renombrados, §2 ampliado, §2bis, §2ter) y migración de sus seis sitios | AI-FE-PLATFORM | **Hecho** (2026-09-07) — renombrado sin cambio de valores: ningún elemento cambia de escalón |

**Nota de estado:** mientras este ADR esté en **Propuesto**, toda cita suya lleva el marcador `(propuesto)` y **no confiere autoridad normativa** (protocolo §7.4, convención de cita histórica de ADR-056 §5). El gate `pnpm audit:adr-citations` lo bloquea si se cita sin marcador.
