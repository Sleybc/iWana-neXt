# Spec — Perfil github-ops (AI-GITHUB-OPS), auxiliar operador de plataforma GitHub

**Fecha:** 2026-11-23
**Estado:** Aprobada por el usuario titular del repositorio (brainstorming con gobernanza AI-EM-ARCH v2.9, misma sesión)
**Trazabilidad:** [AGENTS.md](../../AGENTS.md) · [Protocolo §9](../roles/Protocolo_Colaboracion_Multiagente_v1.md) (v1.11) · [ADR-107](../adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md) (aprobado) · [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (aprobado) · [informe vivo de roles §17](../informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md)

## 1. Problema

Nadie opera de forma dedicada la plataforma GitHub del repo: PRs, issues, releases y la vigilancia de la corrida post-push (ADR-107) se hacen a mano en cada ola. `plat-ops` escribe el CI pero no lo opera día a día; `gate-verifier` reúne evidencia pero no re-ejecuta ni publica.

## 2. Decisión

Alta de **`github-ops` (AI-GITHUB-OPS)** como **auxiliar operador**: fuera de la RACI, sin escalaciones, sin red de consulta; reporta a quien lo invoca. Primer auxiliar con escrituras de plataforma **no destructivas**.

| Campo | Valor |
| --- | --- |
| Subagente | `.claude/agents/github-ops.md` (canónico) → `pnpm sync:agents` → `.opencode/agents/` + `.codex/agents/` |
| Perfil | `docs/roles/Perfil_IA_Operador_Plataforma_GitHub_v1.md` v1.0 |
| Activación | On-demand; lo invoca cualquier agente (típicamente EM-ARCH, gate-verifier o la sesión que publica) |
| Herramientas | MCP `github` + `gh` CLI + Read/Grep/Glob; sin edición de archivos del workspace |
| Permiso | Operador no destructivo: escrituras de plataforma acotadas, sin confirmación por acción |

## 3. Alcance (3 bloques)

1. **Operación de plataforma**: PRs (flujo MCP: review pending → comments → submit), issues, labels, milestones. Patrones obligatorios: `get_me` primero, `search_*` vs `list_*`, paginación 5–10, `minimal_output`.
2. **CI post-push (ADR-107)**: vigilar la corrida del SHA publicado, clasificar rojos (regresión / flaky / entorno), re-ejecutar jobs flaky, entregar datos de corrida a `gate-verifier`. **Nunca declara G6.5**: la evidencia la reúne gate-verifier y la consolida EM-ARCH.
3. **Releases y trazabilidad**: tags y notas de release por cierre de módulo (G7) derivadas de los INFORMEs; enlace commit ↔ ola ↔ informe ↔ SHA.

## 4. Límites duros

- **Publicación y destructivos**: push/merge de código, force push, borrar ramas/repos, cambiar branch protection o settings → bloque copiar-pegar para el usuario (filosofía `guard-bash`).
- **Superficies ajenas**: no edita `.github/workflows/` (plat-ops), no remedia hallazgos de seguridad (sec-eng), no clasifica fallos Playwright (e2e-triage), no escribe código ni tests.
- **Gates**: no declara ningún gate cumplido; opera y entrega evidencia.
- **ADR-107 no cambia**: se publica por trenes desde la sesión ejecutora; los PRs son superficie de review, no gate de merge. Un flujo de publicación por PR exigiría ADR + CTO y queda fuera.

## 5. Enmienda del protocolo (v1.10 → v1.11)

El bullet de auxiliares de §9 pasa a «verificador u operador»: el operador ejecuta operaciones acotadas no destructivas de su superficie a pedido del invocador, sin decidir alcance ni recibir escalaciones; **la accountability del entregable queda en quien invoca**. Más fila en la estructura §1 y changelog. Aprobación: EM-ARCH + registro en el informe vivo (§9); **sin ADR** porque no mueve autoridad hacia/desde el CTO. Precedente de acción acotada: `e2e-triage` re-ejecuta un test aislado.

## 6. Alta en un solo acto (checklist §9)

| # | Artefacto | Acción |
| --- | --- | --- |
| 1 | `docs/roles/Perfil_IA_Operador_Plataforma_GitHub_v1.md` | Crear (espejo de `Perfil_IA_Triador_E2E_v1.md`) |
| 2 | `.claude/agents/github-ops.md` | Crear adaptador con prompt operativo + patrones MCP/gh + límites |
| 3 | Protocolo v1.11 | Enmienda §9 + estructura §1 + cuadro de auxiliares + operacionalización + changelog |
| 4 | `AGENTS.md` | «Superficies activas»: 6 → 7 auxiliares (primer operador) + historial |
| 5 | Informe vivo de roles | §17, registro del alta (v1.15) |
| 6 | `pnpm sync:agents` + `sync:agents:check` | Regenerar y verificar superficies OpenCode/Codex |

**Sin skill nueva** (YAGNI): los procedimientos MCP/gh viven en el adaptador. Si crecen, se extraen a skill después.

## 7. Dispatch del bloque de alta

Un bloque, un responsable: la sesión ejecutora. Obligatorias (verificadas en disco): `docs-architect`. De apoyo: `verification-before-completion` (evidencia de sync). Descartadas: `skill-creator` (no se crea skill), `architecture-decision-records` (sin ADR). Gates: `pnpm sync:agents:check` + `pnpm audit:adr-citations` (`BLOQUEANTE: 0`) + revisión `docs-governance` al cierre. Sin launcher (ADR-107 D8: lo ejecuta esta misma sesión). Commit solo a petición del usuario (`iwana-checkpoint-commit`).

## 8. Supuestos y riesgos declarados

- No verificado en la sesión de diseño: permisos reales de escritura del token MCP `github` (se comprueba con `get_me` al operar) ni la auth de `gh`.
- Supuesto: el repo publica por push directo (ADR-107); la operación de PRs nace como capacidad latente hasta que el CTO decida un flujo de review por PR.
- Riesgo menor: solapamiento percibido con `plat-ops`, mitigado por el contrato «plat-ops escribe el CI, github-ops lo opera y consume».
- El límite «sin edición de archivos del workspace» es **normativo, no técnico** en los tres clientes: `readonly: false` se mapea a `workspace-write` en Codex (`scripts/sync-agents.mjs`) y el adaptador no restringe `tools` para no bloquear el MCP `github`. Un mapeo más fino sería decisión posterior de EM-ARCH/plat-ops, fuera de este encargo.