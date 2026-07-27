# INFORME — Cierre de gate: DEF-2 + Ola 1 de ADR-065

**Versión:** 1.4 · **Cierre de la serie de auditoría**
**Fecha:** 2026-07-24
**Modo activo:** **Architect + EM** (auditoría de gate, sin ejecución de código)
**Autor:** AI-EM-ARCH
**Antecedentes:** [v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) · [v1.1](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1.md) · [v1.2](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.2.md) · [v1.3](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.3.md)
**Clasificación:** Uso interno

---

## Veredicto

| Gate | v1.3 | **v1.4** |
| --- | --- | --- |
| **Contenido de la Ola 1** | GO | **GO** |
| **DEF-2 hotfix** | GO | **GO** |
| **Escalaciones E-1…E-4** | Cerradas y ejecutadas | Cerradas |
| **Merge de la rama** | Bloqueado por R-10 | **DESBLOQUEADO** |

**Las seis disposiciones de v1.3 están cerradas.** No queda ningún hallazgo bloqueante. Los dos hallazgos nuevos de esta ronda son ambos **anteriores a esta rama** y transversales al repositorio; ninguno afecta al veredicto.

---

## 1. Disposiciones de v1.3 — verificación

| # | Acción | Estado | Evidencia verificada |
| --- | --- | --- | --- |
| 1 | R-10 borrar las tres directivas de lint | **Cerrada** | `grep react-hooks/exhaustive-deps` sobre `apps/web/src` y `apps/portal/src` → **cero resultados**. Los `useEffect` quedaron intactos, solo desapareció el comentario. `eslint-plugin-react-hooks` **no se instaló** — se respetó la restricción |
| 2 | R-11 mover el spec a `packages/database` | **Cerrada** | Vive en `packages/database/src/migrations/shared/backfill-…util.spec.ts`, junto a la utilidad que prueba. El import relativo de siete niveles desapareció |
| 3 | R-9 vector de ciphertext como dato | **Cerrada, exactamente como la reformulé** | Literal idéntico en ambos lados —`d55c0fcd…:d3e049c6…:27e5a87c…`— con el mismo `ACTIVE_HEX` y `R9_PLAINTEXT`; cada spec descifra con **su** implementación. Sin import cruzado |
| 4 | R-12 segunda causa en el mensaje del guardián | **Cerrada** | `backfill-…util.ts:214-215` — «clave de cifrado incorrecta **o** ciphertext(s) corrupto(s)/no descifrable(s)» |
| 5 | R-8 nota del umbral en `088_*` | **Cerrada** | Cabecera `:12-13` — «Umbral ~50.000 filas por tenant: considerar `transactional = false` + commit por lote (ADR-066)» |
| 6 | Correr el pipeline completo antes del PR | **Hecha** | §2 |

**Comprobación adicional sobre R-9.** Un vector de frontera que no se ejecuta es decoración, así que verifiqué que el spec corre de verdad y no lo absorbe el `--passWithNoTests` del paquete: `pnpm --filter @iwana/db test` → `PASS src/migrations/shared/backfill-…util.spec.ts`, **1 suite, 6 tests**.

---

## 2. Compuertas ejecutables — pipeline completo

| Compuerta | Resultado |
| --- | --- |
| `pnpm lint` (monorepo) | **Verde** — 8/8 tareas; queda solo el warning preexistente de `audit-query.service.spec.ts:41` |
| `pnpm typecheck` (monorepo) | **Verde** — 8/8 |
| `pnpm build` (monorepo) | **Verde** — 7/7 |
| `pnpm --filter @iwana/api test` | **Verde** — 204 suites, 2.305 tests |
| `pnpm --filter @iwana/db test` | **Verde** — 1 suite, 6 tests |
| `pnpm --filter @iwana/web test` | **Verde** — 19 suites, 76 tests |
| `pnpm --filter @iwana/portal test` | **Verde en la segunda corrida** — 157 suites, 830 tests. Ver R-14 |

---

## 3. Hallazgos nuevos — ninguno bloqueante, ninguno de esta rama

### R-13 · MEDIA (gobierno) · El pipeline de CI no ejecuta pruebas unitarias

`ci.yml` corre `sync:agents:check`, `lint`, `typecheck`, `build`, las migraciones pública y tenant y las compuertas de seguridad de base de datos. **No hay ningún paso que ejecute `pnpm test`.** Verificado por grep sobre los dos workflows del repositorio: el único que ejecuta pruebas es `e2e-web-admin-smoke.yml`, un smoke de Playwright sobre una sola ruta de administración.

Consecuencia: el stop/go de la Ola 1 —«suite de API verde»— y el merge gate de `AGENTS.md` —«≥80% de cobertura en módulos core»— **no tienen enforcement automático**. Toda afirmación de «suite verde» en estas cuatro rondas, incluidas las mías, salió de una ejecución local a mano.

