# LAUNCH — MOD13: ejecutar opción B

**Versión:** 1.0 · **Fecha:** 2026-10-26 · **Estado:** Histórico; superado para continuidad por [launcher v1.1](PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-LAUNCH-v1.1.md).
**Modo:** Orchestrator · **Arranque:** retomar Ola 0 y avanzar por las etapas habilitadas del encargo integral.
**Encargo:** `docs/prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md`.
**Plan de emisión:** `docs/plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md` v1.0; el plan vigente está en v1.5.
**Estado de emisión:** borradores modelo/UX/API y PRD existentes; ese corte quedó superado por la continuación ejecutiva.
**Gates de emisión:** G1–G4 no acreditados en ese corte. Para estado vigente, prevalecen plan v1.5 e informe vivo; G1–G3 ya están cerrados y O2-C está habilitado. No reaprobar B.
**Orden:** D/U paralelo, B consolida; DS/FE/SEC/QA por dependencias; H→M secuencial y FE paralelo tras freeze.
**Skills:** matriz del plan, leer SKILL.md como documentación antes de actuar.
**Contrato nuevo congelado:** ninguno todavía; §4 del encargo define publicación y habilitación G4.
**Cierre del arranque:** estado real O0/G1 y siguiente launcher por ola; no rehacer lo terminado.

## Bloque copiar-pegar

```text
Actúa como AI-EM-ARCH según AGENTS.md y docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md.
La opción B ya está aprobada. Ejecuta docs/prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md.
Lee docs/plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md y retoma el estado real sin rehacer lo terminado.
Usa los agentes y SKILL.md de la matriz: data-eng, prod-ux y sr-backend para consolidar; ds-owner y fe-platform para diseño/factibilidad; sec-eng y sr-qa para revisar.
Completa PRD/HLD y G1–G3 con revisión independiente; publica contratos reales y registra su congelación/G4.
Después delega backend y frontend: H→M secuencial, FE paralelo contra mocks tipados y posterior integración.
Resuelve los seis puntos, conserva legacy y protege IP de infraestructura en todo IPAM antes de habilitar su captura.
Sin ampliar a NMS/RouterOS ni mezclar sede física, nodo técnico y cobertura.
Ejecuta pruebas reales de tenancy, concurrencia, migración, E2E y accesibilidad; reporta conteos, cobertura y gates separados.
No te detengas en otro plan ni pidas de nuevo aprobación de B; continúa los bloques habilitados y reporta bloqueos concretos.
```
