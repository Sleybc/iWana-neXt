# ADR-075 — Enmienda C-DS-04 (APROBADA e incorporada)

**Estado:** Aprobado (enmienda incorporada al ADR-075; documento de trazabilidad, no norma paralela)
**Aprobado por:** CTO Humano (2026-09-07)
**Autor:** AI-DS-OWNER · **Revisión técnica:** AI-EM-ARCH

> ✅ **Aprobada por el CTO el 2026-09-07 e incorporada** a
> [`ADR-075-Contrato-Capas-Z-Portal.md`](ADR-075-Contrato-Capas-Z-Portal.md) v1.1 — §1
> (Adenda A), §2 (ampliación), §2bis y §2ter. **La fuente normativa es el ADR**: este
> documento se conserva como trazabilidad de la decisión (propuesta original de
> AI-DS-OWNER del 2026-09-07, revisada por AI-EM-ARCH), no como norma paralela. Cítese el
> ADR, no este archivo; ya **no** lleva marcador `(propuesto)`.
>
> Migración ejecutada por AI-FE-PLATFORM el 2026-09-07: renombrado de tokens **sin cambio
> de valores** en `packages/ui/src/styles/globals.css` y en los seis consumidores de
> «Impacto de migración» más sus specs. Ningún elemento cambió de escalón.

**Origen:** la corrección de los cinco drawers modales de Inventario/Mesa de ayuda
(`docs/informes/INFORME-MOD12-INVENTARIO-CHROME-DRAWER-DESENFOQUE-v3.0.md` §3.2–§3.4)
demostró que la descripción de ADR-075 §1 no se sostiene.

---

## El defecto

La tabla original describe `--z-overlay` como «velo que oscurece el contenido bajo un
panel». Un velo alojado en `--z-overlay` (200) es **estructuralmente incapaz** de cubrir
el `Sidebar`, que ocupa `--z-drawer` (300). La descripción solo es cierta para el velo
del menú lateral móvil, cuyo panel *es* el chrome y por tanto debe quedar por encima de
su propio velo.

Causa de raíz: **la tabla nombra los escalones por el mueble que los ocupa, no por su
relación de apilamiento**, y `--z-overlay` nombra una *parte* de una capa como si fuera
un escalón. La consecuencia, verificada con un barrido exhaustivo del árbol: `--z-overlay`
aloja hoy dos semánticas (un velo y un panel de chrome) y `--z-drawer` otras dos (chrome
persistente y cajón transitorio).

## Qué NO cambia

**Ningún valor numérico.** La escala sigue siendo 0/100/200/300/400/500/600 con separación
de 100. Renumerar es inviable mientras la migración del paso 4 del plan de ADR-075 siga
incompleta: siete emisores literales de cuatro y cinco cifras permanecen por encima de
toda la escala (ver plan de ejecución, M4).

## Qué cambia

1. La tabla de §1 se reemplaza por la **Adenda A**, que describe cada escalón por su
   relación de apilamiento y cita un consumidor real verificado.
2. `--z-overlay` pasa a llamarse **`--z-shell-raised`** y `--z-drawer` pasa a llamarse
   **`--z-shell-panel`**. Los nombres anteriores nombraban una parte y un mueble; los
   nuevos nombran la franja del shell — los dos únicos escalones en que un velo y su panel
   son capas separadas, y existen solo porque el panel es chrome que no puede portalarse.
3. Se **retira `--z-base`** (0): no tiene ni un consumidor en fuente, y `z-index: 0` no
   equivale a `auto`. El apilamiento local dentro de un componente queda declarado fuera
   del alcance de este contrato (§2bis). **`--z-toast`** (600) se conserva marcado
   **reservado**: tampoco tiene consumidor, pero su escalón debe estar tomado antes de que
   exista el componente.
4. Se incorpora **§2bis, regla de decisión de velos**:

   > El velo ocupa un escalón propio **si y solo si** su panel no puede portalarse a
   > `document.body` — es decir, solo cuando el panel es chrome persistente del shell. En
   > cualquier otro caso se emite **una sola capa** `fixed inset-0` portalada al `body`,
   > con el velo como `absolute inset-0` dentro de ella y el panel como hermano posterior.
   > Un velo que necesite cubrir el chrome no se sube de escalón: se sube **la capa
   > entera** a `--z-modal`.
   >
   > El chrome **nunca se degrada de escalón** para dejarse tapar; conserva su token y
   > recibe `inert` + `aria-hidden` por el canal de difusión del drawer. Degradarlo exige
   > un viaje de evento + re-render, y el retardo es visible.

