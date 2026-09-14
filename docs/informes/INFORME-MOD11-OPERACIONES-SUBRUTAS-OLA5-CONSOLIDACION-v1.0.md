# INFORME — MOD11 Operaciones · OLA 5 · Consolidación de merge readiness y decisión G6.5

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-EM-ARCH (modo Orquestador)
**Procedimiento:** `docs/prompts/PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md`
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§3.3, §3.4 ola 5)
**Orden de despacho:** [`PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA5-PLAT-OPS-v1.0.md`](../prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA5-PLAT-OPS-v1.0.md) (autosuficiente; sin prompt de fase — G6.5 es gate intercalado, no etapa)
**Informe consolidado:** [PLAT-OPS — evidencia para G6.5](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA5-PLAT-OPS-v1.0.md)
**Normativa del gate:** [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (Aprobado) · Protocolo §3 y §4
**Entrada:** [consolidación OLA 4](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-CONSOLIDACION-v1.0.md) (G6 cerrado; §5 dos consultas a PLAT-OPS; §10 condiciones de este gate)

> **Registro separado (ADR-069):** este informe registra **solo G6.5**. G6 quedó registrado en la consolidación de la ola 4 y no se modifica; G7 no se anticipa ni se reporta como avanzado por este GO.

---

## 1. Alcance de la ola

Un solo encargo (AI-PLAT-OPS): cerrar las dos consultas asíncronas de la ola 4 (ENV-E2E-CREDS, PROVISIONER-TECH2), ejecutar la corrida Linux de CI identificada por SHA de `production-images` (ci.yml:56) y `execution-orders-e2e` (ci.yml:559), y producir el artefacto resumen sanitizado que ADR-069 exige.

**Precondición del despacho resuelta antes de mover al agente.** Al emitirse la orden (ola 4 §10) el árbol tenía 141 archivos sin commitear sobre `7314c208`. En la verificación previa al despacho, el orquestador comprobó en vivo: árbol limpio, `HEAD` en `de2a6304` sincronizado con `origin/main` (0 commits sin push), y el trabajo de las olas 1–4 versionado en `5704e8df`. El commit fue decisión del CTO, sobre `main`, conforme al plan §4.5. Sin esa condición no se habría despachado.

## 2. Gates — estado de entrada y salida

| Gate | Entrada | Salida |
| --- | --- | --- |
| G1–G4 | ✅ Cerrados (OLA 1) | Sin cambio |
| G5 | ✅ Completo (OLA 3) | Sin cambio |
| G6 | ✅ Cerrado (OLA 4 + correctiva 4.1) | Sin cambio |
| **G6.5** | ⬜ No iniciada | ✅ **GO — merge readiness** (ver §4) |
| G7 | ⬜ No iniciada | No ejecutado — **no se anticipa** |

## 3. Verificación de la evidencia (contra artefactos, no contra autodeclaración)

Cada condición de ADR-069 verificada por el orquestador con fuente independiente del informe del agente:

| Condición | Evidencia verificada |
| --- | --- |
| Corrida Linux de GitHub Actions | Run [`34791789744`](https://github.com/Sleybc/iWana-neXt/actions/runs/34791789744) — estado `completed/success` confirmado por API de GitHub (`gh run view`), no por captura del agente |
| Identificada por **SHA** | `d211f4039e6fbcee4218c9e5944170ac80b13aab` — push a `main`, evento `push`; runner `ubuntu-latest` Linux X64, node v24.13.1, pnpm 10.32.1; disparo 2026-09-14T00:09Z |
| `production-images` verde | ✅ success (~3 m 47 s) — job ci.yml:56, «Build y validación de imágenes production» |
| `execution-orders-e2e` verde | ✅ success (~4 m 53 s) — job ci.yml:559, «E2E operativo R4.1» |
| Artefacto resumen sanitizado | `e2e-r41-summary`, contenido íntegro en el informe PLAT-OPS §3: `E2E_SETUP=OK` · **37 passed / 0 failed / 0 skipped / 0 flaky / 0 did-not-run, exit 0** (mínimo del provisioner: 30) · Playwright 133.0 s, vertical 242.6 s · `E2E_CLEANUP=OK` + safety-net `always()`. Auditoría del sanitizado: **sin tokens, cookies, reportes crudos ni payloads** — los slugs de tenant van con sufijo enmascarado y las credenciales son efímeras |
| Consulta ENV-E2E-CREDS | **Cerrada**: contrato canónico `PLATFORM_SUPER_ADMIN_*` vs alias `E2E_PLATFORM_*` documentado en `.env.example` versionado (commit `c7ca23fc`); `.env.development.local` alineado sin imprimir valores |
| Consulta PROVISIONER-TECH2 | **Ratificado**: fixture `E2E_TECH2_*` aditivo, defaults `.invalid` sin PII; probado en CI — 37/37 en dos corridas independientes es inalcanzable sin él (caso BOLA 9g) |
| E2E-PORTAL-DEBT | **Instrumentada, no arreglada** (conforme a la orden §5.4): job `e2e-portal-debt-counter` con trinquete contra baseline; primera medición Linux 257 casos / 100 fallos / 0 skipped / 0 flaky; baseline calibrado 98→100 (medición CI vs. Windows) en `4439c5e1` |
| Superficie del agente | Los 3 commits de la ola (`c7ca23fc`, `d211f403`, `4439c5e1`) tocan solo `.github/workflows/`, `.env.example`, script raíz `package.json` y su informe — verificado por `git diff de2a6304..HEAD --stat`. Cero código de producto |
| p95 `sortableFields` | Sin medición, **declarado con causa** (base efímera casi vacía y runner no representativo; el instrumento exige tenant a volumen) — la orden §5.5 lo excluye como condición del gate |

**Hallazgo resuelto en la ola: job `ci` roto en `main`.** La corrida preexistente sobre `de2a6304` (run `34790180053`) tenía los dos jobs G6.5 en verde pero el job principal `ci` en rojo (`pnpm test:tooling`, primera falla en run `34721615060` sobre `a0809df7`). El orquestador lo incorporó a la adenda del despacho: no hay merge readiness creíble con `main` en rojo. PLAT-OPS diagnosticó causa raíz en su propia superficie (`@iwana/db` resuelve `@iwana/shared` contra `dist/` inexistente en checkout limpio; en local pasaba por dist pre-construido) y la corrigió en `c7ca23fc`; el job `ci` completo quedó verde (~11 m 52 s) en la corrida final. La corrida de `de2a6304` queda **sustituida** como evidencia por la del SHA corregido.

**Nota sobre el tip actual (`4439c5e1`, docs + calibración del baseline):** el diff verificado no altera las definiciones de los dos jobs G6.5 (solo el `E2E_PORTAL_DEBT_BASELINE` del job informativo), por lo que la evidencia de `d211f403` sigue válida para el tip. Su propia corrida de CI estaba en vuelo al momento de la decisión; si fallara, es salud de CI a atender por PLAT-OPS, no afecta esta evidencia.

## 4. Decisión G6.5 — AI-EM-ARCH

**G6.5 — MERGE READINESS: GO.**

Fundamento:
1. G6 cumplido (ola 4) y corrida Linux de GitHub Actions **verde, identificada por SHA** (`d211f403…`, run `34791789744`) para `production-images` y `execution-orders-e2e` — exactamente la taxonomía de ADR-069.
2. El job E2E demuestra setup, conteo mínimo (37 ≥ 30), cero fallos, cero skips y cleanup confirmado, con el artefacto sanitizado archivado en el informe PLAT-OPS.
3. El patrón 37/0/0/0 con cleanup OK se repite en **dos corridas independientes** (`de2a6304` y `d211f403`) — estabilidad, no golpe de suerte.
4. El aprobador (AI-EM-ARCH) es distinto del productor de la evidencia (AI-PLAT-OPS); la verificación se hizo contra la API de GitHub y el diff de commits, no contra la declaración del agente.
5. El job principal `ci` también está verde en el mismo SHA — la corrida que sirve de evidencia no arrastra ningún rojo conocido.

**Alcance de esta decisión (ADR-069):** G6.5 **autoriza el merge** de la remediación. **Nunca autoriza despliegue.** Las imágenes construidas por `production-images` no constituyen avance hacia G7, y este GO no se reporta como progreso de G7: producción sigue siendo recomendación de AI-EM-ARCH más aprobación del CTO en un expediente propio.

## 5. Resolución de marcadores (protocolo §6.3)

| Marcador | Emisor | Estado |
| --- | --- | --- |
| `[CONSULTA]` asíncrona → PLAT-OPS (ENV-E2E-CREDS) | AI-SR-QA (OLA 4) | **Cerrada** — contrato documentado y alineado (PLAT-OPS §5.1) |
| `[CONSULTA]` asíncrona → PLAT-OPS (PROVISIONER-TECH2) | AI-SR-QA (OLA 4) | **Cerrada** — ratificado por ejecución en CI (PLAT-OPS §5.2) |
| Nuevos marcadores esta ola | — | **Cero** — 0 `[BLOQUEO]`, 0 `[CONSULTA]`, 0 `[DESEMPATE]` |

## 6. Deuda consolidada (por severidad) — heredada y nueva

| # | Severidad | Deuda | Dueño | Decisión |
| --- | --- | --- | --- | --- |
| E2E-PORTAL-DEBT | Media | Arreglar los ~100 fallos de la suite E2E portal completa en CI (specs sin mock de `me/effective-permissions` desde `d5db6239`; 257 casos) y convertir el contador en compuerta | Programa (registrada en OLA 4 §7) | **Instrumentada en CI** con trinquete (baseline 100); el arreglo sigue abierto — la parte de PLAT-OPS (visibilidad) quedó cerrada |
| sortableFields | Media (heredada) | Medición p95 con tenant a volumen representativo antes del tramo (ADR-065 §22-bis); instrumento listo, falta entorno | AI-PLAT-OPS → AI-EM-ARCH | **Activa** — declarada sin medición en esta ola |
| Coste CI del contador | Baja | ~45 min de runner informativo por push | AI-PLAT-OPS | Aceptada a cambio de visibilidad; ventana o disparo por etiqueta si el CTO lo pide |
| Snapshot del artefacto | Baja | La sección «estado de jobs» del artefacto congela el momento del fin del job E2E; los estados autoritativos son los del run | AI-PLAT-OPS | Observación documentada |
| GOBERNANZA §13.4 | Transversal | ADR-078/070 sin propagar; QA-34/TLS, rollback, restore y RPO/RTO como deuda activa | CTO | **Se escala al abrir el expediente de cierre (G7)**; no la absorbe este plan ni este gate |

## 7. Instrumentación (§9 del plan)

- **Skills del ejecutor declaradas:** obligatorias `docker-expert`, `observability-engineer`; de apoyo `e2e-testing-patterns`, `playwright-skill`, `turborepo-caching`. No se usaron las prohibidas; no nació ADR nuevo.
- **Skills del orquestador (transversal §4.1):** `architect-review` y `docs-architect` leídas para la consolidación; `dispatching-parallel-agents` no aplicó (ola de un solo agente).
- **Consultas:** 2 recibidas de la ola 4, ambas cerradas; **0 emitidas** esta ola.
- **Bloqueos: 0. Desempates: 0.** Reescrituras de contrato: 0.
- **Latencia del gate:** orden emitida tras el cierre de G6, precondición de commit resuelta por el CTO, ola despachada, ejecutada (3 commits, 2 runs completos) y consolidada en la misma fecha de trabajo; la decisión se emite sobre la corrida `34791789744`.
- **Gates de protocolo 11/12/13** (corridos por el orquestador tras redactar este informe): ver §8.

## 8. Verificación documental del cierre

Gates de protocolo corridos por el orquestador después de este informe y de la actualización del plan (§3.3 y §3.4):

| Gate | Resultado |
| --- | --- |
| `pnpm audit:adr-citations` | BLOQUEANTE: 0 |
| `pnpm audit:doc-locations` | BLOQUEANTE: 0 |
| `pnpm sync:agents:check` | OK — 8 agentes sincronizados |

## 9. Siguiente paso — G7 (no se despacha a ningún agente)

El cierre de módulo es entregable de AI-EM-ARCH (informe de cierre con G6, G6.5 y G7 registrados por separado) más la **aprobación del CTO**. Al abrirse ese expediente se escala la deuda transversal del plan §13.4: ADR-078 sin propagar (su predecesor ADR-070 (superado)), QA-34/TLS, ensayo de rollback, restore verificado y targets RPO/RTO como deuda activa; MOD09 `Suspendido` con G6.5 sin veredicto y MOD11 «Cerrado» sin informe de cierre, contra ADR-080. Este informe no anticipa nada de ello.

**Pendiente de commit:** este informe y la actualización del plan quedan en el árbol de trabajo; el commit es decisión del CTO, sobre `main` (plan §4.5).
