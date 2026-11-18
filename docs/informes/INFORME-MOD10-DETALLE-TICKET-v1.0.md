# INFORME — MOD10 Mesa de ayuda · Detalle del ticket compacto · Informe de fase (en curso)

**Versión:** 1.0
**Fecha:** 2026-11-17
**Estado:** En curso. Pasos 1 y 2 construidos y verificados en Jest, integración y navegador; la fase no se cierra sin las E2E y el G6.5.
**Fuentes:** [spec](../specs/2026-11-16-mod10-detalle-ticket-ux.md) v1.2 · [plan](../plans/2026-11-16-mod10-detalle-ticket.md) · [lanzador](../prompts/PROMPT-MOD10-DETALLE-TICKET-LAUNCH-v1.0.md)
**Evidencias:** `docs/informes/evidencias/2026-11-17-mod10-detalle-ticket/`

**Decisión por gate:**

| Gate | Decisión |
|---|---|
| G6 paso 1 | GO |
| G6 paso 2 | GO: E2E 12/12 (§5); `sec-eng` GO tras aplicar sus condiciones S-1, S-2, S-4 (S-3 revertido por D-BT-7) |
| G6.5 | Pendiente: push autorizado y CI de `main` en verde |

## 1. Qué se entregó

El paso 1, P2a y la primera versión de la API se publicaron dentro de `7a5955ab` (commit del rediseño de la pestaña Soporte, de otra sesión, que dependía de ellos). P2b, las correcciones de revisión de la API y la ronda CA-10 siguen sin commit.

| Bloque | Resultado |
|---|---|
| W0 | Línea base 77 suites / 816 tests (`assurance`, `crm/subscribers`, `shared`); inventario de 13 propiedades y 20 acciones con su guarda, en los dos consumidores |
| DS | Densidad v1.1 en §8.6 de la spec de la ficha: `PortalFieldList columns`, `PortalFieldRow emptyLabel`, D5 (`max-w-3xl lg:max-w-4xl`, riel de 20rem) |
| FE-DS | v1.1 en `portal-ui.tsx` con pruebas de clases y accesibilidad |
| P1 | `PortalSidePeek` con diálogo, foco y retorno; cabecera de controles; propiedades a dos columnas; redactor compacto fijo; hilo Comentarios/Historial/Todo; vocabulario §4 v1.1; avisos que sobreviven al control que los lanza |
| P2a | `AssuranceTicketDetail.tsx` compartido; `?ticketId=` en la bandeja; ruta `/dashboard/assurance/tickets/[id]`; «Abrir en página» (no en Soporte) |
| API | `requester`, `relatedTo`, `activeVisit`, `executionOrder`, `executionOrderCount`, `allowedTransitions` en el detalle; búsqueda de OTE por número y vínculo manual por el módulo de órdenes (D4); sin migración |
| Revisión API | S-1 (visita y orden con el permiso de su módulo), S-2 (búsqueda exige lectura de órdenes), S-4 (casos de nulo y aislamiento entre tenants), S-7 (log del fail-closed), S-8 (marcas del expediente), OpenAPI alineado con Zod. S-3 revertido por D-BT-7 |
| P2b | Riel Personas, Atención, Visita y orden de trabajo, Adjuntos, Registro; nombres y enlaces con permiso (CA-12); buscador de OTE; destinos solo de `allowedTransitions`; Estado en la fila de insignias (CA-10) |

## 2. Criterios de aceptación

| CA | Resultado | Evidencia |
|---|---|---|
| CA-1 | ✅ | Inventario 66/66 en ambos consumidores |
| CA-2 (enmendado) | ✅ | 1440×900, UISP-25790: primer comentario visible al abrir, en 542 px (`ca2-primer-comentario-542-1440x900.jpg`). Antes: pestañas en 733 px (H3), primer comentario sin instrumentar; tras la primera versión de P1, 767 px y oculto (`p1-antes-ajuste-1440x900.jpg`) |
| CA-3 | ✅ | Estado y Responsable en cabecera/riel con el hilo a la vista |
| CA-4 | ✅ | Una prueba por guarda, con y sin permiso |
| CA-5 | ✅ jsdom | Diálogo, foco, trampa y retorno; axe claro y oscuro sin violaciones. Contraste sin medir en navegador |
| CA-6, CA-7 | ✅ | Sin hex ni tamaños arbitrarios; vocabulario §4 v1.1 |
| CA-8 | ✅ | 375 px sin desborde |
| CA-9 | ✅ jsdom; E2E sin ejecutar | `test-change-reviewer` en tres pasadas, sin ajustes sin motivo |
| CA-10 | ✅ | 1440×900, TK-20261117-002: descripción en 141 px y filtro Comentarios en 197 px (`ca10-filtro-197-1440x900.jpg`; antes 215 y 271, `ca10-antes-filtro-271-1440x900.jpg`). Una descripción más larga o una alerta lo desplazan |
| CA-11 | ✅ | Recarga reabre, Atrás cierra, Adelante reabre; la ruta propia muestra el mismo contenido (navegador y Jest) |
| CA-12 | ✅ | Integración 33/33 contra Postgres: nombre nulo con titular bloqueado o suprimido, sin permiso o con fallo de marcas; enlaces solo con permiso del destino |

