# PROMPT — privacy · Correcciones y revisión de G7

**Versión:** 1.0 · **Fecha:** 2026-11-07 · **Modo:** EM / Orchestrator
**Estado:** Ejecución autorizada de correcciones; definición H-EXP en revisión
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión).

## 1. Objetivo y entradas

Ejecutar exclusivamente los bloques de la [orquestación v1.0](../plans/2026-11-07-privacy-g7-correcciones-orquestacion.md), §2–4. Leer `AGENTS.md`, bootstrap, instrucciones por ruta y skills del bloque antes de escribir. Entradas abiertas: [HLD privacy v1.5](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.5.md), [spec barrido v1.2](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md), [ADR-104 aprobado](../adrs/ADR-104-Enmienda-ADR-094-D7-Retencion-PQR-y-Veracidad.md), [cierre vivo](../informes/INFORME-PRIVACY-BARRIDO-TEXTO-LIBRE-CIERRE-v1.0.md). No hay PRD específico H-EXP: el origen es ADR-094 D7, enmendado por ADR-104; no se inventa uno.

## 2. Encargos

G7-H (`sr-backend`) entrega solo la spec `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md`: definición técnica completa y CA comprobables, sin código ni aprobación de decisiones nuevas.

G7-M (`sr-backend`) clasifica las 37 columnas usando escritores/consumidores, corrige notas de anulación Billing, respaldo de snapshot 175 y guardas sobre titulares anonimizados con participantes existentes. Entrega manifiesto, pruebas reales y `INFORME-MOD14-PRIVACY-CLASIFICACION-v1.0.md`. No accede desde Billing a tablas de CRM: cada participante trata su módulo y comparte alcance tipado.

G7-T (`plat-ops`) descubre tenants desde registro, inspecciona pendientes y ejecuta cadena ordenada hasta 177 y `--verify-only`. Compila artefactos frescos y repite verificación si cambian reglas durante la corrida. Entrega `INFORME-PRIVACY-G7-TENANTS-v1.0.md`, exit codes, conteos, omitidos y motivo; cero vacío no demuestra tratamiento de datos existentes.

G7-R (`sec-eng`) revisa spec y diff sin editar: retención, inmutabilidad, canal worker/API propuesto, alcance, escrituras posteriores y PII. G7-Q (`gate-verifier`) mide pruebas afectadas sin caché, integración PostgreSQL, cobertura, lint y typecheck. Si cambia una expectativa existente, solicitar también `test-change-reviewer`; si cambia boundary productivo, `boundary-reviewer`.

## 3. Restricciones y salida

Ownership y skills en plan; ningún agente revierte trabajo ajeno. Sin ramas/worktrees, secretos, PII, fixtures reales, `synchronize`, bypass de triggers, `--apply` de supresión, rollback operativo, commit o push. No habilitar contracts destructivos por flag. Las diferencias de catálogo/ADR se escalan antes de construir; no se arreglan por reinterpretación silenciosa.

Cerrar solo con conteos reales, diff comprobado y actualización del cierre vivo. G6 local no implica G6.5 ni G7; H-EXP requiere implementación y G7 lo aprueba el CTO. Detener un tenant con prerrequisito ausente o deber de conservación incompatible, registrarlo y continuar únicamente con los tenants independientes elegibles.
