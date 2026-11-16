# INFORME-MOD09-ADJUNTOS-TICKETS-v1.0

**Versión:** 1.0
**Estado:** G6 ✅ con deudas registradas · publicado e33cb1a0 + 7bed4cb9 · G6.5 ✅ 2026-11-16 (CI 43913526018) · G7 NO-GO (ver §6)
**Fecha:** 2026-11-16
**Emisor:** Claude Code (sesión orquestadora, subagentes por ola)
**Spec:** [2026-11-16-mod09-adjuntos-en-tickets](../specs/2026-11-16-mod09-adjuntos-en-tickets.md) v1.0 (G0 2026-11-16)
**Plan:** [2026-11-16-mod09-adjuntos-en-tickets](../plans/2026-11-16-mod09-adjuntos-en-tickets.md) · **Launcher:** [PROMPT-MOD09-ADJUNTOS-TICKETS-LAUNCH-v1.0](../prompts/PROMPT-MOD09-ADJUNTOS-TICKETS-LAUNCH-v1.0.md)

## 1. Resultado

Los comentarios de tickets admiten fotos, PDF y MP4, con validación por firma, cuarentena, enlace firmado que respeta la visibilidad interna, supresión del titular e importación desde UISP. Las 4 olas están cerradas con conteos reales. Los 8 criterios de §5 tienen prueba.

## 2. Olas

| Ola | Bloque · agente | Entrega |
|---|---|---|
| 1 | W0 · `sr-qa` | Línea base: API 42/520, integración 4/47, portal 56/565, E2E 8 mock + 3 vivas |
| 1 | A · `sr-backend` | Contrato `ticket-attachments.contract.ts`; tenant **212** `ticket_comment_attachments`; pública **032** (CHECK de `media_assets.usage`); manifiesto de supresión 820→823 |
| 2 | B · `sr-backend` | MP4 por `ftyp`; `TicketAttachmentMediaPort`; `POST …/comments/with-attachments` todo o nada con `Content-Length` previo (411/413); enlace firmado 300 s; `attachmentCount`; supresión |
| 2 | I · `plat-ops` | `nginx.prod.conf`: 110M solo en esa ruta (UUID estricto), `proxy_request_buffering off`; `scripts/nginx-config.test.mjs` |
| 3 | C · `sr-backend` | Importación de `comment.attachments[]` desde `tickets/<ticket>/`, idempotente por `external_id`, conteo por motivo, reversión con bloqueo 409 si hay adjuntos manuales |
| 3 | F · `fe-platform` | Selector con validación previa, lista por comentario (miniatura, video, PDF, «En revisión», «Archivo bloqueado»), «Adjuntos (N)», clip en la ficha; informe del lote UISP |
| 4 | QA y revisores | §3 y §4 |

**Gate de la ola 2:** `ticket-attachments.postgres.integration.spec.ts` «GATE (a)» (interno → 404 sin permiso) y «GATE (b)» (firma falsa → 400 sin nada guardado), en verde contra Postgres; reforzado por HTTP real en `ticket-attachments.http.postgres.integration.spec.ts` (técnico y otro tenant → 404).

## 3. Conteos finales (sin caché)

| Superficie | Resultado | W0 |
|---|---|---|
| API unitarias assurance + media + migration | 51 suites / 613 | 42 / 520 |
| API integración assurance + migration + media + text-erasure (Postgres + Redis) | 8 / 67 | 4 / 47 (+7 Redis) |
| database 212 + 032 (integración) | 2 / 23 | — |
| shared · database completas | 50 / 733 · 81 / 452 | — |
| worker completa | 27 / 306 (+ `evidence-orphan-detection` 17/17 tras el último ajuste) | — |
| worker integración purga S-1 | 1 / 1 | — |
| Portal assurance + crm/subscribers + api-client + CSP | 61 / 611 | 56 / 565 |
| Portal importación UISP | 5 / 91 | 5 / 91 |
| `nginx-config.test.mjs` | 4 / 4 | — |
| API completa | 596 / 597 suites, 7952 / 7953 | — |

El único rojo de la API completa es `app.config.production-urls.spec.ts`: lo contamina el entorno que deja otra suite (`MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS`) y aislado pasa 26/26. Es preexistente.

**E2E** (`playwright.portal.local.config.ts`, servidores de desarrollo reutilizados):

| Spec | Resultado |
|---|---|
| `portal-importacion-uisp-live` (con adjuntos sintéticos) | 3/3 |
| `portal-importacion-uisp-usuarios-live` | 1/1 |
| `portal-assurance-adjuntos` (nueva, incluye axe AA) | 4/4 en `next dev` reiniciado (Chrome) y 4/4 ×2 en build standalone (Chromium del CI y Chrome). El build destapó que con `noopener` el Chromium de Playwright no expone la URL de la pestaña: la prueba del PDF verifica ahora la petición al enlace firmado desde la pestaña nueva |
| `portal-assurance` | 1/1 (también en build) |
| `portal-mod05-pestana-soporte` | 4/4 en build standalone; en `next dev`, `:388` ve un doble GET por StrictMode (propio de desarrollo) |
| `portal-field-flow-ticket-ot-inventory` | 4/4 |

## 4. Revisiones

