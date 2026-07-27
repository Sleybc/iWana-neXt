# INFORME — Deuda viva post Ola 1 / DEF-2 (registro y destinos)

**Versión:** 1.0
**Fecha:** 2026-07-25
**Modo:** Orchestrator + EM
**Autor:** AI-EM-ARCH
**Estado Ola 1 / DEF-2:** **GO** ([REGATE-v1.3](INFORME-ADR065-OLA1-REGATE-v1.3.md), [STOPGO-RAIZ](INFORME-ADR065-OLA1-STOPGO-RAIZ-v1.0.md), [R-13/R-14](INFORME-ADR065-R13-R14-CIERRE-v1.0.md))
**Clasificación:** Uso interno

---

## Nota cosmético (sin disposición propia)

`turbo.json` declara `outputs: ["coverage/**"]` en la tarea `test`, pero **ningún paquete** invoca Jest con `--coverage`. Efecto: avisos de cache sin artefacto en cada corrida.

**Destino:** el mismo ticket/fase que active el umbral de cobertura ≥80% (AGENTS.md). Ese día: (1) `jest --coverage` (o turbo) por paquetes core; (2) el output `coverage/**` deja de ser vacío; (3) opcionalmente umbral en CI. **No abrir trabajo solo para silenciar el aviso.**

---

## Registro de deuda con destino

| # | Deuda | Severidad | Destino | R | Prompt / artefacto |
| --- | --- | --- | --- | --- | --- |
| D-1 | 31 endpoints sin envelope `ListMeta` | MEDIA (deuda planificada) | **Olas 5 / 6 / 7** (Decisión 1 alcance estrecho Ola 1) | AI-SR-FULL + FE-PLATFORM | Plan padre adopción; prompts por ola FE |
| D-2 | Test de orden efectivo por recurso (`meta.sort` = aplicado) | MEDIA (regresión O-7) | **Stop/go Ola 2** (R-5) | AI-SR-QA / SR-FULL | [PROMPT-ADR065-OLA2-INDICES-v1.0](../prompts/PROMPT-ADR065-OLA2-INDICES-v1.0.md) §Stop/go adicional |
| D-3 | Índices paginación/orden `089_*` + p95 + `sortableFields` | ALTA (perf / ADR-065) | **Ola 2** | AI-SR-FULL · C PLAT-OPS | Mismo prompt Fase 2; ADR-066 **ya implementado** (`transactional=false`) |
| D-4 | Umbral cobertura ≥80% sin enforcement en CI | MEDIA (gobernanza) | **Fase cobertura** (post R-13) | AI-PLAT-OPS + SR-QA | [`docs/prompts/PROMPT-TRANSVERSAL-COBERTURA-80-CI-v1.0.md`](../prompts/PROMPT-TRANSVERSAL-COBERTURA-80-CI-v1.0.md) — incluye limpieza turbo outputs |
| D-5 | HMAC/pepper en hashes de documento (`subscribers` + `expediente_records`) | BAJA→MEDIA (AppSec a largo plazo) | **ADR propuesto** (una sola vez, ambas columnas) | AI-EM-ARCH → CTO · C SEC-ENG | Dictamen: [INFORME-D5-HMAC-DOCUMENT-HASH-PEPPER-SEC-v1.0](INFORME-D5-HMAC-DOCUMENT-HASH-PEPPER-SEC-v1.0.md) · prompt [PROMPT-TRANSVERSAL-HMAC-DOCUMENT-HASH-PEPPER-v1.0](../prompts/PROMPT-TRANSVERSAL-HMAC-DOCUMENT-HASH-PEPPER-v1.0.md) |

---

## Secuencia recomendada (no paralelizar a ciegas)

```text
Ola 2 (D-2 + D-3)  →  Olas 3–4 (FE contrato)  →  Olas 5–7 (D-1 envelopes)
        ↘
   Fase cobertura (D-4) — independiente de índices; tras suite estable en CI (R-13 ✔)
        ↘
   ADR pepper (D-5) — no acoplar a Ola 2; requiere CTO
```

**Regla ADR-016:** no iniciar Ola N+1 de paginación sin cierre de N. Ola 1 está **GO** → Ola 2 está **desbloqueada en gobierno**.

---

## Tracks multiagente — estado

| Track | Estado |
| --- | --- |
| Ola 1 / DEF-2 / R-10…R-14 | **Cerrados** |
| Ola 2 (089 + R-5 + p95) | **089 GO** (migrate/revert local OK); p95 + `sortableFields` + R-5 **pendientes** — [INFORME-ADR065-OLA2-INDICES-v1.0](INFORME-ADR065-OLA2-INDICES-v1.0.md) |
| Cobertura 80% + turbo outputs | Prompt emitido; no kickoff |
| HMAC pepper | Dictamen SEC **GO consulta** — [INFORME-D5-…](INFORME-D5-HMAC-DOCUMENT-HASH-PEPPER-SEC-v1.0.md); ADR Propuesto + escalación CTO **pendiente** |

---

## Stop/go permanente (recordatorio)

1. Local: `pnpm lint` + `pnpm typecheck` en **raíz**.
2. CI: lint + typecheck + build + **`pnpm test`** + migraciones/seguridad.
3. Ola 2+: `pnpm db:migrate:all` + revert verificados cuando toque migraciones tenant.
4. Afirmaciones «suite verde» = línea de resumen Jest / job CI, no exit de tubería.

**Sin escalación al CTO** salvo al abrir D-5 (pepper).
