# Lanzamiento — MOD13 · E7_resume v1.2: bootstrap público, reconstrucción y reanudación

**Versión:** 1.14 · **Estado:** vigente; sustituye a v1.13 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.6](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.2](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.2.md) · **Matriz:** [QA v2.5 §13.11](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [intento v1.1](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.1-attempt2.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · [E2/E5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)

**Estado:** G1–G4 PASS; G6 NO PASS. E7_resume v1.1 se detuvo porque E1 no tenía `public.typeorm_migrations`; E1 está preservado. v1.2 aplica primero las 27 migraciones públicas solo en E1 y luego ejecuta el generador. Docker Desktop debe permanecer abierto. `NETWORK_IP_PROTECTION=PENDING`.

| # | Subagente | Encargo | Skills obligatorias | Insumo |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | Tras el seed, fixture OT determinista y validación de huellas en R-0b(c/d). | `postgresql`, `iwana-tenant-migration` | E2/E5; E-7; generador |
| 2 | `plat-ops` | R-0 a R-0b(b2); reutiliza E1; bootstrap público, semilla y protección E2/E5. | `docker-expert`, `database-migration`, `postgresql` | Encargo v1.2; intento v1.1 |
| 3 | `sec-eng` | Revisar secretos, protección IP, E2/E5, teardown y límites de seguridad del resultado. | `security-auditor` | Resultado #2; ADR-101 |
| 4 | `sr-qa` | Revisar huellas, 17/17, reconcile natural, reserva/release, legacy 6/6 y teardown. | `iwana-test-evidence`, `verification-before-completion` | Resultado #2; matriz v2.5 |

**Secuencia:** #2 hasta R-0b(b2) → #1 → #2 desde R-0b(c/d) hasta R-9 → (#3 ∥ #4) → AI-EM-ARCH. No commit. G6.5 espera G6 y resolver los 3 fallos externos del Portal; G7 sigue separado.
