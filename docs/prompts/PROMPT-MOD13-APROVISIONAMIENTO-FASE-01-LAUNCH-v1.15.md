# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 14 (B-wire: cableado real del consumidor)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.15 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ · G4 ⏳ (F1 ✅; V1 con la OT ya `RESERVED`)
**Estado al arrancar:**
- B-fix3 registró `IpAssignment` y AI-EM-ARCH registró `NetworkInboxEvent` en `NetworkModule`.
- El API arranca con health 200; quedó detenido y el 3000 está libre.
- Falta la prueba que cubra el consumidor de eventos.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §Ola 14 y §B-wire | `bullmq-specialist`, `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` | Consumidor probado con cableado real; guarda de arquitectura de entidades; prueba de arranque del `AppModule` |

**Paralelo:** ninguno. Después, con API, worker y portal en marcha, se relanzan V1-r y luego V4-bis-r (bloques 2 y 3 del [launcher v1.12](PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-LAUNCH-v1.12.md)).
**Cierre:**
- las cuatro pruebas del §B-wire en verde contra Postgres y Redis reales;
- ninguna suite omitida sin justificar;
- conteo real.

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 14 y §B-wire, y `docs/informes/INFORME-MOD13-CORRECCION-RESERVA-v1.0.md`. Antes de escribir código, lee los `SKILL.md` de `bullmq-specialist`, `nestjs-expert`, `test-driven-development` e `iwana-test-evidence`. Añade la prueba de cableado real del consumidor (EXECUTED sobre CERTIFIED y NOT_EXECUTED sobre RESERVED), la guarda de arquitectura que exige que toda entidad usada por `network` esté en un `forFeature`, y la prueba de arranque del `AppModule`. Habilita la integración con Redis. No toques `tenant_iwana`, no imprimas secretos ni dejes cachés de jest en el repo. No commitees. Cierras con el conteo real.
