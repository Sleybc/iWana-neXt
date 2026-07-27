# INFORME-ADR065-DISPOSICION-EJECUTADA-v1.0

**Programa:** ADR-065 (Olas 0-7) + DEF-2 — ejecución de la disposición de la auditoría de cierre
**Modo:** AI-EM-ARCH Orchestrator + Architect — **orquestación, review de segunda capa y verificación por ejecución propia**
**Fecha:** 2026-07-27
**Contrato:** [INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0](./INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0.md) — sus 5 puntos de Disposición
**Prompt de ejecución:** [PROMPT-ADR065-DISPOSICION-AUDITADA-v1.0](../prompts/PROMPT-ADR065-DISPOSICION-AUDITADA-v1.0.md)
**Agentes desplegados:** AI-SR-FULL · AI-PLAT-OPS · AI-SR-QA · AI-DS-OWNER (protocolo §3bis, ola 1 paralela)

---

## Veredicto

# GO — los 5 puntos de la Disposición se cierran · 2 hallazgos nuevos · 2 verificaciones imposibles en este entorno

Los cinco puntos están entregados y **verificados por ejecución propia, no por lectura**. Las dos pruebas de mutación que el informe auditado exige —«ningún test se acepta como regresión sin demostrar que falla al reintroducir el defecto»— **se hicieron y están abajo con su salida**.

Dos cosas que este informe añade y que la auditoría no vio, y dos que no pude verificar aquí.

---

## Verificación por ejecución (AI-EM-ARCH)

Todo lo de esta sección lo ejecuté yo en esta sesión.

### Compuertas

| Compuerta | Resultado |
| --- | --- |
| `pnpm typecheck` | **Verde** |
| `pnpm lint` | **Verde** |
| `pnpm test` — corrida 1 | **Verde** — 9/9 tareas, 56,1 s (7 de 9 desde caché de turbo) |
| `pnpm test` — corrida 2 (`TURBO_FORCE`) | **Verde** — 9/9 tareas, **`Cached: 0 cached, 9 total`**, 1 m 12,2 s |
| `pnpm test` — corrida 3 (`TURBO_FORCE`) | **Verde** — 9/9 tareas, **`Cached: 0 cached, 9 total`**, 1 m 23,6 s |
| `pnpm --filter @iwana/db test` | **Verde** |
| `node scripts/audit-adr-citations.mjs` | **Verde** — `BLOQUEANTE: 0` (antes: 66, ver A-5) |

**Las corridas 2 y 3 son ejecución real, no caché.** Es la distinción que faltaba en los dos cierres anteriores de R-14: una segunda corrida verde de turbo sin forzar puede ser simplemente el mismo resultado servido de caché, y eso no es evidencia de determinismo. Con `Cached: 0` sí lo es.

### Pruebas de mutación

Este es el criterio que el informe auditado convirtió en regla. Las dos que ejercité:

**1 · `clamp-page-endpoints.controller.http.spec.ts` (E-2)**

Sustituí en `apps/api/src/modules/parties/services/party.service.ts:95` la llamada `clampPage(...)` por la lectura directa de `dto.page` / `dto.limit`:

```
● clampPage en endpoints … › parties — GET /api/v1/parties › responde 400 con el mensaje de clamp-page cuando page × limit excede la cota
● clampPage en endpoints … › parties — GET /api/v1/parties › rechaza antes de tomar una conexión del pool (DEF-2)
Test Suites: 1 failed, 1 total
Tests:       2 failed, 19 passed, 21 total
```

Tras restaurar: `Tests: 21 passed, 21 total`.

**El test muere exactamente por el motivo para el que existe, y solo en el módulo mutado.** Los otros cuatro siguen verdes, así que la señal localiza el defecto en vez de teñir la suite. Esto cierra G-6, pendiente desde la Ola 1.

**2 · `aria-busy-contrast.structure.spec.ts`**

Reintroduje `opacity-60` en el contenedor `aria-busy` de `SubscribersListClient.tsx:451`:

```
● contrato de estados atenuados — regla estructural §7.2 › ninguna etiqueta con aria-busy lleva una clase opacity-*
    + "components\crm\subscribers\SubscribersListClient.tsx :: <div className={ refreshing ? `overflow-x-auto opacity-60 ${portalDataBusyRegionClassName}` … aria-busy={refreshing || u"
Tests:       1 failed, 2 passed, 3 total
```

Tras restaurar: `Tests: 3 passed, 3 total`.

