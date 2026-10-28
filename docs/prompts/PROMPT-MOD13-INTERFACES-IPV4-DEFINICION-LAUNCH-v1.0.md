# LAUNCH — MOD13: definición de interfaces e IPv4

**Versión:** 1.0 · **Estado:** En revisión · **Fecha:** 2026-10-26
**Modo:** Orchestrator · **Ola:** 0, solo definición documental.
**Plan:** `docs/plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md` v1.0.
**Definición:** `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md` v1.0.
**Encargo:** `docs/prompts/PROMPT-MOD13-INTERFACES-IPV4-DEFINICION-v1.0.md`.
**Plantilla:** `docs/prompts/TEMPLATE-PROMPT-LANZAMIENTO.md` v1.1.
**Gates:** G1–G4 pendientes; contratos nuevos sin congelar. No lanzar implementación.

| Orden | Subagente    | Encargo                 | Skills documentales obligatorias                                        |
| ----- | ------------ | ----------------------- | ----------------------------------------------------------------------- |
| 1     | `data-eng`   | §3, modelo              | `postgresql`, `architect-review`                                        |
| 1     | `prod-ux`    | §4, flujo               | `brainstorming`, `system-vocabulary-review`, `iwana-identity-ui-review` |
| 2     | `sr-backend` | §5, contrato preliminar | `nestjs-expert`, `architect-review`, `openapi-spec-generation`          |

**Paralelo:** D/U independientes; B consulta al inicio y consolida tras D/U. Sin escrituras productivas compartidas.
**Cierre:** tres borradores documentales, adendas PRD/HLD consolidadas, revisión G1 registrada y auditorías documentales. Sin autoaprobación.
**Estado previo:** botón y ayudas corregidos localmente; interfaces, protección IPAM ampliada y nuevos contratos pendientes.

## Bloque copiar-pegar

```text
Actúa como AI-EM-ARCH según AGENTS.md y el perfil docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md.
Lee docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md y docs/plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md, ambos v1.0 en revisión.
Ejecuta solo Ola 0 documental de docs/prompts/PROMPT-MOD13-INTERFACES-IPV4-DEFINICION-v1.0.md.
Consulta data-eng y prod-ux en paralelo; sr-backend consulta desde el inicio y consolida el contrato preliminar después.
Cada agente lee sus SKILL.md obligatorios de la matriz antes de actuar, como documentación.
Consolida las adendas PRD/HLD y solicita revisión cruzada/decisión de alcance para G1; no lo autoapruebes.
Respeta ADR-044/098: sede física, nodo técnico y cobertura separados; sin NMS ni descubrimiento RouterOS.
El botón y las ayudas ya están corregidos localmente: verifica el antecedente y no los reimplementes.
No hay contratos nuevos congelados ni G1–G4 aprobados; no escribas código ni migres ni alteres datos.
Cierra con artefactos, criterios verificables, gates reales y pendientes; entrega el launcher de la siguiente ola solo si corresponde.
```
