# Encargo — MOD13 · E7_resume v1.4: E1 persistente y corrida única hasta el teardown

**Versión:** 1.4 · **Estado:** vigente; sustituye a v1.3 · **Fecha:** 2026-10-27 · **Emite:** AI-EM-ARCH · **Ejecuta:** `plat-ops` (apoyo `data-eng`; comparador independiente `sr-qa`)
**Plan:** [orquestación v3.10](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Matriz:** [QA v2.9 §13.15](../quality/2026-10-26-mod13-interfaces-matriz.md) · **Encargos que integra:** [v1.0](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.0.md), [v1.1](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.1.md), [v1.2](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.2.md), [v1.3](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.3.md) · **Evidencia:** [helper histórico](../quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt), [E2/E5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json), [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)

## 1. Por qué existe v1.4

E1 guardaba sus datos en tmpfs y sus contenedores no tenían política de reinicio. El 2026-10-27 a las 21:59:20Z Docker Engine se reinició: los contenedores de desarrollo volvieron solos y los de E1 quedaron `Exited (255)` con el contenido borrado. Era la tercera pérdida del entorno. Además, cada encargo prohibía reconstruir lo que el anterior había perdido, así que cada interrupción obligaba a emitir una versión nueva.

Decisión humana, 2026-10-27: «Prepara E7_resume v1.4 y el launcher v1.18: E1 con volúmenes nombrados en lugar de tmpfs, bootstrap público + generador + fixture alineado + H-3 + R-1 a R-9 en una sola corrida, teardown que retire los volúmenes, y sin subir versiones de plan/matriz por intentos NOT_EXECUTED.»

Este encargo sustituye a v1.0–v1.3 como instrucción de ejecución. Sus pasos se citan aquí por referencia y valen con los ajustes de §3.

## 2. Límites

- `NETWORK_IP_PROTECTION=PENDING` todo el tiempo. Solo loopback. API en 3014; Redis DB7 para el clon de R-1.
- Nada de `dbiw`, `iwana_redis_dev`, contenedores o volúmenes de desarrollo, `--reset`, `migration down` fuera del ciclo del generador, `FLUSHALL`/`FLUSHDB`, `docker system prune`, `docker volume prune` ni commit.
- Docker Desktop lo abre el usuario. `plat-ops` no arranca, reinicia ni reconfigura Docker.
- Las credenciales se leen del archivo local de E-1 en memoria y nunca se imprimen. Los artefactos se sanean en el temporal antes de copiarlos al repo. Cada runner termina con exit 0; las aserciones comparan por cola contra lo esperado por cola, y lo global contra lo global.
- `e2-e5.json` (SHA-256 `8d20dbc5297e163ffa4e1640e216c750027243ea5956face38fe55593223d82a`) y la copia del helper (`2398d360662d0bf6d4c22a1fc50a9bbdc2fc84fd6e2dfbb08a478ac092cb7004`) no se modifican. El generador sobrescribe `e2-e5.json`: guardar una copia, mover la salida nueva y restaurar el original, como en v1.1 §2.
- **Registro de intentos:** un bloqueo de entorno (`NOT_EXECUTED`: Docker sin respuesta, puerto ocupado, engine reiniciado) se anota como una línea con fecha, paso y causa al final de [e7-rollback.md](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md), con un artefacto saneado si hace falta. **No se suben versiones** del plan, la matriz, el informe ni el launcher por esos intentos. Solo se versionan ante un resultado de producto (H-3, R-1 a R-9) o un hallazgo nuevo.

## 3. Pasos

| Paso | Acción | Criterio de salida |
| ---- | ------ | ------------------ |
| V-0 Preflight | `docker info` responde. Comprobar los SHA del generador (`91b78e32…ed9`), de `e2-e5.json` y de la copia del helper; que exista el archivo de conexiones; y que los puertos 3014, 5434 y 6381 estén libres u ocupados solo por los contenedores E-1. | Cualquier diferencia → `NOT_EXECUTED` según §2. |
| V-1 E1 persistente | Retirar por nombre exacto `iwana_mod13_ca_r12_pg_e1` e `iwana_mod13_ca_r12_redis_e1` si existen: son tmpfs sin datos recuperables. Crear los volúmenes `iwana_mod13_ca_r12_pg_e1_data` e `iwana_mod13_ca_r12_redis_e1_data`. Crear los contenedores con los mismos nombres, `postgres:18.3-alpine` y `redis:8.6-alpine`, en `127.0.0.1:5434` y `127.0.0.1:6381`, `--restart unless-stopped`, PostgreSQL con su volumen en `/var/lib/postgresql` y Redis con su volumen en `/data`, `--appendonly yes` y la contraseña de `redis.env`. | Ambos saludables; digests de imagen y nombres de volumen registrados; sin tmpfs; Redis DB0–DB7 vacíos. |
| V-2 Bootstrap público | [v1.2](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.2.md) R-0b(b1): `pnpm --filter @iwana/db build` y `pnpm --filter @iwana/db migration:run` solo contra `iwana_it_mod13_ca_r12_e1`. | Exit 0; 27 migraciones públicas. |
| V-3 Semilla | v1.2 R-0b(b2): `node scripts/mod13-ca-r12-baseline.cjs` sin `--reset`, protegiendo `e2-e5.json`. | Exit 0; 160 migraciones tenant hasta 164 y 161 tras el ciclo 165; bases `…_e6` y `…_e7` con 2 interfaces y 2 direcciones cada una; 6/6 huellas legacy iguales a E2/E5. |
| V-4 Fixture y E7_final | [v1.3](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.3.md) H-1: `data-eng` alinea `scripts/mod13-ca-r12-e7-fixture.cjs` con los literales del helper; puede hacerlo antes de V-0, porque es solo código. Después, crear `iwana_it_mod13_ca_r12_e7_final` `WITH TEMPLATE iwana_it_mod13_ca_r12_e7` y aplicar el fixture. | Diff y SHA nuevos del fixture registrados; 1 OT `IN_PROGRESS`; 800 candidatos únicos, 799 sin snapshot. |
| V-5 Comparación | v1.3 H-3, a cargo de `sr-qa`: fila esperada derivada solo del helper y del catálogo; comparación columna por columna sin `created_at`/`updated_at`; las 6 huellas legacy, 2/2 interfaces y direcciones y los 5 checks referenciales. | Coincidencia exacta. Cualquier columna distinta detiene la corrida y es un resultado de producto: se versiona. |
| R-1 a R-9 | [v1.0 §3](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.0.md) con los ajustes de [v1.1](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.1.md): R-1 clona el E7_final de V-4 y R-8 toma como base las huellas de V-5. **R-9** retira por nombre exacto los dos contenedores, **los dos volúmenes** (`docker volume rm`), la red `mod13-e7-final-private` y la imagen `mod13-e7-final-legacy:verified-v2` si existen, y, solo después de volver a verificar la copia del helper, los temporales `iwana-mod13-ca-r12-*` e `iwana-mod13-e7-*`. | Los de v1.0 y v1.1, más: `docker volume ls` sin volúmenes E1; `e2-e5.json` y la copia del helper con su SHA; el fixture en el árbol, sin commit. |

**Una sola corrida.** De V-0 a R-9 no hay pausas entre pasos salvo por un fallo. Cada paso cerrado escribe un checkpoint en el temporal (paso, hora, huellas y conteos de salida). Si el engine se reinicia o el proceso se corta, los volúmenes conservan el estado: se vuelve a verificar el último checkpoint (contenedores saludables y huellas iguales) y se continúa desde el paso siguiente, sin repetir los anteriores. Si las huellas no coinciden, se vuelve a V-1 dentro de la misma corrida. Un paso a medias de R-4 a R-7 se repite completo y su delta se cuenta una sola vez.

## 4. Entrega

Apéndice «E7_resume v1.4» al final de `e7-rollback.md`; artefactos saneados `e7-resume-v1.4-v5.json` (comparación) y `e7-resume.json` (R-1 a R-9), con su SHA-256; preservar los artefactos de v1.0 a v1.3. Reportar comandos, códigos de salida, conteos, hashes, digests, volúmenes y checkpoints. G6 sigue NO PASS hasta el dictamen de AI-EM-ARCH tras `sec-eng` y `sr-qa`. `NETWORK_IP_PROTECTION=PENDING`.