Falla nombrando archivo y etiqueta infractora. **Y no necesita navegador**, así que no puede ser flaky — es la única compuerta de este contrato que es inmune al problema que A-1 denuncia. Lleva además guardia anti-vacío (`busyTagsFound > 0`), sin la cual la regla pasaría en falso si la expresión dejara de ver las regiones.

---

## Estado por entregable

| # | Entregable | Estado | Evidencia |
| --- | --- | --- | --- |
| **E-1** | Integración de `089` contra schema real | **Entregado · no ejecutable aquí** | 13 tests: anti-BL-1 (`up()` no lanza — el defecto era de runtime), anti-D-1 (índice señuelo creado en un segundo schema y **no visto** desde el primero), `down()`, idempotencia de `up()`, whitelist. Camino de skip verificado |
| **E-2** | Endpoint que muere sin `clampPage` | **Cerrado y mutado** | 5 controladores de 5 módulos vía `describe.each`; control positivo en el borde `page=99 limit=100`; asserta además que no se toma conexión del pool |
| **E-3** | Determinismo de `pnpm test` | **Cerrado** | `turbo run test --concurrency=1`; 3 corridas verdes, 2 sin caché |
| **E-4** | Flake de axe medido | **Entregado · E2E no ejecutable aquí** | Test permanente del estado `refreshing`; temporal eliminado; techo `<= 3` de modo oscuro retirado a `toEqual([])` |
| **E-5** | Registro DS de D-3 + contrato | **Cerrado** | [Contrato de estados atenuados](../specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md), 290 líneas con ratios medidos |
| **E-6** | Corrección del contraste | **Ejecutado — fuera de la secuencia que autoricé** (ver A-6) | 11 pantallas + 8 filas inactivas + `Sidebar` + `ContractCard` |
| **E-7** | Trazabilidad de autoría (A-4) | **Cerrado** | [Ronda 3 corregida](./INFORME-ADR065-REGATE-RONDA3-v1.0.md) — autoría por dueño RACI de superficie |

### Lo que la auditoría pedía y ya no está pendiente

- **BL-1 y D-1 dejan de depender de mocks.** El punto 2 de la Disposición se cumple: existe un spec que ejecuta `up()` contra PostgreSQL real y que, para D-1, falla **por resultado** —un índice de otro schema no debe verse— y no por inspeccionar la cadena SQL. Es la diferencia entre `sql.toContain('pg_namespace')` y comprobar que el filtro filtra.
- **La cota de página deja de ser un helper con fe.** Punto 3 cumplido y mutado.
- **La CI deja de tener una compuerta incapaz de fallar.** El paso nuevo de `ci.yml` no se conforma con el exit code: si la suite de integración se omite por falta de base, el paso se pone **rojo** (`grep "SUITE OMITIDA"`), porque en CI la base siempre está y un skip ahí es fallo de infraestructura, no una nota informativa. Lo verifiqué: el centinela lo emite el `globalSetup` y el guard lo encuentra.

---

## Hallazgos nuevos

### A-5 · ALTA · El job `adr-citations` de CI estaba rojo en `main` — corregido

`.github/workflows/ci.yml:33` ejecuta `node scripts/audit-adr-citations.mjs` sin `continue-on-error`. Al correrlo: **exit 1, 66 defectos bloqueantes.**

