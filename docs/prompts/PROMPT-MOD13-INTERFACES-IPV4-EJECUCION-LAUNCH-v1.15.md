# Lanzamiento — MOD13 · E7_resume v1.2: bloqueo de equivalencia histórica

**Versión:** 1.15 · **Estado:** vigente; sustituye a v1.14 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.7](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.2](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.2.md) · **Matriz:** [QA v2.6 §13.12](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [R-0b(c/d)](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.2-r0bd.json) · [reconstrucción](../quality/evidence-mod13-ca-r12-e1/e7-resume-rebuild-e2-e5.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)

**Estado:** R-0b(b2)/R-0b(c) PASS; en R-0b(d), 6/6 hashes legacy y conteos PASS, `execution_orders` bloqueado: SHA histórico `42e4c46e…` ≠ actual `9f6329fa…`, sin proyección histórica comparable. E1 no contiene DB `e7_match` (catálogo leído, exit 0). SEC PASS acotado a artefactos; data-eng y SR-QA: no iniciar R-1. G6 NO PASS; E1/E7_final preservados; `NETWORK_IP_PROTECTION=PENDING`.

| # | Subagente | Encargo | Skills obligatorias | Insumo |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | Continuar solo si se recupera una fuente histórica verificable para comparar la proyección completa de `execution_orders`; E1 no contiene `e7_match`. No inferir equivalencia ni alterar criterios. | `postgresql`, `iwana-tenant-migration` | R-0b(d); E-7; fixture versionado |
| 2 | `plat-ops` | No iniciar R-1–R-9 hasta recibir comparación histórica independiente PASS; preservar E1/E7_final y no tocar Redis/colas. | `docker-expert`, `database-migration`, `iwana-queue-inspect`, `postgresql` | E1; E7_resume v1.2 |
| 3 | `sec-eng` | Mantener PENDING y revisar cualquier artefacto nuevo antes de uso. | `security-auditor` | Evidencia y ADR-101 v1.1 |
| 4 | `sr-qa` | Confirmar que la equivalencia cumple matriz §13.9 antes de desbloquear E-7. | `iwana-test-evidence`, `verification-before-completion` | Matriz v2.6; dictamen data-eng |

**Secuencia:** #1 → si y solo si comparación histórica verificable PASS, #2 R-1–R-9 → (#3 ∥ #4) → dictamen AI-EM-ARCH. Sin alterar E-7, sin commit. G6.5/G7 siguen separados.
