# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 12 (B-fix2: contexto de OT en 500)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.13 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ · G4 ⏳ (F1 ✅; V1 y V4-bis bloqueados por este defecto)
**Estado al arrancar:**
- F1-v2 pasó con 6/6.
- El contexto de la OT responde 500 con `22P02`: `installed-equipment-read.adapter.ts:41` filtra el estado del activo con `'INSTALLED_AT_CUSTOMER'`, un valor de disposición, en lugar de `INSTALLED_COMODATO`.
- Entorno arriba y fixtures de FX-v1 listos.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §Ola 12 y §B-fix2 | `nestjs-expert`, `postgresql`, `test-driven-development`, `iwana-test-evidence` | El contexto devuelve 200 y la prueba del adaptador queda contra Postgres; revisión de literales de enum en el SQL de MOD13 |

**Paralelo:** ninguno. Al cerrar, relanza los bloques 2 (`sr-qa`, V1-r) y 3 (`ds-owner`, V4-bis-r) del [launcher v1.12](PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-LAUNCH-v1.12.md) tal como están.
**Cierre:**
- filtro corregido con el enum compartido;
- nueva prueba de integración del adaptador en verde contra Postgres;
- revisión de literales de enum entregada;
- el contexto responde 200 contra el API vivo con la sesión NOC.

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 12 y §B-fix2, y `docs/informes/INFORME-MOD13-PRUEBAS-V1-v1.0.md`. Antes de escribir código, lee los `SKILL.md` de `nestjs-expert`, `postgresql`, `test-driven-development` e `iwana-test-evidence`. Corrige el filtro del adaptador con `SerializedAssetStatus.INSTALLED_COMODATO`, añade su prueba contra Postgres y revisa los literales de enum en el SQL crudo de MOD13. Verifica el contexto contra el API vivo con la sesión NOC de FX-v1. No modifiques el contrato ni toques `tenant_iwana`; no imprimas secretos ni dejes cachés de jest en el repo. No commitees. Cierras con el conteo real.
