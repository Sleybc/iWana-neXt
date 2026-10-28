# Encargo — MOD13 · E7_resume v1.5: re-revisión de G6 sin re-ejecutar

**Versión:** 1.5 · **Estado:** vigente; nota de re-revisión sobre la evidencia de v1.4 · **Fecha:** 2026-10-27 · **Emite:** AI-EM-ARCH · **Revisan:** `sr-qa` (decide P1-1/P1-2), `sec-eng` (C1–C3)
**Plan:** [orquestación v3.12](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Matriz:** [QA v2.11 §13.17](../quality/2026-10-26-mod13-interfaces-matriz.md) · **Encargo ejecutado:** [E7_resume v1.4](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.4.md) · **Evidencia:** [R-1 a R-9 v1.4](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.4-r1-r9.json), [V-5 v1.4](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.4-v5.json), [probe de captura](../quality/evidence-mod13-ca-r12-e1/e7-auth-capture-probe.json), [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md)

## 1. Qué se pide

Decisión humana, 2026-10-27: re-revisión sin re-ejecutar. No se reconstruye E1 ni se corre nada contra bases o colas. `sr-qa` vuelve a evaluar P1-1 y P1-2 con los argumentos de §2 y §3 y decide si se sostienen. Si no los acepta, el camino es una corrida completa nueva, que AI-EM-ARCH emitiría como encargo aparte. `NETWORK_IP_PROTECTION=PENDING`; sin commit.

## 2. P1-1 — no-mutación de R-7 sin huellas persistidas

| Rechazo | Qué podía alterar | Evidencia ya persistida | Límite |
| ------- | ----------------- | ----------------------- | ------ |
| R-7a: reserva HTTP de la IP local → 409 `IP_PROTECTED_BY_INFRASTRUCTURE` | `ip_assignments`, `service_provisionings`, `audit_logs` | R-8 del artefacto v1.4 (SHA `f25be996…c851`): deltas `ip_assignments=1`, `service_provisionings=1`, `audit_logs=4`, iguales a `expectedDeltas` de R-6; legacy 6/6 sobre 4.323 filas con el conjunto de PK original; `audit_logs` 60 → 60 → 60 en R-7a y R-7b. | No mide `network_router_interfaces` ni `network_router_interface_ipv4_addresses`. Una reserva no escribe en esas tablas. |
| R-7b: captura HTTP autenticada de una IP local → 409 `IP_PROTECTION_PENDING` | `network_router_interfaces`, `network_router_interface_ipv4_addresses`, `network_routers` | [e7-auth-capture-probe.json](../quality/evidence-mod13-ca-r12-e1/e7-auth-capture-probe.json) (SHA `8d4e1f62…4df0`): la misma petición sobre un clon de E7_final, con huellas de 7 tablas iguales antes y después (por ejemplo, interfaces `e09845b0…`, direcciones `6d3dccf7…`, `unchanged=true`). | Corrió con la admisión de reservas pausada; v1.4, con la admisión abierta. |

**Mismo build.** El artefacto v1.4 contiene los cuatro hashes del protector del probe: `ipam.service.js` `85E69FF1…`, `network-interface-catalog.service.js` `E681B0C6…`, reconciliador `2BD7E69B…` y `main.js` `54B81CC7…`.

**La admisión no cambia R-7b.** En `apps/api/src/modules/network/network-interface-catalog.service.ts` (líneas 161, 433 y 554), la guarda de captura comprueba solo `ipProtectionStatus !== 'ACTIVE'`, no la pausa de reservas, y lanza el 409 antes de cualquier escritura de la transacción. Con el mismo build y `PENDING`, el resultado del probe vale para el estado reanudado.

**Pregunta para `sr-qa`:** ¿la combinación R-8 (para R-7a) + probe con el mismo build y la guarda estática (para R-7b) basta como prueba reproducible de no-mutación? Responder PASS o NO PASS con la razón.

## 3. P1-2 y condiciones de `sec-eng`

| Punto | Disposición de AI-EM-ARCH | Qué revisa `sr-qa` / `sec-eng` |
| ----- | ------------------------- | ------------------------------ |
| Runners de V-0 a V-4 y de R-5 a R-8 no versionados (P1-2, C3) | Los borró el R-9 que redactó AI-EM-ARCH: ordenaba retirar los temporales `iwana-mod13-*` sin exigir antes copiar los runners al repo. No se pueden recuperar. Quedan como límite declarado; las salidas tienen SHA en `sources` del artefacto. Regla para cualquier encargo futuro: los runners pasan a `scripts/` con su SHA **antes** del teardown. | Si el límite declarado basta, dado que los resultados y salidas están en artefactos con SHA. |
| Nombre del consolidado distinto de §4 de v1.4 y revisiones no adjuntas (P1-2) | Se acepta `e7-resume-v1.4-r1-r9.json` con su sidecar como consolidado; v1.4 §4 pedía `e7-resume.json`, que ya existía de v1.1. Las revisiones de esta re-revisión se adjuntan como apéndice en `e7-rollback.md`. | Que el apéndice quede completo. |
| `firstPass` de R-9 sin procedencia estructurada (C1) | Verificación independiente de AI-EM-ARCH, 2026-10-27, en solo lectura: `docker ps -a`, `docker volume ls`, `docker network ls` y `docker images` no muestran recursos `mod13`; no existen los temporales `iwana-mod13-ca-r12-*` ni `iwana-mod13-e7-*`. | Repetir esos cuatro comandos y la búsqueda de temporales; registrar la salida. |
| Criterio «proceso de 3002 intacto» de R-9 (C2) | **Se retira.** El proceso de 3002 es ajeno al ensayo; v1.4 no tenía línea base y no hubo listener ni antes ni después. No aporta evidencia. | Nada. |
| Rama MFA de R-5 | **Fuera de alcance.** `seedInitialAdmin` fija `mfaEnabled=false` y E-7 solo exige login 2xx para obtener una sesión. MFA no forma parte de CA-R12. | Nada. |

## 4. Entrega

`sr-qa` y `sec-eng` añaden su dictamen como apéndice «E7_resume v1.5 — re-revisión» al final de [e7-rollback.md](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md). No se modifican los artefactos de v1.4 (`f25be996…c851`, `81b8d7cd…8bbd`) ni el probe (`8d4e1f62…4df0`). Con ambos dictámenes, AI-EM-ARCH decide G6. G6.5 y G7 siguen separados; antes de G6.5, resolver los 3 fallos del Portal completo ajenos a MOD13.
