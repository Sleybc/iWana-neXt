# Prompt de ejecución — Plataforma / Remediación raíz

**Versión:** 1.0  
**Fecha:** 2026-08-08  
**Modo emisor:** AI-EM-ARCH Orquestador  
**Plan asociado:** `docs/plans/2026-08-08-remediacion-configuracion-raiz.md`

## 1. Objetivo exacto

Cerrar los hallazgos P0/P1 de archivos raíz: evitar datos locales en el contexto Docker, completar el cableado productivo existente y restaurar reproducibilidad de pnpm, Turbo y ESLint.

Entra: el alcance congelado del plan asociado. No entra: rotación externa de credenciales, purga de historia, borrado de backups, cambio de topología/stack o secretos reales.

## 2. Entradas verificadas

- `AGENTS.md` — fuente maestra.
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md` — modo Orquestador activado.
- `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — workflow y gates.
- `docs/adrs/ADR-069-Gates-G6.5-Merge-Readiness.md` v1.0, **Aprobado** — separación G6/G6.5/G7.
- `docs/plans/2026-08-08-remediacion-configuracion-raiz.md`.

## 3. Contratos congelados

- Contrato de API: sin cambios; no hay endpoints, DTOs ni OpenAPI en alcance.
- Contrato de componente: no aplica; no hay UI en alcance.
- Contrato operativo: se conserva Docker Compose on-prem; las variables se inyectan solo a los consumidores existentes.

## 4. Destinatarios y pasos

### AI-PLAT-OPS

Responsable de Tarea 1 y de los artefactos operativos de Tarea 3. Usar `docker-expert`, aplicar cambios mínimos y validar Compose sin volcar configuración sensible. Consultar a SEC-ENG antes de eliminar un payload o modificar exclusiones de secretos.

### AI-FE-PLATFORM

Responsable de Tarea 2. Usar `monorepo-architect` y `turborepo-caching`; no añadir dependencias nuevas salvo las que resulten necesarias para declarar un consumidor existente. Regenerar el lock solo con pnpm.

### AI-SR-QA

Responsable de revisión de aceptación y evidencia. No modificar implementación. Registrar comandos, salida resumida y severidad de los hallazgos; nunca incluir secretos ni payloads.

### AI-SEC-ENG

Revisión obligatoria de seguridad. Confirmar que no se codifican secretos, que los artefactos con PII quedan fuera de Docker y que el informe mantenga la escalación de credencial/historia.

## 5. Restricciones no negociables

- Preservar la modificación local en `apps/api/src/common/pagination/clamp-page-endpoints.controller.http.spec.ts`.
- No imprimir, copiar ni cambiar valores secretos de `.env*`.
- No borrar `.backups/`; no reescribir Git ni rotar cuentas.
- No resolver ADR-072/ADR-074 ni introducir Docker secrets/redes nuevas.
- No usar npm o yarn; usar pnpm.
- Cada agente entrega diff, comandos ejecutados y cualquier `[BLOQUEO]` antes de cerrar.

## 6. Stop/go y escalación

Detener el track afectado ante secreto requerido, conflicto con un ADR, topología nueva o fallo que afecte el cambio local preservado. Emitir `[ESCALACION AL CTO]` en el informe para revocación de la credencial versionada, evaluación de artefactos/cachés ya publicados y decisión de purga de historia.

## 7. Salida

El responsable entrega una lista de archivos, verificación ejecutada y deuda abierta. AI-SR-QA y AI-SEC-ENG revisan de forma independiente antes de que AI-EM-ARCH consolide el informe G6; G6.5 y G7 quedan pendientes de evidencia/autoridad externa.
