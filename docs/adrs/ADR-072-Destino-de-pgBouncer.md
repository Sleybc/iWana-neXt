# ADR-072: Destino de pgBouncer — consumirlo o retirarlo

**Versión:** 1.1
**Estado:** Aprobado
**Fecha:** 2026-08-03 (decisión del CTO: 2026-08-09)
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano — 2026-08-09
**Opción aprobada:** **A — consumir pgBouncer**, con la validación bajo carga como **condición de entrada y no como trabajo posterior**
**Cambio v1.0 → v1.1:** registro de la decisión del CTO y de las condiciones de entrada; sin cambios en el análisis
**Ejecución:** **OLA1-a** de la secuencia por olas aprobada el 2026-08-09 ([PRD §14.3ter](../prds/PRD_Sistema_ISP_Colombia_v2_4.md))

---

> ## Decisión del CTO — 2026-08-09
>
> **Se aprueba la Opción A: encaminar `api-prod` y `worker-prod` por pgBouncer** (`DB_HOST: pgbouncer`, `DB_PORT: 6432`), **manteniendo el migrator conectado directamente a PostgreSQL** — el DDL no debe pasar por un pooler en modo transacción.
>
> **Motivo de secuencia, no de preferencia:** consumir el pooler es reversible y el momento de menor coste es ahora, con el programa aún sin producción. Retirarlo también sería reversible, pero su reintroducción caería en el peor momento posible: con carga real y datos de tenants reales.
>
> ### Condiciones de entrada — no son trabajo posterior
>
> | Id | Condición | Bloquea |
> | --- | --- | --- |
> | **E-1** | Auditar que **no exista `SET search_path` sin `LOCAL`**, ni advisory locks de sesión, ni prepared statements con nombre que crucen transacciones. En `pool_mode: transaction` cualquier estado de sesión que no sea `SET LOCAL` se pierde entre transacciones | El encaminamiento |
> | **E-2** | Dejar el **migrator y los scripts de `scripts/db/*` explícitamente fuera** del pooler | El encaminamiento |
> | **E-3** | Fijar **`AUTH_TYPE`**, hoy ausente del Compose y heredado del default de la imagen, **antes** de poner pgBouncer en la ruta de datos | El encaminamiento |
> | **E-4** | **Validación bajo carga** que demuestre el comportamiento del `search_path` por transacción con concurrencia real | El cierre de OLA1-a |
>
> **Consecuencia documental:** la justificación de `SET LOCAL search_path` en `AGENTS.md` y `CLAUDE.md` deja de ser una premisa que el runtime contradice y pasa a describir la topología real. **No se reescribe: se cumple.**
>
> **Consulta pendiente declarada:** la cabecera recomendaba consultar a **AI-DATA-ENG** sobre el comportamiento de `search_path` bajo pooling y a **AI-SR-FULL** sobre el acceso a datos. Esa consulta **sigue sin realizarse** y es parte de E-1: la aprobación de la opción no la sustituye.
**Consulta previa recomendada:** AI-DATA-ENG (comportamiento de `search_path` bajo pooling), AI-SR-FULL (implicaciones en el acceso a datos)
**Módulos:** Plataforma transversal — acceso a datos de API y worker
**Relacionado:** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A1

---

## Contexto

pgBouncer se declara, se construye y se levanta en los tres perfiles de Compose,
con `POOL_MODE: transaction`, `MAX_CLIENT_CONN: 200` y `DEFAULT_POOL_SIZE: 20`
(`docker-compose.yml:78-99`). **Ningún servicio lo consume.** `api-prod`,
`worker-prod` y `migrator-prod` conectan a `${DB_HOST:-postgres}` puerto
`${DB_PORT:-5432}`, es decir directamente a PostgreSQL
(`docker-compose.prod.yml:100`, `:229`, `:280`). En desarrollo, las apps del host
usan `DB_PORT=5433`, que es el puerto publicado de Postgres, no el 6433 de
pgBouncer.

### El problema no es el contenedor ocioso

Un servicio de 23,6 MB que nadie usa sería una molestia menor. El problema es que
**una premisa arquitectónica vigente se apoya en él**:

| Documento | Redacción vigente |
| --- | --- |
| `CLAUDE.md:111` | "Because pgBouncer does not persist `search_path`, use `SET LOCAL search_path` per transaction" |
| `AGENTS.md:254` | "**pgBouncer** → `search_path` doesn't persist; use `SET LOCAL` per transaction" |
| `AGENTS.md:124` | "usar `SET LOCAL search_path` por transaccion" |

La regla —`SET LOCAL search_path` por transacción— es **correcta y debe
mantenerse pase lo que pase**: es la forma segura de resolver el schema del
tenant y no depende de que haya pooler. Lo que está mal es su **justificación**:
se enuncia como consecuencia de un componente que hoy no está en la ruta de
datos. Un agente o una persona que lea `AGENTS.md`, verifique el runtime y
descubra que no hay pgBouncer puede concluir razonablemente que la regla ya no
aplica. **Una norma con una premisa falsa es una norma frágil**, aunque la norma
en sí sea la correcta.

Además, la decisión no puede diferirse indefinidamente: cuanto más tarde se
consuma pgBouncer, más código de acceso a datos se habrá escrito y probado sin
pooler, y mayor será la superficie a revalidar.