Y hay una demostración dentro de esta misma serie: **R-1** —la suite en rojo por un doble de prueba desactualizado— es exactamente el defecto que un paso de tests en CI habría atrapado sin necesidad de auditor, y que en su momento pasó el re-gate.

Esto **no es deuda de la Ola 1**: es anterior y transversal. Lo levanta esta serie porque las olas 2 a 7 se van a apoyar en el mismo stop/go que hoy no se verifica solo.

**Recomendación:** añadir un paso `pnpm test` al job de CI, situado tras `build` y antes de las migraciones. Es un cambio de pipeline: lo propone AI-PLAT-OPS y lo apruebo yo; no requiere CTO. **Condición de secuencia:** cerrar antes R-14, o el primer flake bloqueará merges de terceros y el equipo aprenderá a reintentar en vez de a mirar.

### R-14 · BAJA · Dos specs del portal son inestables bajo carga

`CreateTaskSchedulingDialog.spec.tsx` y `StockIssueFormDrawer.spec.tsx` fallaron en una corrida completa (2 suites, 2 tests) y **pasaron** tanto en aislamiento como en una segunda corrida completa (157 suites, 830 tests, 0 fallos).

Diagnóstico: las trazas apuntan a un `Timeout` de `jsdom` (`HTMLHyperlinkElementUtils-impl`), las duraciones subieron a 7-9 s frente a 5,4 s en aislamiento, y `apps/portal/jest.config.js` no fija `testTimeout` ni `maxWorkers` — cuadra con vencimiento del timeout por contención entre workers, no con un defecto funcional.

**No es de esta rama:** los cuatro archivos implicados —los dos specs y sus dos componentes— están intactos respecto a `HEAD`.

No bloquea. Pero un test que falla una de cada dos corridas es peor que no tenerlo, porque entrena a ignorar el rojo — que es, literalmente, cómo R-1 llegó hasta el re-gate. **Recomendación:** fijar `testTimeout` en esos dos specs o aislar el temporizador de jsdom, **antes** de adoptar R-13.

---

## 4. Disposición

| # | Acción | Severidad | Responsable | Momento |
| --- | --- | --- | --- | --- |
| 1 | **R-14**: estabilizar los dos specs del portal | BAJA | AI-FE-PLATFORM | Ticket propio |
| 2 | **R-13**: paso `pnpm test` en `ci.yml`, tras R-14 | MEDIA | AI-PLAT-OPS | Ticket propio, antes de cerrar la Ola 2 |

Ninguna bloquea el merge de esta rama. Ambas salen del alcance de la Ola 1 y viajan como trabajo propio.

**Sin escalación al CTO.**

---

## 5. Estado consolidado de la serie

| Ronda | Bloqueante | Cerrado en |
| --- | --- | --- |
| v1.0 | O-7(b) orden sobrescrito · DEF-1 sin ejecutar · H-1 sin tope de `limit` | v1.1 |
| v1.1 | R-1 suite roja · R-3 backfill sin ruta de ejecución | v1.2 |
| v1.2 | R-6 clave ausente en el job de CI | v1.3 |
| v1.3 | R-10 directivas de lint inválidas | **v1.4** |
| v1.4 | — | — |

Deuda declarada que sobrevive al cierre, toda con destino asignado: 31 endpoints sin envelope (Olas 5-7, Decisión 1); test de orden por recurso (stop/go de la Ola 2, R-5); índices `089_*` (Ola 2); HMAC con pepper para las dos columnas de hash de documento (propuesta futura de una sola vez); R-13 y R-14.

---

## 6. Nota de cierre

Cuatro rondas, cuatro bloqueantes, y cada uno vivía una capa más afuera que el anterior: del contrato al doble de prueba, del doble al entorno del job, del entorno al lint del monorepo. Esta quinta ronda no encontró una quinta capa **porque la disposición 6 de v1.3 mandó correr el pipeline entero**, y ahí se acabó el perímetro disponible.

Los dos hallazgos que quedan lo confirman desde el otro lado: los dos son anteriores a esta rama y ninguno se había visto antes, no porque nadie mirara, sino porque **la capa que los contiene —el pipeline como artefacto auditable— no formaba parte de ninguna definición de terminado**. R-13 es el caso extremo: el stop/go que gobernó esta serie entera exige una suite verde que el pipeline nunca ha comprobado.

De ahí el requisito que dejo fijado para las olas restantes, y que ya escribí en v1.3: **el stop/go nombra los comandos de la raíz, no los del paquete tocado.** A eso añado ahora una segunda mitad — **y el pipeline que los ejecuta es parte del entregable, no del entorno.**
