# ADR-106: Actor mínimo en puertos y servicios; el token JWT se queda en el borde HTTP

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-11-08 — §6 completo: D1–D5 tal como están, regla ESLint en etapa 1 con estrategia incremental en etapa 2, y etapa 1 como encargo aparte de H-EXP
**Fecha:** 2026-11-08
**Autor:** AI-EM-ARCH
**Modo activo:** Architect
**Módulos:** `apps/api` — `auth` (dueño de `JwtPayload`), `inventory` (MOD12), `tasks` (MOD11), `wfm`, y por extensión todo servicio que reciba `actor`
**Relacionado:** [ADR-097](ADR-097-Puertos-de-lectura-para-avisos-de-terminacion-MOD05.md) (puertos de lectura entre módulos) · [ADR-105](ADR-105-Jobs-de-Dominio-Procesados-en-la-API.md) (consumidores de dominio en la API) · [spec MOD11↔MOD12 consumo de inventario](../specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md) D9 · [INFORME-MOD11-MOD12-INVENTARIO-G1-SR-FULL-v1.0](../informes/INFORME-MOD11-MOD12-INVENTARIO-G1-SR-FULL-v1.0.md)
**Origen:** análisis de grafo de `apps/` (graphify, 2026-11-08) y revisión de boundaries (`boundary-reviewer`, mismo día). `JwtPayload` resultó ser el nodo más conectado del backend (667 aristas, 69 comunidades) porque baja de los controladores a servicios y puertos entre módulos.

---

## 1. Contexto

`JwtPayload` (`apps/api/src/modules/auth/interfaces/jwt-payload.interface.ts`) describe el token RS256: `sub`, `email` (hash), `role`, `tenantId`, `schemaName`, `jti`, `type`, `scope`, `iss`, `aud`, `iat`, `exp` y `passwordResetRequired`. Es un contrato de transporte y de seguridad del módulo `auth`.

Uso medido el 2026-11-08 en `apps/api/src`:

| Medida | Archivos |
| --- | --- |
| Importan `jwt-payload.interface` | 208 |
| … fuera de `modules/auth` | 190 |
| … fuera de `auth`, sin contar specs | 70 |
| … de esos, servicios, puertos o adaptadores | 28 |

Tres puertos entre módulos exponen el token completo en su firma:

| Puerto | Define | Consume | Campos de `actor` que se leen |
| --- | --- | --- | --- |
| `InventoryMovementPort` (`inventory/ports/inventory-movement.port.ts:30,48`) | inventory | tasks (`execution-order-inventory.service.ts:38`) | solo `sub` |
| `ExecutionOrderSchedulingPort` (`tasks/ports/execution-order-scheduling.port.ts:31,39,47,57`) | tasks | wfm (`schedule-events.service.ts`, `visit-requests.service.ts`) | `sub` en los métodos del puerto |
| `WfmOrganizationSitesReadPort` (`wfm/ports/wfm-organization-sites-read.port.ts:5`) | wfm | wfm (intramódulo) | solo `tenantId` |

Hechos relevantes:

1. **No hay violación de regla escrita.** `AGENTS.md` (Architecture → Modulith) exige comunicación por interfaces tipadas, sin imports circulares. Ninguna regla, ADR ni HLD dice si `auth/interfaces` puede importarse desde otros módulos, y `eslint.config.js` no tiene reglas de boundaries. Hoy funciona como núcleo compartido *de facto*, sin norma.
2. **No hay fuga de tenancy.** El adaptador WFM pasa `actor.tenantId` a organization, que lo compara con `TenantContext` y lanza `TENANT_CONTEXT_MISMATCH` si difieren (`organization.service.ts:485-492`). El schema sale de `ctx.schemaName`. En inventario, tenant y schema salen de `TenantContext`. Aun así, leer el tenant del token es un patrón que conviene cerrar antes de que se copie a un sitio sin esa verificación cruzada.
3. **La deuda ya estaba registrada.** El informe G1 de MOD11↔MOD12 pidió «un principal interno mínimo» y «no fabricar claims de email/rol/JWT para el job». La respuesta parcial fue `Pick<JwtPayload, 'sub'>`, repetido cuatro veces en línea en `stock-ledger.service.ts` (272, 727, 743, 927) sin tipo nombrado. El processor de inventario ya llama con `{ sub: payload.actorUserId }`.
4. **Ningún CLI ni worker fabrica un `JwtPayload`.** `apps/worker/src` y `apps/api/src/cli` no lo mencionan. El acoplamiento aún es barato de cortar.
5. **Dos defectos de pureza de puerto, encontrados en la misma revisión:**
   - `execution-order-scheduling.port.ts:4` importa `CreateExecutionOrderFromSchedulingInput` desde `../services/execution-orders.service`. Así, wfm depende de un tipo interno del servicio de tasks.
   - `inventory-movement.port.ts` define el puerto y su adaptador en el mismo archivo, e importa `StockLedgerService` e `InventoryItemService` (`:4-5`).

