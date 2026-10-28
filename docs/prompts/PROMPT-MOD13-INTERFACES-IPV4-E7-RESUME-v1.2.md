# Encargo — MOD13 · E7_resume v1.2: bootstrap público, reconstrucción y reanudación

**Versión:** 1.2 · **Estado:** vigente; corrige el preflight incompleto de v1.1 · **Fecha:** 2026-10-27 · **Emite:** AI-EM-ARCH · **Ejecuta:** `plat-ops` (apoyo `data-eng` en R-0b)
**Plan:** [orquestación v3.6](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Matriz:** [QA v2.5 §13.11](../quality/2026-10-26-mod13-interfaces-matriz.md) · **Intento previo:** [E7_resume v1.1, intento 2](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.1-attempt2.json) · **Evidencia:** [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md), [E2/E5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md) · **API:** [v1.16 congelada](../specs/2026-10-26-mod13-interfaces-api.md)

## 1. Corrección respecto a v1.1

El intento 2 de v1.1 pasó R-0 y creó E1, pero el generador terminó con `42P01 relation public.typeorm_migrations does not exist`. El generador espera que las migraciones públicas ya estén aplicadas y solo aplica las migraciones tenant. La causa raíz y SHA están en matriz §13.11. E1 quedó en tmpfs/loopback, sin migraciones/semilla/clones; `e2-e5.json` fue restaurado. Este encargo añade un bootstrap público explícito, solo en E1, antes del generador. No altera E2/E5 ni el alcance de E-7.

## 2. Límites

Se mantienen v1.1 §2 y v1.0 §2–3: `NETWORK_IP_PROTECTION=PENDING` todo el tiempo; solo loopback; API 3014; Redis DB7 para el clon; no `dbiw`, `iwana_redis_dev`, secretos/PII en artefactos, `--reset`, `migration down`, `FLUSHALL/FLUSHDB` o commit. Docker Desktop lo abre el usuario; `plat-ops` no inicia, reinicia ni reconfigura Docker.

- Reutilizar E1 ya creado solo si R-0b(a) confirma los nombres, salud, digests, loopback, tmpfs, ausencia de mounts persistentes y Redis DB0–DB7 vacío. Si no coincide, detener y reportar; no retirar ni recrear datos existentes.
- La migración pública se ejecuta exclusivamente contra `iwana_it_mod13_ca_r12_e1`, usando `connections.json` en memoria para variables de conexión de proceso. No imprimir variables ni ejecutar `db:migrate:all`; no se ejecutan migraciones tenant en este paso.
- Proteger `e2-e5.json`: registrar SHA `8d20dbc5297e163ffa4e1640e216c750027243ea5956face38fe55593223d82a`, guardar copia temporal, mover fuera cualquier salida nueva, restaurar el original y verificar igualdad de SHA. Retener temporalmente el backup hasta confirmar la restauración.

## 3. Pasos

| Paso | Acción | Criterio de salida |
| --- | --- | --- |
| R-0 | Verificar Docker, hash del generador `91b78e32bc71dfc25c94c0ec08b7a5d3f00cf05bbebcdebf15fa739361874ed9`, conexiones (solo presencia), inventario E1/E7_final y puertos 3014/5434/6381. | Si Docker no responde o algo no coincide, `NOT_EXECUTED`; no iniciar Docker. |
| R-0b(a) | Verificar y reutilizar E1 del intento 2; si falta, crear como v1.1 §3, con nombres/digests exactos, loopback/tmpfs y Redis efímero. Registrar DBSIZE DB0–DB7. | E1 saludable y aislado; Redis DB0–DB7=0. |
| R-0b(b1) bootstrap público | `pnpm --filter @iwana/db build`; cargar en memoria desde el archivo local las variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_MIGRATOR_USER` y `DB_MIGRATOR_PASSWORD`; ejecutar `pnpm --filter @iwana/db migration:run`. Nunca mostrar sus valores. | Exit 0 y exactamente 27 migraciones públicas en `public.typeorm_migrations`. Si no, detener aquí sin ejecutar tenant migrations ni generador. |
| R-0b(b2) baseline | Ejecutar `node scripts/mod13-ca-r12-baseline.cjs` sin `--reset`, con protección E2/E5 anterior. | Exit 0; 27 públicas, 160 tenant hasta 164 y 161 tras ciclo 165; bases E6/E7 con 2 interfaces y 2 direcciones cada una; E2/E5 restaurado con SHA intacto. |
| R-0b(c/d) | Aplicar v1.1 §3 al fixture de OT E7_match con tiempos fijos; construir E7_final y validar las 6 huellas legacy, conteos/proyecciones, 800 candidatos y 5 checks referenciales. | 6/6 igual a E2/E5 y proyecciones iguales a E7_final; diferencia no admitida detiene el ensayo. |
| R-1 a R-9 | Igual a v1.1 §3 y v1.0 §3 con E7_final validado. | Todos los criterios de reserva/release, reanudación, protección, corte y teardown; cada runner exit 0. |

**Configuración de entorno para R-0b(b1):** `plat-ops` debe parsear el JSON local sin imprimirlo, asignar solo las variables listadas al entorno del proceso hijo de `pnpm`, capturar `$LASTEXITCODE` y limpiar esas variables del shell al terminar. No guardar credenciales en scripts, repo, logs o artefactos.

## 4. Entrega

Añadir apéndice «E7_resume v1.2» a `e7-rollback.md`; registrar comandos, códigos, conteos y digests. El artefacto actual es `e7-resume.json`; preservar `e7-resume-v1.0.json` y el registro v1.1 del primer intento. Si cualquier paso falla, parar, mantener E1 para diagnóstico, guardar evidencia saneada y no reintentar sin informar. Tras validación SEC/SR-QA, AI-EM-ARCH dictamina G6. G6.5/G7 son independientes. `NETWORK_IP_PROTECTION=PENDING`.
