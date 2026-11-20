# Informe de cierre — MOD05 Suscriptores · Soporte en vista dividida

**Versión:** 1.0
**Fecha:** 2026-11-20
**Spec:** [2026-11-20-mod05-soporte-vista-dividida-ux](../specs/2026-11-20-mod05-soporte-vista-dividida-ux.md) v1.0 (G0 2026-11-20)
**Plan:** [2026-11-20-mod05-soporte-vista-dividida](../plans/2026-11-20-mod05-soporte-vista-dividida.md) · **Launcher:** [PROMPT-MOD05-SOPORTE-VISTA-DIVIDIDA-LAUNCH-v1.0](../prompts/PROMPT-MOD05-SOPORTE-VISTA-DIVIDIDA-LAUNCH-v1.0.md)
**Estado:** G6 de paso 1 y paso 2 ✅ en local, sin commit. G6.5 pendiente de push autorizado y CI de `main` en verde.

## 1. Resultado

Las seis olas están cerradas y CA-1 a CA-12 se cumplen. El paso 1 lo vio el usuario en el punto de control de la ola 3, y aprobó seguir con el paso 2.

| Paso | Qué quedó |
|---|---|
| 1 · Ficha | Vista dividida desde 1280 px, con la lista en una columna de 400 px y el ticket al lado. El ticket abierto va en la URL (`ticket=`). Al entrar se abre el ticket abierto más reciente (D3: «abierto» = cola «Abiertos», que incluye «En progreso»). Cada fila lleva una línea de relato. La lista y el ticket tienen desplazamiento propio. Si la descripción está vacía y hay comentarios, el aviso de descripción vacía y su título no se muestran (F0). Por debajo de 1280 px sigue el panel de siempre |
| 2 · API | `commentCount` y `firstCommentExcerpt` (200 caracteres como máximo, solo con la descripción vacía) en `GET /assurance/tickets`. Se calculan en la misma consulta SQL de la página. La regla de comentarios internos es única: `comment-visibility.ts` (`canSeeInternal`) la aplica al detalle, a los adjuntos y al listado |
| 2 · Portal | En la ficha, la fila muestra el relato con el extracto y la cantidad de comentarios. En Mesa de ayuda, el panel tiene «Anterior · N de M · Siguiente» sobre la lista filtrada y la tabla muestra una línea de relato; sigue sin vista dividida (D2) |

**Autorización registrada:** el 2026-11-20 el usuario autorizó cambiar `lg:` por `@3xl:` en cinco líneas de `AssuranceTicketDetail.tsx` y declarar el contenedor, siguiendo el dictamen D1. Es el único cambio dentro del detalle, aparte de F0.

## 2. Evidencia (jest directo, sin caché)

| Alcance | Línea base W0 | Cierre |
|---|---|---|
| Portal: `crm/subscribers` y `assurance` | 75 suites / 1165 tests (76 / 1175 con el inventario) | 77 / 1200 |
| Portal completo | — | 452 / 5098 tests que pasan y 1 omitido |
| API assurance, unitarias | — | 33 / 347 |
| API assurance, integración (`jest.integration.config.js`, `DB_NAME=test`) | — | 8 / 92 |
| Contratos de shared | — | 32 / 339 |
| E2E (pestaña Soporte, Mesa de ayuda, adjuntos; `--workers=1`) | — | 12 / 12 |

- Las E2E corrieron contra el `next dev` del puerto 3002 del usuario, con un config temporal que reutiliza ese servidor. Falta que CI las confirme.
- `audit-ui.mjs` no da hallazgos nuevos.
- Revisiones de la ola 3:
  - `test-change-reviewer`: los cuatro specs ajustados están justificados por regla nueva.
- Revisiones de la API:
  - `boundary-reviewer`: GO.
  - `contract-drift-reviewer`: GO.
  - `sec-eng`: GO.
- Revisión del frontend del paso 2:
  - `sec-eng`: GO; el relato se pinta solo como texto JSX.

## 3. Mediciones en navegador (tenant de pruebas, suscriptor sintético)

| Medida | Antes (H4) | Después |
|---|---|---|
| 1440×900: lista y ticket a la vez | No (panel encima) | Sí; el siguiente ticket está a un clic |
| 1440×900: posición de «Visitas» | px 1200 | px 1106 |
| 1280: columna del ticket | — | 520 px; el lateral se apila |
| 1024 y 1279: panel | Lateral a la derecha | Sin cambio |
| 375: desplazamiento lateral | No | No |
| axe, claro y oscuro (E2E a 1440) | — | Sin violaciones graves |

Las capturas están en la carpeta de notas de la sesión, en `qa1-soporte-capturas/` y `qa2-soporte-capturas/`.

## 4. H10 (CA-12)

La cola «Todos» de Mesa de ayuda solo cuenta tickets **abiertos**: excluye los resueltos, cerrados y cancelados (`ticket-list-sql.ts:77`).
- El suscriptor medido tenía 11 tickets importados de UISP y los 11 estaban cerrados.
- El «3» era el total de tickets abiertos del tenant, todos de otros solicitantes.
- Quedaron descartados el alcance por rol, la paginación y la vinculación por contrato, con consulta de solo lectura a la BD de desarrollo.

No es un defecto del filtro sino del rótulo, así que no se corrigió (R8).

## 5. Deudas

| # | Deuda | Dueño |
|---|---|---|
| D1 | El rótulo «Todos» de Mesa de ayuda no incluye cerrados (H10): renombrar, añadir una cola con todos o un filtro de estado | Producto (`prod-ux`) |
| D2 | `canSeeInternal` funciona como lista negra de roles; conviene convertirla en lista blanca al tocar la matriz de roles | `sr-backend` |
| D3 | Zod declara opcionales `commentCount` y `firstCommentExcerpt`, mientras que OpenAPI los declara obligatorios. Hay que volverlos obligatorios cuando los fixtures del portal los incluyan | `sr-backend` |
| D4 | En Mesa de ayuda, Anterior y Siguiente reemplazan la entrada del historial y «atrás» cierra el panel. Falta confirmar si es lo deseado | `prod-ux` |
| D5 | Un ticket propio que queda fuera de los 100 más urgentes del suscriptor se ignora si llega por la URL de la ficha | `fe-platform` |
| D6 | El script de retiro del seed falla con `iwana_app` porque no tiene permiso de tablas temporales; se retiró con una variante. El seed está retirado y verificado | `sr-qa` |
| D7 | `portal-mod05-ficha-uisp-live.spec.ts` falla en el login (`/auth/login`) antes de Soporte. Se atribuye al entorno y no está clasificado en CI | `sr-qa` |
| D8 | CA-9 y CA-10 por rol técnico solo se prueban en la integración; no hay credenciales de técnico de prueba para el navegador | `sr-qa` |

## 6. Datos de prueba

El suscriptor `[SEED-SOPORTE]`, sus 10 tickets, 2 comentarios y 24 eventos de historial se crearon en el tenant de pruebas y se retiraron al cierre. No quedan rastros. No se usaron datos reales en docs, pruebas ni capturas.