Costo de no decidir: cada cambio en el token obliga a revisar inventario, tareas y WFM. Así ocurrió con `scope` (`mfa-setup`, `password-change`) y con `iss`/`aud`. Además, un futuro llamador no HTTP de estos puertos (consumidor BullMQ según ADR-105, o CLI) tendría que fabricar un token. Por último, los puertos reciben `email`, `jti` y `scope`, que no necesitan.

## 2. Decisión

### D1 — `JwtPayload` es un tipo del borde HTTP

`JwtPayload` solo se usa en la capa que recibe la petición:

- controladores;
- guards, estrategias Passport, decoradores (`@CurrentUser`) e interceptores;
- el módulo `auth`;
- los specs que prueban esas piezas.

**No** aparece en la firma de un puerto (`**/ports/**`), ni en la firma pública de un servicio que otro módulo consuma a través de un puerto.

`auth/interfaces` **no** se declara núcleo compartido. Importarlo desde otro módulo es legítimo solo en el borde HTTP de ese módulo.

### D2 — Tipo nombrado `ActorRef` para la identidad del actor

Se crea en `apps/api/src/common/actor/actor-ref.ts`:

```ts
/** Identidad mínima de quien ejecuta una acción, independiente del transporte. */
export interface ActorRef {
  /** UUID del usuario (User o PlatformUser). */
  readonly sub: string;
}

/** Solo para operaciones cuya regla de negocio depende del rol. */
export interface ActorRefWithRole extends ActorRef {
  readonly role: string;
}
```

Reglas:

- **Interfaz propia, no `Pick<JwtPayload, …>`.** Así el puerto deja de depender de `auth`. `JwtPayload` la satisface de forma estructural, y los controladores siguen pasando `user` sin conversión.
- **Vive en `apps/api/src/common`, no en `@iwana/shared`.** Es un tipo interno de la API, no un contrato entre apps. Si un día lo necesita `apps/worker`, se mueve con una enmienda a este ADR.
- **`ActorRefWithRole` solo cuando la regla de negocio depende del rol.** No sustituye a `@Roles()` ni a `@Permissions()`, que siguen en el borde.
- **Se prohíbe añadir `tenantId`, `schemaName`, `email`, `jti` o `scope` a `ActorRef`** (ver D3).

### D3 — El tenant nunca se lee del actor

Un puerto o servicio obtiene tenant y schema de `TenantContext`, o de un parámetro `tenantId` explícito que el consumidor tomó de `TenantContext`, como ya hace `ExecutionOrderSchedulingPort`. Nunca de `actor.tenantId` ni de `actor.schemaName`.

Consecuencia directa: `WfmOrganizationSitesReadPort.listDispatchSites(actor)` pasa a `listDispatchSites()`, y el adaptador toma el tenant de `TenantContext`.

### D4 — Pureza del archivo de puerto

Un archivo de `**/ports/**` declara el token de inyección, la interfaz o clase abstracta y los tipos de entrada y salida del puerto. Solo importa de:

- `@iwana/shared`;
- `typeorm` (únicamente `EntityManager`, para puertos transaccionales ya existentes);
- `common/` (incluido `ActorRef`);
- otros archivos de `ports/`.

No importa de `../services/`, ni de entidades o DTOs internos, ni de `auth/`. El adaptador vive en su propio archivo (`*-port.adapter.ts` o `adapters/`).

### D5 — Cumplimiento automático

Se añade a `eslint.config.js` una regla `no-restricted-imports` sobre `apps/api/src/**/ports/**/*.ts` que prohíbe:

- `**/auth/interfaces/jwt-payload.interface`;
- `**/services/**`.

La extensión a servicios (`**/services/**/*.ts`, `*.service.ts`) queda en una segunda etapa: arranca con una lista de excepciones que se vacía módulo a módulo (ver §5). Sin esta regla, la decisión depende de la memoria de quien revise. Así se acumularon los 70 archivos actuales.

## 3. Alternativas consideradas

