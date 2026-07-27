# INFORME — Gate cerrado: DEF-2 + Ola 1 de ADR-065

**Versión:** 1.5 · **Cierre definitivo de la serie de auditoría**
**Fecha:** 2026-07-24
**Modo activo:** **Architect + EM** (auditoría de gate, sin ejecución de código)
**Autor:** AI-EM-ARCH
**Antecedentes:** [v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) · [v1.1](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1.md) · [v1.2](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.2.md) · [v1.3](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.3.md) · [v1.4](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.4.md)
**Clasificación:** Uso interno

---

## Veredicto

| Gate | **v1.5** |
| --- | --- |
| Contenido de la Ola 1 | **GO** |
| DEF-2 hotfix | **GO** |
| Escalaciones E-1…E-4 | **Cerradas** |
| Merge de la rama | **DESBLOQUEADO** |
| **Serie de auditoría** | **CERRADA — sin hallazgos abiertos** |

Las dos disposiciones de v1.4 están cerradas, y en el orden correcto. **No queda ningún hallazgo, de ninguna severidad, pendiente de esta serie.**

---

## 1. Disposiciones de v1.4 — verificación

| # | Acción | Estado | Evidencia verificada |
| --- | --- | --- | --- |
| 1 | R-14 estabilizar los dos specs del portal | **Cerrada** | `apps/portal/jest.config.js` añade `testTimeout: 15000` y `maxWorkers: '50%'`, con el porqué citado en comentario. **Corregido al nivel correcto**: la configuración, no los dos specs — los archivos de prueba siguen intactos, así que la protección cubre las 157 suites y no solo las dos que fallaron |
| 2 | R-13 paso `pnpm test` en el CI | **Cerrada** | `ci.yml:122-123` — paso «Unit tests» tras `Build` y antes de los pasos de PostgreSQL y migraciones, exactamente donde lo recomendé. La cabecera `:3` declara el alcance: «`pnpm test` (turbo) es gate rojo; **sin umbral cobertura 80% en este paso**» |

**La secuencia se respetó.** Pedí explícitamente cerrar R-14 antes de adoptar R-13, para que el nuevo gate no naciera intermitente. Ambos cambios llegan juntos y con la estabilización en su sitio, así que el paso de CI arranca sobre una suite ya estable.

La nota de alcance de `ci.yml:3` es la manera correcta de cerrar esto: el paso ejerce el gate «suite verde», **no** el de cobertura, y lo dice en vez de dejarlo implícito. La cobertura ≥80% de `AGENTS.md` sigue sin enforcement automático — como deuda declarada, no como omisión.

---

## 2. Compuertas ejecutables — pipeline completo

| Compuerta | Resultado |
| --- | --- |
| `pnpm lint` | **Verde** — 8/8 |
| `pnpm typecheck` | **Verde** — 8/8 |
| `pnpm build` | **Verde** — 7/7 |
| **`pnpm test`** (lo que ejecuta el paso nuevo del CI) | **Verde** — **9/9 tareas** |
| `@iwana/api` | 204 suites · 2.305 tests |
| `@iwana/portal` | 157 suites · 830 tests |
| `@iwana/web` | 19 suites · 76 tests |
| `@iwana/worker` | 8 suites · 46 tests |
| `@iwana/db` | 1 suite · 6 tests |
| `@iwana/shared` | 1 suite · 4 tests |

**Verificación específica de R-14:** tres corridas completas consecutivas del portal tras el arreglo —una dentro de `pnpm test` y dos aisladas— **157/157 suites y 830/830 tests en las tres**. Antes del arreglo la misma suite alternaba entre roja y verde. La inestabilidad no se observa más.

**Corrección al registro de esta ronda.** Mi primera lectura de `pnpm test` dio rojo en `@iwana/shared` (`Cannot find module .../jest/bin/jest.js`). No es un defecto del repositorio: `jest`, `ts-jest` y `@types/jest` están declarados en el `package.json` de ese paquete —sin cambios respecto a `HEAD`— y presentes en `pnpm-lock.yaml`; lo que estaba desactualizado era mi `node_modules` local. `pnpm install --frozen-lockfile` —el mismo comando que usa el CI— lo resolvió, y el paquete pasa. **No hay hallazgo.** Lo dejo escrito porque el modo de fallo es indistinguible de un defecto real hasta que se comprueba el lockfile.

---

## 3. Observación menor — sin disposición

`turbo.json` declara `outputs: ["coverage/**"]` para la tarea `test`, pero ningún paquete ejecuta jest con `--coverage`, así que cada corrida emite cinco avisos de «no output files found» y los resultados se cachean sin artefacto.

Es cosmético hoy. Lo anoto porque **ese es exactamente el enganche donde se colgaría el umbral de cobertura del 80%** el día que se decida ejercerlo: la tarea ya está declarada para producir `coverage/**`, solo falta que lo produzca. Va con la deuda de cobertura, no como trabajo propio.

---

## 4. Deuda declarada que sobrevive al cierre

Toda con destino asignado; ninguna abierta contra este gate.

| Deuda | Destino |
| --- | --- |
| 31 endpoints sin envelope `ListMeta` | Olas 5-7 (Decisión 1 de v1.0) |
| Test de orden por recurso con `sortableFields` poblado | Stop/go de la Ola 2 (R-5) |
| Índices `089_pagination_ordering_indexes.ts` | Ola 2 |
| Umbral de cobertura ≥80% sin enforcement | Propuesta propia, con el `--coverage` de §3 |
| HMAC con pepper para las dos columnas de hash de documento | Propuesta futura, decisión única para `subscribers` y `expediente_records` |

---

## 5. Cierre de la serie

| Ronda | Bloqueante | Cerrado en |
| --- | --- | --- |
| v1.0 | O-7(b) orden sobrescrito · DEF-1 sin ejecutar · H-1 sin tope de `limit` | v1.1 |
| v1.1 | R-1 suite roja · R-3 backfill sin ruta de ejecución | v1.2 |
| v1.2 | R-6 clave ausente en el job de CI | v1.3 |
| v1.3 | R-10 directivas de lint inválidas | v1.4 |
| v1.4 | R-13 CI sin pruebas · R-14 specs inestables | **v1.5** |
| v1.5 | — | — |

Cinco rondas. El bloqueante se corrió hacia afuera en cada una —del contrato al doble de prueba, al entorno del job, al lint del monorepo, al pipeline mismo— hasta que en v1.4 el propio pipeline entró en el alcance de la auditoría y dejó de haber capa siguiente.

La lección que queda escrita para las olas 2 a 7 tiene dos mitades, y la segunda es la que esta serie tuvo que aprender a la fuerza:

1. **El stop/go nombra los comandos de la raíz**, no los del paquete tocado (v1.3).
2. **El pipeline que los ejecuta es parte del entregable, no del entorno** (v1.4).

R-13 cierra las dos: a partir de esta rama, «suite verde» deja de ser una afirmación que alguien sostiene y pasa a ser una condición que el repositorio comprueba.

**Gate cerrado. La Ola 2 puede abrirse** — su primer entregable sigue siendo el que fijó el plan: la migración `089_*` de índices, sobre el runner de ADR-066 que ya está implementado.
