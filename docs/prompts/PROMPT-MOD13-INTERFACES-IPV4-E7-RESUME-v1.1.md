# Encargo — MOD13 · E7_resume v1.1: reconstrucción de E1/E7_final, reanudación y teardown

**Versión:** 1.1 · **Estado:** vigente; sustituye a v1.0 · **Fecha:** 2026-10-27 · **Emite:** AI-EM-ARCH · **Ejecuta:** `plat-ops` (apoyo `data-eng` en R-0b)
**Plan:** [orquestación v3.3](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Matriz:** [QA v2.3 §13.8](../quality/2026-10-26-mod13-interfaces-matriz.md) · **Encargo previo:** [E7_resume v1.0](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.0.md) · **Evidencia:** [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md), [E2/E5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md) · **API:** [v1.16 congelada](../specs/2026-10-26-mod13-interfaces-api.md)

## 1. Qué cambia respecto a v1.0

v1.0 se detuvo en R-0 con `NOT_EXECUTED` porque Docker Engine no respondía. El PostgreSQL de E-1 corría en tmpfs, sin volumen persistente, así que al detenerse el engine se perdieron E1 y E7_final. Reintentar v1.0 tal como está volvería a terminar en `NOT_EXECUTED`.

Decisión humana, 2026-10-27: «Prepara E7_resume v1.1 y el launcher v1.13: R-0b reconstruye E1 y E7_final con el generador versionado, verifica que las huellas coincidan con E2/E5 y E7_final, y después sigue con R-1 a R-9.»

El rollback de E7_final no se repite: se ejecutó sobre estos mismos datos y no los modificó. Lo que demuestra la equivalencia son las huellas de R-0b. Si las huellas no coinciden, el generador no es reproducible: eso es un hallazgo y el ensayo se detiene.

## 2. Límites que no se negocian

Se mantienen todos los de v1.0 §2: `PENDING` todo el tiempo, solo loopback, API en 3014, Redis DB7 para el clon, nada sensible en el repo ni en la salida, saneamiento antes de copiar artefactos y runner con exit 0. Se añaden:

- Docker Desktop lo abre el usuario. `plat-ops` no arranca, reinicia ni reconfigura Docker.
- Solo se crean contenedores con los nombres exactos de E-1 y solo en `127.0.0.1:5434` y `127.0.0.1:6381`. Si esos puertos están ocupados por otra cosa, detener.
- El generador escribe siempre en `docs/quality/evidence-mod13-ca-r12-e1/e2-e5.json` (ruta fija). Antes de correrlo, registrar el SHA-256 de ese archivo y copiarlo al directorio temporal. Después, mover la salida nueva al temporal, restaurar el original y verificar que su SHA-256 no cambió. La evidencia histórica E2/E5 no se sobrescribe.
- Nunca usar `--reset` del generador ni `migration down` fuera del ciclo que el propio generador ejecuta.

## 3. Pasos

| Paso | Acción | Criterio de salida |
| ---- | ------ | ------------------ |
| R-0 Preflight | `docker info` responde. El SHA-256 de `scripts/mod13-ca-r12-baseline.cjs` es `91b78e32bc71dfc25c94c0ec08b7a5d3f00cf05bbebcdebf15fa739361874ed9`. Existe el archivo local de conexiones E-1 (no se imprime). Puertos 3014, 5434 y 6381 libres, o 5434/6381 ocupados solo por los contenedores E-1. Inventariar `docker ps -a` por nombre exacto. | Docker sin respuesta o generador con otro SHA → `NOT_EXECUTED` con la causa. Si E1 y `iwana_it_mod13_ca_r12_e7_final` existen y pasan las huellas de R-0b(d), saltar a R-1. |
| R-0b(a) E-1 | Retirar por nombre exacto los contenedores E-1 que existan sin datos. Crear `iwana_mod13_ca_r12_pg_e1` con `postgres:18.3-alpine` (la imagen de `docker-compose.yml`), `127.0.0.1:5434`, datos en `--tmpfs` y credenciales de `postgres.env`. Crear `iwana_mod13_ca_r12_redis_e1` con `redis:8.6-alpine`, `127.0.0.1:6381`, contraseña de `redis.env` y sin persistencia (`--save ""`, `--appendonly no`). | Ambos saludables; digests de imagen registrados; `DBSIZE=0` en DB0–DB7. |
| R-0b(b) Semilla | `pnpm --filter @iwana/db build`, después `node scripts/mod13-ca-r12-baseline.cjs` con la protección de `e2-e5.json` de §2. | Exit 0; 27 migraciones públicas, 160 tenant hasta 164 y 161 tras el ciclo 165; bases `…_e6` y `…_e7` creadas, cada una con 2 interfaces y 2 direcciones locales. |
| R-0b(c) Fila de OT | `data-eng` versiona `scripts/mod13-ca-r12-e7-fixture.cjs` con los valores de la fila sintética de E7_match (número `MOD13-E7-MATCH-SYNTH-001`, `origin_context=MOD13_SYNTHETIC_FIXTURE`, `INSTALLATION`, `IN_PROGRESS`, `is_annulled=false`, sin ventana planificada; candidato = primer `RESERVED`/`CERTIFIED` por `created_at, id`) y marcas de tiempo fijas. `plat-ops` crea `iwana_it_mod13_ca_r12_e7_final` con `WITH TEMPLATE iwana_it_mod13_ca_r12_e7` y aplica el fixture. | 1 fila en `execution_orders`; 1 snapshot `IN_PROGRESS`; 799 candidatos sin snapshot. |
| R-0b(d) Huellas | Comparar contra la evidencia: las 6 tablas legacy (`organization_sites` `73cd71be…`, `network_routers` `821cf105…`, `ipv4_networks` `7e3f775c…`, `service_provisionings` `22ee0557…`, `ip_assignments` `bd2d633e…`, `audit_logs` `59a80a32…`), los conteos por estado de E7_final, 800 candidatos únicos, 2/2 interfaces y direcciones, y 5 checks referenciales en 0. Para `execution_orders` y las tablas de interfaces y direcciones, comparar la huella completa. Si difiere solo por marcas de tiempo, comparar la proyección sin `created_at`/`updated_at` y registrar la huella completa nueva como base de R-8. | 6/6 legacy idénticas a E2/E5 y proyecciones iguales a E7_final. Cualquier otra diferencia → detener y reportar el campo exacto. |
| R-1 a R-9 | Igual que [v1.0 §3](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.0.md), con estos ajustes: R-1 clona desde el E7_final reconstruido. R-8 usa como base las huellas de R-0b(d). R-9 también retira las bases `…_e1`, `…_e6`, `…_e7`, `…_e7_final` y `…_e7_resume` (desaparecen con el contenedor tmpfs), los directorios `%LOCALAPPDATA%\Temp\iwana-mod13-ca-r12-*` e `iwana-mod13-e7-*`, y la salida temporal del generador. | Los de v1.0. En R-9, además, `e2-e5.json` conserva el SHA-256 registrado en §2 y `scripts/mod13-ca-r12-e7-fixture.cjs` queda en el árbol, sin commit. |

## 4. Entrega

- Añadir al final de [e7-rollback.md](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) la sección «E7_resume v1.1», con la reconstrucción como subsección propia. Entregar `e7-resume.json` saneado con su SHA-256 y la salida nueva del generador como `e7-resume-rebuild-e2-e5.json`; no reemplazar `e2-e5.json`.
- Reportar comandos, conteos reales, hashes, digests de imagen y el código de salida de cada runner. Si un paso falla, detenerse allí, preservar el estado y reportarlo.
- No commitear. G6 sigue NO PASS hasta que AI-EM-ARCH dictamine tras `sec-eng` y `sr-qa`. `NETWORK_IP_PROTECTION=PENDING`.
