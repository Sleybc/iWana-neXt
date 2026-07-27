# PROMPT — Paginación numerada · Fase 4: piloto extremo a extremo

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH
**Archivo destino:** `docs/prompts/PROMPT-ADR065-OLA4-PILOTO-v1.0.md`
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) — Ola 4

**Emisor:** AI-EM-ARCH
**Destinatario:** AI-FE-PLATFORM · **gate:** AI-SR-QA
**Fecha:** 2026-07-24
**Precondición:** Fase 3 cerrada.
**Skills:** `nextjs-app-router-patterns`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `e2e-testing-patterns`, `playwright-skill`

## Superficie

**Suscriptores** — `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`, contra `GET /crm/subscribers`.

Elegida a propósito: ya es offset en servidor (`subscribers.service.ts:262-305`), **hoy no tiene estado en URL** y usa un `mergeSubscribers` (`:63`) que es copia literal de `inventory-list-pagination.ts:112-120`. Ejercita el camino completo — URL, reemplazo de página, retirada del acumulador y desduplicación de helper — en una sola pantalla.

**Una sola superficie. No migres ninguna otra en esta fase.** El objetivo es descubrir los defectos del patrón antes de replicarlo treinta veces.

## Alcance

1. Migrar de acumulación (`mergeSubscribers`) a **reemplazo de página**; retirar el helper duplicado.
2. `page`, `pageSize`, `sort`, filtros y búsqueda a la URL vía `useTableQueryState`.
3. `PortalTablePager` + `PortalPageSizeSelect` en el pie; `PortalResultsStrip` deja de pintar conteo.
4. Vocabulario del recurso: `{ singular: 'suscriptor', plural: 'suscriptores' }`.
5. **Orden por columna** en las columnas que `sortableFields` autorice: `PortalDataTableSortableHead`, ciclo de tres estados, `sortBy`/`sortDir` en URL con reset a página 1, y variante mobile en la barra de filtros. Valida la interacción orden × página × filtro, que es la que solo aparece con las dos cosas juntas.
6. Estados completos: primera carga (skeleton), cambio de página y de orden (contenido atenuado, sin desmontar), página única, última parcial, cero resultados, error.
7. Recarga desde servidor tras crear, editar o borrar; retroceso automático si la página queda vacía (CA-PAG v2-33).
8. Página fuera de rango → última válida + `replace` + aviso una sola vez (v2-31).
9. Specs unitarios con **mocks que devuelvan conjuntos disjuntos por página** — el cambio de «click → 40 filas» a «click en página 2 → 20 filas distintas» obliga a rehacerlos, no a ajustarlos. Añade el caso de orden por una columna con valores empatados.
10. E2E Playwright del recorrido completo, incluido orden → página → filtro.

## Restricciones

- Contrato DS y spec UX son normativos.
- Nada de lógica de paginación en la pantalla: todo lo que sea reutilizable vive en el hook o el primitive. Si algo no cabe ahí, **escala antes de duplicarlo** — este piloto define el patrón que replicarán 13 superficies más.
- Cuidado con los *route matchers* de E2E que dependen del query string exacto: añadir `page=`/`pageSize=` rompe `url.includes(...)` y el mock deja de interceptar, con un fallo confuso.

## Entregables

1. Suscriptores migrado extremo a extremo.
2. Specs + E2E.
3. **Evidencia de navegador**: 1280 px y 375 px, claro y oscuro, cubriendo cambio de página, cambio de tamaño (vuelve a página 1), filtro (vuelve a página 1), deep-link `?page=3`, botón Atrás, última página parcial, página única y cero resultados.
4. Nota de lecciones aprendidas: qué del patrón hubo que ajustar. **Es el entregable que más valor tiene para las fases siguientes.**

## Stop/go — gate AI-SR-QA

AI-SR-QA verifica **CA-PAG v2-01…v2-36 y CA-ORD-01…14** sobre esta pantalla y emite GO / GO-CON-DEUDA / NO-GO. El aprobador del gate no es quien produjo el artefacto.

Verificaciones que no se pueden delegar a un test automático:

- El foco permanece en el control pulsado y **nunca cae al `<body>`**, tanto al paginar como al ordenar.
- El tercer paso del ciclo de orden **restituye de verdad** el orden por defecto del recurso, comparado con la primera carga sin `sortBy`.
- Ordenar por una columna con muchos empates no repite ni omite filas entre páginas (CA-ORD-12).
- El anuncio de `aria-live` ocurre **una sola vez**, no en cada tecla del debounce.
- Con dos operadores de alcance distinto, el conteo del pie no revela el total global del tenant (v2-35).
- Contraste AA en el estado deshabilitado, sin depender solo de opacidad (v2-34).

**Si el gate es NO-GO, el patrón se corrige aquí. No se avanza a la Fase 5.**
