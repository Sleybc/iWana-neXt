# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 13 (B-fix3: 500 en `reserve` y cableado real)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.14 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ · G4 ⏳ (F1 ✅; V1 llega hasta la reserva)
**Estado al arrancar:**
- La cadena del CPE funciona de punta a punta: custodia → OT → worker → comodato.
- El contexto de NOC muestra el `cpe`.
- Router y red /24 de prueba activos.
- `reserve` responde 500 sin error en Postgres; es una excepción de la aplicación.
- API (3000), portal (3002) y worker en marcha.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §Ola 13 y §B-fix3 | `systematic-debugging`, `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` | Traza y corrección del 500; pruebas de cableado real para los 6 comandos; OT reservada para V1-r |

**Paralelo:** ninguno. Después se relanzan V1-r y luego V4-bis-r con los bloques 2 y 3 del [launcher v1.12](PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-LAUNCH-v1.12.md).
**Cierre:**
- la causa queda documentada con su traza saneada;
- las pruebas de cableado real fallan antes de la corrección y pasan después;
- `reserve` responde bien contra el API vivo;
- conteo real.

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 13 y §B-fix3, y `docs/informes/INFORME-MOD13-PRUEBAS-V1-v1.0.md`. Antes de escribir código, lee los `SKILL.md` de `systematic-debugging`, `nestjs-expert`, `test-driven-development` e `iwana-test-evidence`. Obtén la traza del 500 de `reserve` con el API logueando a un archivo fuera del repo y una sola repetición. Corrige la causa sin tocar el contrato y añade las pruebas de cableado real sin dobles para los puertos. Deja la OT de FX-v1 reservada. No toques `tenant_iwana`, no imprimas secretos ni dejes cachés de jest en el repo. No commitees. Cierras con el conteo real.
