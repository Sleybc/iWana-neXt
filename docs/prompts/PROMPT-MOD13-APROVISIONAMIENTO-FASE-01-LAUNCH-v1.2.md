# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 2 (B1b)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.2 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 2 — B1b · **Gates:** G0 ✅ · G1 ✅ (Ola 1 + 1-bis, 2026-10-22)
**Estado al arrancar:** migraciones 028 y 160–162, entidades y contratos de `@iwana/shared` (§4.4) ya entregados; no se rehacen. Spec UX v1.1 completa. G5 sigue abierto hasta la V2.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §B1b | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `test-driven-development` (+ `postgresql` para IPAM) | HLD v1.1 §4.4, §6.1, §6.2 catálogo, §6.8, §6.9, §7, §8 |

**Paralelo:** ninguno. B2 depende de B1b; F1 se lanza con la Ola 3, junto a B2.
**Cierre de ola (G2):**
- CA-NET-01 a 03 y CA-NET-12 en verde;
- 20 reservas concurrentes con 0 duplicados, contra Postgres real;
- prueba de reversión cuando falla la auditoría;
- lint, typecheck y build de `apps/api`;
- OpenAPI actualizado;
- conteo real, sin caché de turbo.

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md` y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §B1b, con sus reglas comunes 1 a 9. Antes de escribir código, lee los `SKILL.md` de `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `test-driven-development` y `postgresql`. Consumes el contrato congelado `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` y lo ya entregado en `packages/database` y `@iwana/shared`; no los modifiques. Si algo no cabe, emite `[BLOQUEO]` y para. Alcance: solo el catálogo de red, el IPAM, el puerto de actores y la matriz de permisos. Fuera de alcance: reservar, certificar, eventos y UI. No commitees ni migres tenants `ACTIVE`. Cierras con G2: CA-NET-01 a 03 y 12, 20 reservas concurrentes sin duplicados contra Postgres real, reversión ante fallo de auditoría, lint, typecheck y build, con conteo real.