| Alternativa | Por qué no |
| --- | --- |
| **A. Declarar `auth/interfaces` núcleo compartido** y dejar todo como está | Legaliza el acoplamiento sin reducirlo. Los puertos seguirían recibiendo `jti`, `scope` y `email`, y un llamador no HTTP seguiría teniendo que fabricar un token. Contradice lo que ya pidió el informe G1 de MOD11↔MOD12. |
| **B. Mover `JwtPayload` a `@iwana/shared`** | Lo convierte en contrato entre apps cuando es un detalle de seguridad de la API, y expone la forma del token a `apps/portal` y `apps/web`. No resuelve el exceso de campos en los puertos. |
| **C. Nombrar `ActorRef = Pick<JwtPayload, 'sub'>`** | Mejor que el `Pick` en línea, pero mantiene la dependencia de `auth` en cada puerto: el tipo sigue derivándose del token. |
| **D. Un `ActorContext` rico** (sub, role, tenantId, permisos) propagado como `TenantContext` | Más invasivo, duplica `TenantContext` y vuelve a meter el tenant en el actor, que es justo lo que D3 cierra. Puede reconsiderarse si aparece una necesidad real de permisos dentro del dominio. |

## 4. Consecuencias

**Positivas**

- Los tres puertos dejan de depender de `auth` y de la forma del token.
- Un consumidor BullMQ en la API (ADR-105) o un CLI puede llamar a un puerto con `{ sub }` sin fabricar claims.
- Se cierra el patrón «tenant desde el token» antes de que se copie.
- `stock-ledger.service.ts` reemplaza 4 `Pick` en línea por un tipo nombrado.
- La regla ESLint convierte la norma en gate verificable («No boundary violations»).

**Negativas / costos**

- Cambian las firmas de 3 puertos, sus 3 adaptadores o implementaciones y sus llamadores: tasks → inventory, wfm → tasks y `wfm.controller.ts`.
- `InventoryMovementPort` está en el camino MOD11↔MOD12. Hay que mantener verde la matriz motivo → test integrado contra Postgres y Redis reales (norma del CTO del 2026-10-08, skill `iwana-matriz-motivos`).
- Los specs que construyen un `JwtPayload` completo para llamar a esos puertos pueden simplificarse, pero no están obligados: el tipo estructural los sigue aceptando. Cualquier spec cuyo fixture cambie pasa por `test-change-reviewer`.
- La etapa 2 (servicios) toca ~26 servicios. Por eso se hace de forma incremental y no en una sola ola.

**Fuera de alcance**

- Mínimo privilegio de datos en el token mismo (por qué lleva `email` hash, `jti`, etc.). Se deriva a `sec-eng` como nota aparte.
- Cambiar `@Roles()`, `@Permissions()` o `@CurrentUser()`.

## 5. Plan de adopción

| Etapa | Alcance | Criterio de cierre |
| --- | --- | --- |
| **1 — Puertos** (una ola) | Crear `common/actor/actor-ref.ts`. Migrar las firmas de los 3 puertos a `ActorRef`. Aplicar D3 a `WfmOrganizationSitesReadPort` y D4 a los dos puertos impuros (extraer el adaptador de inventario a su propio archivo; mover `CreateExecutionOrderFromSchedulingInput` a `tasks/ports/`). Regla ESLint sobre `**/ports/**`. | Typecheck y lint verdes. Suites de `inventory`, `tasks` y `wfm` sin caché de Turbo y con conteo no inferior a la línea base. Matriz MOD11↔MOD12 completa en verde. `boundary-reviewer` sin hallazgos en los 3 puertos. CI de `main` verde. |
| **2 — Servicios** (incremental) | Ampliar la regla ESLint a servicios con una lista de excepciones inicial de los ~26 servicios actuales. Cada ola que toque un servicio de la lista lo migra y lo saca de la lista. | La lista de excepciones solo decrece y se reporta en el informe de cada ola. Se cierra cuando queda vacía. |

La etapa 1 no requiere migraciones de base de datos ni cambia la API HTTP ni OpenAPI.

## 6. Decisión del CTO

**Aprobado el 2026-11-08** en los tres puntos siguientes, tal como se propusieron.

1. Aprobar D1–D4 tal como están, o elegir otra alternativa de §3.
2. Aprobar la regla ESLint de D5 en la etapa 1 (puertos) y la estrategia incremental con lista de excepciones para la etapa 2 (servicios).
3. Confirmar que la etapa 1 entra como encargo aparte y no se mezcla con el trabajo de privacidad en curso (H-EXP), que hoy tiene cambios sin commitear en `apps/api`.