## 3. Conteos (Jest sin caché de Turbo, `gate-verifier` 2026-11-17)

| Ámbito | Suites / tests |
|---|---|
| portal `components/assurance` | 16 / 380 (17 / 424 tras las pruebas de cobertura) |
| portal `components/crm/subscribers` | 55 / 616 |
| portal `components/shared` | 17 / 195 |
| portal `app/dashboard/assurance` | 1 / 2 |
| `packages/shared` | 55 / 781 |
| API assurance + crm/subscribers + tasks + wfm | 113 / 1804 |
| Integración detalle + listado | 2 / 40 |

**Línea base W0 frente a final, mismo ámbito** (portal `components/{assurance,crm/subscribers,shared}`): 77 / 816 → 88 / 1.191, y 89 / 1.235 tras las pruebas de cobertura; 0 omitidas en todas las corridas.

`tsc` de portal, API y shared con exit 0; ESLint y `audit-ui.mjs` sin hallazgos en los archivos de la fase.

## 4. Revisiones

- `boundary-reviewer`: GO (5 menores).
- `contract-drift-reviewer`: sin bloqueantes; mayores corregidos (OpenAPI, respuesta del vínculo en shared, payload del historial).
- `sec-eng`: GO condicionado; S-1, S-2, S-4, S-7 y S-8 aplicados. S-3 revertido para respetar D-BT-7 (usuario, 2026-11-17).
- `gate-verifier`: todo PASA salvo cobertura, que se cerró después con pruebas: `use-assurance-ticket-detail.ts` sube de 78,51/66,66/65/81,57 a 99,17/96,66/100/100 (S/B/F/L) y `api-client.spec.ts` cubre `lookupExecutionOrder` y `linkExecutionOrder`. Conteo final de `components/assurance`: 17 / 424; `api-client.spec.ts`: 29 tests.

## 5. Pendiente

- E2E ejecutadas el 2026-11-17 contra el `pnpm dev` del usuario (`playwright.portal.local.config.ts`, 1 worker): 12 de 12 pasan en `portal-assurance.spec.ts`, `portal-assurance-adjuntos.spec.ts`, `portal-mod05-pestana-soporte.spec.ts` y `portal-importacion-uisp-live.spec.ts`. El caso `portal-mod05-pestana-soporte.spec.ts:388` (R2) fallaba porque StrictMode repetía el efecto de carga y pedía dos veces tickets y visitas; `SubscriberTicketsSection` y `SubscriberVisitsSection` piden ahora una vez por clave, con prueba en StrictMode.
- Riesgos del plan §6: R1 cerrado (dos columnas admitidas); R2 y R3 cubiertos en Jest, pendientes de E2E; R4 cubierto por integración y `sec-eng`; R5 materializado: el trabajo se publicó dentro de `7a5955ab` de otra sesión; R6 cerrado con prueba.
- Commit de P2b y de las correcciones de la API; G6.5 tras push autorizado y CI de `main` en verde (hoy rojo en `07034257`).

## 6. Deudas

| # | Deuda | Dueño |
|---|---|---|
| D1 | S-5: con titular protegido la API devuelve el id de su ficha (el portal no lo enlaza) | `sec-eng` + `sr-backend` |
| D2 | S-6: el vínculo admite una OTE de otro titular | MOD11 |
| D3 | Payload BullMQ de `FieldServiceRequest` sin Zod | `sr-backend` |
| D4 | «Visita activa» definida distinto en la proyección WFM y en el dedupe del worker | WFM |
| D5 | Orden por urgencia duplicado en portal y API | `fe-platform` |
| D6 | D-API-1: el PATCH acepta «Visita técnica solicitada» sin crear visita | `sr-backend` |
| D7 | D-API-3: nombre de usuarios internos como solicitante | `sr-backend` |
| D8 | La pestaña Soporte duplica la lógica del hook del detalle | `fe-platform` |
| D9 | Bandeja: «portal empresarial» y «SLA» visibles (fuera de alcance) | `fe-platform` |
| D10 | Sin prueba HTTP del detalle con JWT de otro tenant | `sr-qa` |
| D11 | El log del fail-closed de CRM no lleva el código de dominio (exige ampliar la guarda de logs) | `sec-eng` |