5. **§2 se amplía:** queda fuera de la prohibición de literales el apilamiento *local* — el
   de un elemento que no compite en el contexto de apilamiento raíz, sea porque no es capa de
   viewport (`relative`/`absolute` sin `fixed`) **o porque un ancestro ya creó contexto de
   apilamiento** (§2ter). La prohibición gobierna **capas de viewport**, no ordenación interna.

   > Corrección del 2026-09-07: la versión inicial de este punto clavaba la exención en «sin
   > `fixed`». La clave estaba mal elegida: `apps/web/src/components/layout/TopHeader.tsx:196`
   > es `fixed` y aun así es apilamiento local, porque su ancestro `sticky` crea contexto. Sin
   > esta corrección, el detector D1 del test estructural T1 queda apoyado en una definición
   > que no cubre su propio árbol.

6. Se incorpora **§2ter, regla del contexto de apilamiento**:

   > Un escalón solo existe si el elemento que lo declara compite en el contexto de
   > apilamiento raíz. Un `z-(--z-*)` declarado en un descendiente de un ancestro que ya crea
   > contexto de apilamiento —`position: sticky` (que lo crea **siempre**, con o sin
   > `z-index`), o cualquier `position` con `z-index` distinto de `auto`, o
   > `transform`/`filter`/`backdrop-filter`/`contain`— **no es un escalón: es ordenación
   > local**, y queda fuera de este contrato.
   >
   > De ahí se siguen dos obligaciones:
   >
   > 1. **El escalón se declara en el elemento que crea el contexto**, no en la capa visible
   >    que hay dentro. Si la capa visible necesita un escalón propio, primero tiene que
   >    salir: `createPortal` al `body`.
   > 2. Un ancestro con `transform`, `filter` o `backdrop-filter` es además **bloque
   >    contenedor de descendientes `fixed`**: dentro de él, `fixed inset-0` cubre la caja del
   >    ancestro, no el viewport. Una capa de viewport nunca se emite bajo un ancestro así.
   >
   > Corolario para revisión: **el velo decide cuántos escalones ocupa un constructo (§2bis);
   > el contexto de apilamiento decide si su escalón existe (§2ter).**

## Adenda A — escala corregida

| Token | Valor | Relación de apilamiento | Consumidor real verificado |
| --- | --- | --- | --- |
| ~~`--z-base`~~ | 0 | *Retirado — sin consumidor* | ninguno |
| `--z-sticky` | 100 | Barra del shell en reposo, adherida al scroll, que pinta sobre el contenido que la atraviesa | `apps/portal/src/components/layout/TopHeader.tsx:90`; `apps/portal/src/components/shared/portal-ui.tsx:2201` |
| `--z-shell-raised`<br>*(hoy `--z-overlay`)* | 200 | Superficie del shell que se eleva sobre **otra barra en reposo del mismo shell** sin llegar a ser panel: el velo del menú móvil, y el header mientras despliega su hoja de búsqueda **en el shell que tiene un subnav de módulo en `--z-sticky` posterior en el DOM**. Un shell sin ese competidor deja su header en `--z-sticky`: el escalón describe la vecindad, no el mueble | `apps/portal/src/app/dashboard/layout.tsx:224`; `apps/portal/src/components/layout/TopHeader.tsx:90` (**el header**; el `:143` del contenedor interior es ordenación local, no consumidor del escalón) |
| `--z-shell-panel`<br>*(hoy `--z-drawer`)* | 300 | Chrome del shell que actúa como panel y **debe sobrevivir a su propio velo** — el único caso en que el velo queda por debajo del panel | `apps/portal/src/components/layout/Sidebar.tsx:430`; `apps/web/src/components/layout/Sidebar.tsx:126` |
| `--z-modal` | 400 | Capa portalada a `document.body` que captura el foco; **su velo viaja dentro de ella**, nunca en un escalón propio | `apps/portal/src/components/shared/PortalModalDrawerLayer.tsx:57`; `packages/ui/src/components/OperationalSidePeek.tsx:130` |
| `--z-popover` | 500 | Superficie flotante anclada a un disparador que puede vivir dentro de una capa 400 y debe seguir visible | `packages/ui/src/components/MultiSelect.tsx:177`; `packages/ui/src/components/Calendar.tsx:132` |
| `--z-toast` | 600 | **Reservado.** Sin consumidor ni componente en el monorepo | ninguno |

## Impacto de migración de los renombrados

Seis sitios de fuente más sus specs: `dashboard/layout.tsx:224`, `(protected)/layout.tsx:42`,
`TopHeader.tsx:90` y `:143` del portal, `Sidebar.tsx:430` del portal, `Sidebar.tsx:126` de
web. Los otros dos consumidores de `--z-drawer` (`PortalSidePeek`, `DispatchDrawerPortal`)
**no se renombran**: migran a `--z-modal` por §2bis (ver plan, M1 y M2).

## Decisión requerida

| Quién | Qué decide | Resultado |
| --- | --- | --- |
| AI-EM-ARCH | Revisión técnica de la enmienda y su encaje con ADR-056 y ADR-023 | Revisada — sin objeción |
| CTO | Aprobación o rechazo. Los nombres son la decisión del ADR (§1: «Los nombres son la decisión; los valores numéricos concretos son detalle de implementación»), por eso AI-DS-OWNER propone y no aprueba | **Aprobada el 2026-09-07** |