## Decisión requerida

Se somete al CTO la elección entre dos opciones excluyentes. **No decidir es la
única alternativa inaceptable**, porque mantiene una premisa normativa que el
runtime contradice.

### Opción A — Consumir pgBouncer (recomendada)

Encaminar `api-prod` y `worker-prod` a través de pgBouncer (`DB_HOST: pgbouncer`,
`DB_PORT: 6432`), manteniendo el **migrator conectado directamente a PostgreSQL**:
el DDL no debe pasar por un pooler en modo transacción.

**A favor**

- Es la topología para la que se diseñó el sistema y la que justifica la regla de
  `search_path` que ya está implementada en todo el acceso a datos.
- La escala objetivo declarada —miles de tenants, cientos de miles de usuarios
  finales— hace del pooling una necesidad, no un lujo: PostgreSQL agota
  conexiones mucho antes que la aplicación.
- No requiere reescribir código de acceso a datos: `SET LOCAL search_path` ya es
  compatible con `pool_mode: transaction`.

**En contra / riesgo**

- Exige **validación bajo carga**: en `pool_mode: transaction` cualquier estado
  de sesión que no sea `SET LOCAL` se pierde entre transacciones. Hay que
  auditar que no exista `SET search_path` sin `LOCAL`, ni advisory locks de
  sesión, ni prepared statements con nombre que crucen transacciones.
- El migrator y los scripts de `scripts/db/*` deben quedar explícitamente fuera
  del pooler.
- `AUTH_TYPE` no está configurado en el Compose actual: se hereda el default de
  la imagen y habría que fijarlo antes de ponerlo en la ruta de datos.

### Opción B — Retirar pgBouncer

Eliminar el servicio de los tres archivos de Compose y de `.env.example`, y
**reescribir la justificación** de `SET LOCAL search_path` en `AGENTS.md` y
`CLAUDE.md` para que se sostenga por sí misma: es la forma correcta de resolver
el schema del tenant por transacción, con o sin pooler.

**A favor**

- Elimina un componente sin consumidor y la contradicción documental de raíz.
- Reduce superficie: un servicio menos que endurecer, actualizar y auditar.

**En contra / riesgo**

- Reintroducirlo más tarde, con la plataforma en producción y más tenants, es
  más caro y más arriesgado que consumirlo ahora.
- Deja a PostgreSQL expuesto al agotamiento de conexiones a la escala objetivo,
  sin un plan alternativo declarado.

## Recomendación

**Opción A**, con la validación bajo carga como condición de entrada y no como
trabajo posterior. El motivo es de secuencia, no de preferencia: consumir el
pooler es reversible y el momento de menor coste es ahora, con el programa aún
sin producción ([ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) mantiene G7
diferido). Retirarlo también es reversible, pero su reintroducción caería en el
peor momento posible — con carga real y datos de tenants reales.

Si el CTO elige B, la reescritura de la justificación en `AGENTS.md` y
`CLAUDE.md` es **parte inseparable** de la decisión, no un seguimiento opcional.

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | **Alto en ambas opciones.** No cambia el aislamiento por schema, pero sí la ruta por la que se resuelve el `search_path` del tenant. La opción A exige demostrar que ningún estado de sesión sobrevive entre transacciones |
| **Seguridad** | Opción A añade un salto con credenciales propias y `AUTH_TYPE` por fijar. Opción B reduce superficie. Ninguna altera el modelo de permisos SEC-04 |
| **Escala** | Es el eje de la decisión. Sin pooler, el límite de conexiones de PostgreSQL se alcanza antes que cualquier límite de la aplicación |
| **Regulación** | Sin impacto. Ninguna obligación de CRC, DIAN, MinTIC ni Ley 1581 depende de esta elección |
| **Autoridad** | Cambio de topología de acceso a datos: **decisión del CTO** |

## Criterio de verificación

**Si se aprueba A:**

1. `api-prod` y `worker-prod` conectan por `pgbouncer:6432`; el migrator sigue en
   `postgres:5432`.
2. `AUTH_TYPE` declarado explícitamente, no heredado del default de la imagen.
3. Auditoría de código: ninguna sentencia `SET search_path` sin `LOCAL`, ningún
   advisory lock de sesión, ningún prepared statement con nombre entre
   transacciones.
4. Suite E2E completa en verde **con el tráfico pasando por el pooler**.
5. `AGENTS.md` y `CLAUDE.md` conservan la regla y su justificación pasa a ser
   verificable contra el runtime.

**Si se aprueba B:**

1. `pgbouncer` no aparece en ningún Compose ni en `.env.example`.
2. `AGENTS.md` y `CLAUDE.md` justifican `SET LOCAL search_path` sin mencionar
   pgBouncer.
3. Queda registrada como deuda declarada la ausencia de estrategia de pooling a
   la escala objetivo.

## Referencias

- [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A1, §6 propuesta 15
- `docker-compose.yml:78-99` — definición del servicio
- `docker-compose.prod.yml:100`, `:229`, `:280` — los tres consumidores que lo esquivan
- `AGENTS.md:124`, `:254` · `CLAUDE.md:111` — la premisa a corregir
- [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) — G7 diferido; hoy no hay producción que interrumpir