| Revisor | Veredicto | Atendido |
|---|---|---|
| `boundary-reviewer` | GO | `@Optional` retirado; `tenant_id` añadido en los `DELETE` |
| `contract-drift-reviewer` | GO condicionado | M1 (informe del lote sin `adjuntosTickets`), M3 (autor de los adjuntos al refrescar autores), M4 (pruebas por motivo), m1 (recarga de la ficha), m2 (OpenAPI), m3 (paridad API↔worker) |
| `test-change-reviewer` | sin ocultamientos | H2, H3, H4, H5 cubiertos; H1 escalado (§6) |
| `sec-eng` | G6 GO · G7 GO condicionado | S-1 (purga física diferida ≤6 h en el worker, fase 4, que corre aunque fallen las fases 1–3), S-3 (`@Throttle` 10/min), I-1 (CSP con el origen exacto de `S3_ENDPOINT`) |

## 5. Desvíos frente al plan

- La migración pública 032 no estaba prevista: sin ella el CHECK de `media_assets.usage` rechaza el uso nuevo.
- `media_asset_id` va sin FK (ADR-068); la FK al comentario es compuesta con `RESTRICT`.
- `@iwana/storage`: `getSignedUrl` gana opciones `responseContentType` y `responseContentDisposition`, retrocompatibles.
- `scripts/next-dev.mjs` reenvía `S3_ENDPOINT` al portal en desarrollo.
- La BD de desarrollo `dbiw` recibió la 032 y la 212 (8 tenants ACTIVE) con el runner del repo.

## 6. Deudas y decisiones abiertas

| # | Tema | Dueño | Bloquea |
|---|---|---|---|
| D1 | Los archivos se guardan **en claro** en el bucket privado; spec §2.3 decía «cifrado». **Aceptado por el usuario el 2026-11-16** como excepción (spec v1.1) | — | No |
| D2 | **Código preparado el 2026-11-16 (sin commit):** la API firma con `S3_PUBLIC_ENDPOINT` (obligatorio y https en producción), la CSP y la imagen del portal lo usan, nginx tiene el vhost `archivos.<dominio>` (solo GET/HEAD firmados) y el compose la red `storage-edge` (solo nginx y MinIO). Afecta a todos los enlaces firmados, no solo a los adjuntos. **Falta:** que el CTO apruebe el dominio (propuesta `archivos.<dominio>`, enmienda de ADR-095), el visto bueno de `sec-eng` al proxy (regla de usos privados del runbook) y DNS más certificado | CTO · `sec-eng` · `plat-ops` | G7 |
| D3 | **Código preparado el 2026-11-16 (sin commit):** evento estable `error_type=TICKET_ATTACHMENT_PURGE_FAILED` (con conteos, sin claves) y respuesta en RUNBOOK-MEDIA-MINIO v1.2. **Falta:** conectar la alerta a la herramienta de monitoreo que se elija en G7 | `plat-ops` | G7 |
| D4 | **Resuelto el 2026-11-16** (decisión del usuario: «se importa igual»): un comentario UISP solo con adjuntos se importa con texto vacío; el drawer no muestra párrafo vacío. Pruebas: mapeo, plan de adjuntos, integración «D4» (promoción 20/20) y drawer | — | No |
| D5 | El lector del ZIP limita cada entrada a 50 MB: un MP4 de 50–100 MB rechaza el ZIP entero | `sr-backend` | No |
| D6 | Si encolar el análisis falla tras el commit, el adjunto queda «En revisión» sin reencolado | `sr-backend` | No |
| D7 | `TICKET_POSTERIOR` suma tickets y adjuntos manuales en la misma cantidad; el portal lo mitiga mostrando el mensaje de la API | AI-EM-ARCH | No |
| D8 | El nombre del archivo viaja en el query string firmado; la firma de enlaces no se audita; la cuarentena no es antivirus (contenido activo en PDF) | `sec-eng` | No |
| D10 | Ajeno a la fase: en `next dev`, `portal-mod05-pestana-soporte.spec.ts:388` cuenta dos `GET /assurance/tickets` iguales. Causa confirmada con traza de pila en el navegador: ambas salen de `SubscriberTicketsSection` y la segunda pasa por `reconnectPassiveEffects`, la doble ejecución de efectos de React en desarrollo, que no existe en producción. El efecto no cambió frente a `HEAD`. En build pasa 4/4; la prueba asume producción | Se deja registrada (recomendación aceptada por el usuario el 2026-11-16) | No |
| D9 | Ajeno a la fase: la lista de tickets de la ficha abre en «Abiertos» (cambio sin commitear de otra sesión); los tickets cerrados con clip quedan ocultos de entrada | Dueño de esa tarea | No |

## 7. Pendiente con el usuario

1. ~~Reiniciar el `next dev` de 3002 y volver a correr las dos E2E~~: hecho el 2026-11-16, en verde (§3).
2. ~~Commit y push~~: e33cb1a0 (fase) y 7bed4cb9 (CI: `S3_ENDPOINT` para las E2E del portal y `R0_3_REAL_DB` en la purga S-1). El primer CI (43907506253) falló por esas dos variables; el segundo (43913526018) quedó verde.
3. ~~Revertir y reimportar el cliente 22~~: hecho el 2026-11-16 en desarrollo. Lote 5173656c CONCILIADO con 10 adjuntos importados (6 JPEG y 4 PDF, AVAILABLE) en 7 comentarios, 4 de ellos sin texto (D4). Criterio 5 cumplido.