Es la tesis del informe auditado un grado más arriba. A-1 dice que una compuerta intermitente no es compuerta; aquí hay una compuerta **establemente roja** que ningún informe de gate menciona: el informe auditado enumera cinco compuertas y **esta no está entre ellas**. Se firmó el cierre sin ejecutar precisamente el validador que [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §5 creó para hacer exigible que «una cita que no resiste apertura es defecto bloqueante».

**Causa raíz: dos líneas de cabecera, no 66 defectos.**

| ADR | Estado declarado | Efecto |
| --- | --- | --- |
| `ADR-064` | `Aprobado — superado parcialmente por [ADR-065] … en §§2, 3, 5 y 9` | Fuera del vocabulario canónico → las **60** citas de ADR-064 del repo se invalidan en cascada |
| `ADR-062` | `Aceptado` | Sinónimo no canónico → 6 más |

Ambos casos son el mismo error: **información correcta escrita en un campo que no la admite.** ADR-064 metió la genealogía dentro del campo de estado; ADR-062 usó un sinónimo. El validador solo acepta `Aprobado · En revisión · Propuesto · Superado`, y hace bien: un estado libre no es verificable por máquina.

**Corrección aplicada:** la supersesión de ADR-064 pasa a línea propia (`**Superado parcialmente por:**`), preservando íntegro el hecho y la referencia; `ADR-062` pasa a `Aprobado`. Resultado: `BLOQUEANTE: 0`.

**Requiere decisión del CTO —** el cambio de `Aceptado` → `Aprobado` en ADR-062 es normalización de vocabulario, no una aprobación nueva: su propia cabecera ya registra la decisión CTO (`D-2=A`) y el GO de plataforma. Si el criterio es el contrario —que el vocabulario admita «Aceptado»—, lo que se corrige es el validador y no el documento. No decido esto: lo escala este informe.

### A-6 · MEDIA · Se ejecutó una ola que no autoricé, por el mismo mecanismo que A-3 y A-4

Emití la ola 1 con fronteras explícitas: **DS-OWNER define contrato y no escribe código; SR-QA mide y no toca componentes; FE-PLATFORM implementa en la ola 2, cuando exista la medición.** En disco hay corrección de componentes en 11 pantallas, en `portal-ui.tsx`, en `Select.tsx` (variante oscura), en `Sidebar.tsx` y en `ContractCard.tsx`.

**El trabajo es correcto, es coherente con el contrato y lo verifiqué:** typecheck, lint y las tres corridas de `pnpm test` están verdes con esos cambios dentro, y la regla estructural que los protege pasa su prueba de mutación. No propongo revertir nada.

Lo registro igual, porque es la **tercera aparición del mismo patrón en tres informes consecutivos**: A-3 (cambio en `@iwana/ui` sin pasar por DS-OWNER), A-4 (código atribuido a un rol que no puede escribirlo) y ahora A-6. Bajo presión de cierre, el agente que tiene el contexto ejecuta y la frontera de rol se disuelve. El coste no se paga en el momento —el código está bien las tres veces— sino en el gate siguiente, cuando ya no se puede reconstruir quién responde por qué.

**Distinción que sí importa:** A-6 no es equivalente a A-3. En A-3 el cambio se hizo **sin contrato**; aquí se hizo **contra un contrato recién escrito, medido y localizable**. Es una violación de secuencia, no de gobierno. Por eso es MEDIA y no ALTA.

### Corrección a mi propio análisis

El prompt de la etapa 4 que emití señalaba `disabled:opacity-50` en los botones del pager (`portal-ui.tsx:190`, `:693`) como el candidato natural del flake de contraste. **AI-DS-OWNER lo desmintió leyendo el código, y tiene razón:** esa variante solo se activa con el atributo `disabled` nativo, y `axe-core` excluye los controles deshabilitados del criterio 1.4.3. El defecto real era `opacity-60` sobre el contenedor `aria-busy` que envuelve la tabla, replicado **literalmente en 11 pantallas** — celda `gray-700` a **3,34:1**, línea secundaria `gray-500` a **2,32:1**, en oscuro `gray-400` a **3,11:1**.

Apunté al primitive; el defecto estaba en las once copias de la receta. La consecuencia de fondo la formula el contrato mejor de lo que la formulé yo: el contrato de paginación autorizó «la señal es el contenido atenuado» **sin medir qué le hace `opacity` a un subárbol de texto**, y once pantallas ejecutaron esa autorización al pie de la letra. La regla que queda —*una receta de estado que no trae su contraste medido no es un contrato, es una sugerencia*— vale más que la corrección que la originó.

---

## Lo que NO pude verificar en este entorno

Se declara, no se firma.

| Qué | Por qué | Dónde se verifica |
| --- | --- | --- |
| Ejecución real de la suite de integración de `089` | **Docker no está levantado** en esta máquina: sin PostgreSQL alcanzable. Verifiqué el camino de skip (13 tests declarados, aviso ruidoso, centinela `SUITE OMITIDA` emitido) pero **no la ejecución contra base real** | Primer push: el paso nuevo de `ci.yml`, que es rojo si se omite |
| E2E de a11y (`portal-pager-a11y.spec.ts`) | Requiere dev server del portal | `pnpm test:e2e:portal` con el entorno arriba |

**Consecuencia honesta:** la afirmación «BL-1 y D-1 ya no pueden volver» **todavía no está probada por ejecución**, solo por construcción. Lo estará en la primera corrida de CI. Es exactamente el tipo de matiz que este programa lleva tres gates atropellando, y no lo voy a atropellar yo en el cuarto.

---

## Deuda viva al cierre de esta disposición

Sin dueño ni fecha, arrastrada y **no** cerrada aquí:

**N-4** (39 dependencias de hooks expuestas en `warn`; con `--max-warnings 0` el lint vuelve a rojo) · **N-5** (`it.skip` en `InventoryClient.spec.tsx:1862`) · **N-9** (informe de remediación con salida literal por tramo) · **N-10** (código muerto) · **G-1 parcial** (auditoría, timeline, notificaciones y cola de visitas sin emitir `randomAccess: false`) · **medición del fan-out de N-3** · **medición de p95** que sostiene `randomAccess` y la lista blanca de orden.

Añadida por el contrato de estados atenuados, registrada y no ordenada: valores de marca en hex crudo contra ADR-056 §3 (`auth-form-styles.ts:36`, `MultiSelect.tsx:219`, `SubscribersListClient.tsx:457`), y tres casos marcados «verificar» en su §5 (`VisitRequestRecommendationPanel.tsx:1089`, `ScheduleCalendar.tsx:1259`).

---

## Decisiones del CTO

### 1 · A-5 · vocabulario de estado — **RESUELTA (CTO, 2026-07-27): se mantiene la normalización**

Opciones planteadas: normalizar el documento o ampliar el validador para admitir sinónimos. **El CTO acoge la recomendación: se mantiene la normalización y el vocabulario permanece cerrado.**

**La decisión tiene precedente aprobado, verificado después de emitirla.** [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) ya registra el caso idéntico en su tabla de defectos: «`ADR-043` con estado "Aceptado", fuera del vocabulario canónico → Normalizado a **Aprobado**, sin cambio de contenido ni fecha». Es decir: no era una decisión nueva, era **el remedio ya documentado aplicado por segunda vez**. Que ADR-062 haya reincidido dos meses después con el mismo sinónimo indica que el remedio se aplicó al caso y no a la causa.

Convención de registro que este informe respeta: ADR-056 anotó la normalización de ADR-043 **en el artefacto de gobierno, no dentro del ADR normalizado**. Por eso ADR-062 y ADR-064 no llevan nota interna: la traza vive aquí.

### 2 · Verificación de alcance tras la decisión — sin bombas latentes

Barrí los **52 ADR** del repo con la lógica de estado del propio validador. Resultado: **todos con estado canónico**. No queda ningún ADR que ponga la CI en rojo en cuanto alguien lo cite.

Corrección de método que corresponde declarar: mi primera pasada reportó **cinco falsos positivos** (ADR-028, 029, 030, 031, 036) porque reimplementé solo uno de los dos patrones que el validador acepta — declaran su estado en frontmatter YAML (`status: "Aprobado"`), no en `**Estado:**`. Es la regla del protocolo §7.4 sobre cómo describir un negativo: afirmar que algo *no* está exige recorrer todos los caminos. Recorrí uno y casi escalo cinco ADR sanos.

### 3 · Recomendación abierta, no ejecutada

El validador solo comprueba el estado de los ADR **que alguien cita**. Un ADR con estado roto y sin citas no dispara nada hasta que se le cita — que es justo cómo ADR-064 acumuló 60 defectos de golpe el día que el programa empezó a citarlo. Hoy es inocuo (cero no canónicos), pero el hueco de diseño sigue ahí.

Cerrarlo es barato: un barrido de estados de todos los ADR, independiente de las citas. **No lo implemento** porque amplía el alcance de un job de CI y eso es de AI-PLAT-OPS con tu visto bueno, no una consecuencia de la decisión que acabas de tomar.

### 4 · Nada más. No hubo cambio de stack, boundary, tokens de marca ni excepción de seguridad. Impacto multi-tenant: ninguno —`089` refuerza el aislamiento por schema en vez de relajarlo—. Impacto regulatorio: ninguno. Escala: la cota de `clampPage` ahora tiene red en 5 módulos, lo que protege el pool compartido de pgBouncer bajo miles de tenants, que era el motivo de DEF-2.

---

## Nota de proceso

La auditoría cerró con dos frases: *tests que no pueden fallar por la razón para la que existen*, e *infraestructura de pruebas no determinista*. Esta disposición ataca ambas y añade una tercera que ninguna de las dos anteriores vio: **compuertas que nadie ejecuta**. La de citas ADR llevaba roja en `main` un tiempo indeterminado y no aparece en ningún informe de gate — no falló de forma intermitente, no falló en absoluto, porque nadie la corrió.

De las tres, la única que se resuelve escribiendo código es la primera. Las otras dos se resuelven ejecutando lo que ya existe y mirando el resultado.

Y una advertencia sobre esta firma. Verifiqué siete compuertas y dos pruebas de mutación con su salida literal, pero **dos verificaciones quedan fuera de esta máquina**. Este informe vale para lo que ejecuté; para lo demás vale la CI. La diferencia entre ambas cosas está enumerada arriba a propósito, y no debe leerse como un trámite: es la única parte de este informe que el gate siguiente tiene que volver a mirar.
