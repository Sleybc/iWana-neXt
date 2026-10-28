# Encargo — MOD13 · E7_resume: reanudación tras rollback y teardown de E1

**Versión:** 1.0 · **Estado:** intento detenido en R-0 (`NOT_EXECUTED`); reintento pendiente de R-0 verificable · **Fecha:** 2026-10-27 · **Emite:** AI-EM-ARCH · **Ejecuta:** `plat-ops`
**Plan:** [orquestación v3.1, al emitir](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Matriz:** [QA v2.1 §13.7, al emitir](../quality/2026-10-26-mod13-interfaces-matriz.md) · **Estado actual:** G6 NO PASS, [matriz v2.2 §13.8](../quality/2026-10-26-mod13-interfaces-matriz.md) · **Evidencia previa:** [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md) · **API:** [v1.16 congelada](../specs/2026-10-26-mod13-interfaces-api.md)

## 1. Por qué existe este encargo

E-7 exige «volver al backend anterior sin perder la protección (o bloquearlo), **reanudar y volver a avanzar**». E7_final probó el rollback y la protección, pero terminó con 17/17 colas pausadas y la admisión de reservas cerrada (`NETWORK_RESERVATIONS_PAUSED=true`). La reserva legacy solo se probó contra `IpamService` dentro de transacciones revertidas, no como petición HTTP autenticada. Este encargo cierra ese tramo y entrega el teardown de E-1, que quedó sin verificar porque Docker Engine no respondía.

Decisión humana, 2026-10-27: «Prepara el encargo E7_resume para plat-ops: en un clon de E7_final, reanudar las 17 colas y la admisión de reservas, hacer una reserva HTTP autenticada sobre un pool legacy, verificar que la captura de IP local sigue en 409 y cerrar con huellas, conteos de colas y el teardown de E1.»

## 2. Límites que no se negocian

- `NETWORK_IP_PROTECTION=PENDING` durante todo el ensayo. No se habilita captura.
- Solo se escribe en el clon nuevo `iwana_it_mod13_ca_r12_e7_resume` y en Redis E1 con `REDIS_DB=7`. Nunca en `dbiw`, `iwana_redis_dev`, E7_final (solo como plantilla), Redis DB0–DB6 ni el proceso ajeno del puerto 3002.
- Listeners solo en `127.0.0.1`; API en el puerto 3014 (comprobar antes que esté libre). Sin `0.0.0.0`.
- Sin `migration down`, reset, `docker system prune`, `FLUSHALL`/`FLUSHDB` fuera de DB7, ni borrado de jobs ajenos.
- Ningún secreto, token, UUID de fila ni dirección IPv4 real en el repo ni en la salida. Las credenciales se leen del archivo local de E-1 en memoria. **Sanear cualquier JSON de Playwright o del runner (por ejemplo `config.webServer.env`) en el directorio temporal antes de copiarlo al repo**, no después.
- El runner de control debe terminar con código 0. Las aserciones de conteo comparan el ámbito correcto: los repeatables de una cola contra su valor esperado por cola y los globales contra el global. Un exit distinto de 0 se trata como fallo hasta explicar y corregir su causa y repetir el paso.

## 3. Pasos

| Paso | Acción | Criterio de salida |
| ---- | ------ | ------------------ |
| R-0 Preflight | `docker info` responde; `docker ps -a` muestra `iwana_mod13_ca_r12_pg_e1` y `iwana_mod13_ca_r12_redis_e1` saludables; puerto 3014 libre; Redis DB7 con `DBSIZE=0`. | Si E1 o E7_final ya no existen, **detener** y reportar `NOT_EXECUTED` con la causa observada. No reconstruir E1 ni la semilla sin un encargo nuevo. |
| R-1 Clon | Con 0 conexiones a la plantilla y al destino, `CREATE DATABASE iwana_it_mod13_ca_r12_e7_resume WITH TEMPLATE iwana_it_mod13_ca_r12_e7_final`. Verificar baseline: 6/6 huellas legacy E2/E5, huella de `execution_orders`, 800 candidatos únicos, 1 snapshot `IN_PROGRESS`, 2 interfaces / 2 direcciones, 5 checks referenciales en 0. | Todos los valores coinciden con la evidencia E7_final. |
| R-2 Build | Compilar el protector del checkout actual. Registrar el SHA de `HEAD`, si el árbol está limpio, y los SHA-256 de `main.js`, `ipam.service.js`, `network-interface-catalog.service.js` y `network-provisioning-reconciler.processor.js`. Si alguno difiere de E7_final, registrarlo como build distinto, sin compararlo como si fuera el mismo. | Hashes registrados. |
| R-3 Arranque pausado | Antes del bootstrap, crear y pausar las 17 colas en DB7. Arrancar el protector con `PENDING` y `NETWORK_RESERVATIONS_PAUSED=true`. Health 200. Inventariar 8 estados × 17 colas y los repeatables que registre el bootstrap. | 17/17 pausadas, `active=0`, inventario registrado. |
| R-4 Reanudación | Reiniciar el protector con `NETWORK_RESERVATIONS_PAUSED=false`, manteniendo `PENDING`. Reanudar las **17** colas a la vez (no solo reconcile). Dejar correr al menos una ocurrencia **natural** completa de `reconcile-network-provisioning`, sin promoverla a mano. | `paused=false` en 17/17; la ocurrencia termina `completed` con lotes ≤100, 0 `failed`, 0 retries y DLQ vacía. |
| R-5 Identidad | En el clon, crear un ADMIN sintético por los servicios oficiales, como en el probe de captura (`TenantSeedService.seedInitialAdmin`, cambio de contraseña, login tenant). | Login 2xx; nada sensible registrado. |
| R-6 Reserva HTTP | Llamar `POST /api/v1/network/provisioning/reserve` con el contrato de API v1.16 sobre un pool legacy con hosts libres. Si el contrato pide una OT elegible, crearla por el flujo oficial o con una fila sintética documentada, como en E7_match. Después, `POST /api/v1/network/provisioning/:id/release` sobre esa reserva. | Reserva 2xx persistida: `ip_assignments` 2.000 → 2.001, una fila de auditoría nueva, dirección dentro del pool y distinta de las 2 locales. Release 2xx con la transición de estado documentada en API v1.16. |
| R-7 Protección | (a) Reserva manual HTTP de una dirección local de interfaz → `IP_PROTECTED_BY_INFRASTRUCTURE`. (b) Captura autenticada de una IP local nueva (`POST .../interfaces/:interfaceId/ipv4-addresses`) → 409 `IP_PROTECTION_PENDING`. | Ambos rechazos sin mutación: huellas de routers, interfaces y direcciones idénticas antes y después. |
| R-8 Corte final | Huellas: las 6 tablas legacy restringidas al conjunto de PK original deben coincidir con E2/E5; las filas nuevas se enumeran por tabla y conteo (reserva, release, auditoría, OT si la hubo). Colas: 8 estados × 17 colas y repeatables. | Legacy 6/6 igual; deltas iguales a los esperados de R-6; 17/17 reanudadas; `waiting=active=failed=0`; DLQ vacía; `delayed` solo por repeatables. |
| R-9 Teardown | Detener el API propio. Retirar por **nombre o ID exacto**: `iwana_mod13_ca_r12_pg_e1`, `iwana_mod13_ca_r12_redis_e1`, `mod13-e7-final-proxy`, `mod13-e7-final-old-api`, la red `mod13-e7-final-private` y la imagen `mod13-e7-final-legacy:verified-v2`. Borrar `%LOCALAPPDATA%\Temp\iwana-mod13-ca-r12-e1\` (contiene credenciales) y los directorios temporales de E7. Conservar las imágenes oficiales `node`/`nginx`. | `docker ps -a`, `docker network ls` y `docker images` no muestran ningún recurso E1/E7; sin listeners en 3010–3015, 5434 ni 6381; directorios temporales ausentes; el proceso de 3002 intacto. |

## 4. Entrega

- Añadir la sección «E7_resume» al final de [e7-rollback.md](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md), sin reescribir las secciones anteriores, y el artefacto saneado `e7-resume.json` con su SHA-256.
- Reportar comandos, conteos reales, hashes y el código de salida del runner. Si un paso falla, se detiene allí, se preserva el estado y se reporta; no se reintenta en silencio.
- No commitear. No cambiar el estado de G6, CA-R12 ni `NETWORK_IP_PROTECTION`: eso lo decide AI-EM-ARCH tras las revisiones de `sec-eng` y `sr-qa`.
