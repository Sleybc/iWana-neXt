# PROMPT — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 3 (P2)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Etapa:** 4 (G4 con contrafirma pendiente del receptor)
**Precondición:** G6 de la Fase 2. Contrato P2 congelado en `packages/shared` (abajo).
**Plan:** [2026-11-21-web-centro-control-pulso-plataforma.md](../plans/2026-11-21-web-centro-control-pulso-plataforma.md) · **Dirección:** [v1.1](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §5 P2 · **Prototipo:** bloques «Disponibilidad» y «Colas»

## Diseño del muestreo

| Pieza | Decisión |
| --- | --- |
| Muestreador | Job repetible de BullMQ en `apps/worker`, cada 5 min (`upsertJobScheduler`, id fijo, retención corta como los demás recurrentes) |
| Qué mide | `SELECT 1` a Postgres, `PING` a Redis, `GET /api/v1/health` del API (timeout 3 s) y, por cola registrada en el worker, `waiting`, `failed` y la edad del trabajo en espera más viejo |
| Dónde guarda | Tabla nueva `public.platform_health_samples` (migración del schema `public`): `id`, `sampled_at timestamptz`, `api_ok`, `db_ok`, `redis_ok` booleanos, `queues jsonb` (`[{ name, waiting, failed, oldestWaitingSeconds }]`). Índice por `sampled_at`. Sin `tenant_id`, sin datos de empresa |
| Retención | El mismo job borra muestras de más de 35 días |
| Si cae el worker | No hay muestra: el día cuenta como **sin dato**, nunca como disponible |

## Contrato congelado P2 (`packages/shared/src/dto/platform-health-history.dto.ts`)

`GET /api/v1/platform/health/history` envuelto en `{ data }`, solo roles de plataforma (mismos guards que `platform-users`):

- `days`: 30 elementos, antiguo → actual, `{ date: 'YYYY-MM-DD', components: { api, db, redis: { samples, availability: number | null } } }`; `availability` = muestras OK / muestras del día, `null` si `samples = 0`. Tipos exactos en el archivo citado.
- `queues`: última muestra, `{ name, waiting, failed, oldestWaitingSeconds | null }`, más `queuesSampledAt` (`null` si no hay ninguna).
- `generatedAt`.

## Bloques

- **§A sr-backend:** migración `public`, entidad, procesador del worker, servicio y endpoint en `apps/api` (módulo `health`), pruebas unitarias e integración (`DB_NAME=test`) con: día sin muestras, día parcial, retención, cola sin trabajos.
- **§B plat-ops:** solo si el muestreador exige variable de entorno, red entre worker y API o cambio de Compose/CI (`API_INTERNAL_URL`). Si no, no se despacha.
- **§C fe-platform:** celda «Disponibilidad» del pulso (30 días, peor componente), tracker de 30 días en el área Salud (día sin dato en neutro, nunca verde) y área **Colas de trabajo** con nombre visible en español por cola (`PLATFORM_UI_COPY`). Fuera: P4.
- **§D sr-qa:** mocks y E2E de la portada (CA-PP3), axe `wcag22aa`.

## Criterios de aceptación

| ID | Criterio |
| --- | --- |
| CA-PP3-01 | Un día sin muestras se pinta como «sin dato», no como disponible |
| CA-PP3-02 | La disponibilidad se calcula solo con muestras reales; en error, estado de error con Reintentar |
| CA-PP3-03 | Las colas muestran espera, fallidos y antigüedad con nombres en español |
| CA-PP3-04 | El endpoint exige sesión de plataforma; anónimo → 401 |
| CA-PP3-05 | P4 sigue sin montar; B0–B2 completos a 1440 × 900 |

- **Detenerse si:** el muestreo exige infraestructura no prevista, o una prueba existente se pone roja y ajustarla cambia su intención: `[BLOQUEO]`.

## Paso de cierre

Typecheck, lint y jest de `@iwana/shared`, `@iwana/database`, `@iwana/api`, `@iwana/worker`, `@iwana/web` con conteo real; integración con `DB_NAME=test`; `playwright.web.config.ts`; `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`; revisión en vivo; G6 y commit local sin push.
