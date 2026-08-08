# Remediación de configuración raíz — Plan de implementación

> **Para agentes ejecutores:** sub-skill obligatoria: `subagent-driven-development` o `executing-plans`. Cada tarea se ejecuta con su responsable RACI, revisión de especificación y revisión de calidad separadas.

**Objetivo:** cerrar los hallazgos P0/P1 de higiene de build, cableado productivo y reproducibilidad del monorepo sin alterar el cambio local existente en `apps/api/src/common/pagination/clamp-page-endpoints.controller.http.spec.ts`.

**Arquitectura:** se conservan los cinco Compose y el baseline Docker on-prem. La fase corrige únicamente el contexto Docker, las dependencias reales de producción y los contratos de configuración/build. No incorpora infraestructura nueva ni cambia boundaries, tenancy, APIs o esquemas.

**Stack:** Docker Compose, pnpm 10, Turborepo 2, ESLint flat config, NestJS, Next.js.

---

## Alcance congelado

- Incluir: exclusiones del contexto Docker; cableado ya consumido por API/worker/migrator; contrato de variables productivas; política pnpm/Turbo/ESLint; eliminación de artefactos raíz sin consumidor; documentación e informe de fase.
- Excluir: rotar o revocar cuentas fuera del repositorio; reescribir historia Git; borrar dumps `.backups/`; migrar a Docker secrets, segmentación de redes, Redis auth, pgBouncer o cambios de imagen/base. Estas acciones requieren decisión y/o ejecución del CTO/operación.
- Contrato de API congelado: no cambia.
- Contrato de componente congelado: no aplica; no hay superficie UI.

## Tarea 1 — Seguridad de build y operación Docker

**Responsable:** AI-PLAT-OPS. **Consulta obligatoria:** AI-SEC-ENG para PII/secretos.  
**Archivos:** `.dockerignore`, `.gitignore`, `docker-compose.prod.yml`, `.env.production.example`, `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` y `login-request.json`.

- [ ] Excluir `.backups/`, `apps/api/storage/`, artefactos HAR/trace, caches locales y el payload de login del contexto Docker.
- [ ] Ignorar el payload de login y endurecer la excepción de `secrets/` sin impedir `.gitkeep`.
- [ ] Cablear en producción las variables que ya consumen worker, API y migrator: credenciales de migrador, Typesense, SMTP y la clave MFA activa/anterior.
- [ ] Ordenar API/worker detrás de migraciones y bootstrap de MinIO sin convertir los servicios one-shot en dependencias de desarrollo.
- [ ] Actualizar el runbook para ejecutar/esperar `minio-init` y documentar las variables productivas requeridas.
- [ ] Eliminar `login-request.json` del índice y del árbol de trabajo. No afirmar que la credencial fue revocada ni reescribir historia.
- [ ] Validar con los tres renders `docker compose ... config --quiet` sin imprimir variables sensibles y una comprobación estática de exclusiones.

## Tarea 2 — Toolchain y caché reproducible

**Responsable:** AI-FE-PLATFORM (monorepo). **Consulta obligatoria:** AI-SEC-ENG si un cambio reduce una protección de instalación.  
**Archivos:** `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.npmrc`, `eslint.config.js`, `.husky/pre-commit`, `.husky/commit-msg`, `jest.config.cjs`, `.lintstagedrc.cjs`.

- [ ] Reemplazar la política placeholder de `allowBuilds` por booleanos pnpm 10 y retirar el mecanismo sustituido, conservando la intención de permitir solo builds aprobados.
- [ ] Eliminar el override duplicado; conservar una única fuente de verdad de overrides y regenerar el lockfile únicamente mediante pnpm.
- [ ] Declarar inputs raíz y variables externas que determinan `build` de Turbo, sin hashear plantillas que no participen en el build.
- [ ] Corregir dependencias/hook scripts para que Husky use scripts de raíz y no dependa de un PATH implícito.
- [ ] Completar el agregador Jest o documentar su exclusión; no dejar suites de packages omitidas silenciosamente.
- [ ] Aplicar las reglas críticas ESLint de TypeScript que se declaran en `AGENTS.md`, sin introducir `any` ni desactivar reglas por bloque.
- [ ] Validar con `pnpm install --frozen-lockfile --ignore-scripts --offline`, `pnpm turbo run build --dry=json`, lint/typecheck focalizados y la ejecución de los hooks en modo seguro.

## Tarea 3 — Higiene documental y artefactos raíz

**Responsable:** AI-PLAT-OPS para scripts/configuración, AI-SR-QA para verificación documental.  
**Archivos:** `AGENTS.md`, `CLAUDE.md`, `.gitattributes`, `.prettierignore`, `install.cmd`, `scripts/refactor_page.mjs`, `e2e-api.log`, `tmp-api.log`, `tmp-portal.log`, `docs/informes/INFORME-PLATAFORMA-REMEDIACION-RAIZ-v1.0.md`.

- [ ] Actualizar `AGENTS.md` para usar pnpm en los comandos puntuales y reflejar packages reales, preservando su condición de fuente maestra.
- [ ] Reducir `CLAUDE.md` a bootstrap y referencias, sin duplicar reglas de `AGENTS.md`.
- [ ] Eliminar el instalador huérfano y el script one-off inválido junto con su ignore dedicado.
- [ ] Eliminar los tres logs locales específicos auditados; no borrar `.backups/` ni otros archivos ignorados.
- [ ] Alinear finales de línea para nuevos cambios (LF general, CRLF solo cmd/bat) sin una renormalización masiva.
- [ ] Redactar el informe de fase con evidencia real, deuda abierta y la escalación de revocación/historia Git.

## Criterio stop/go

Detener y emitir `[BLOQUEO]` si una corrección exige valores secretos, cambia una decisión de ADR, altera la topología aprobada o rompe la modificación local preservada. Emitir `[ESCALACION AL CTO]` para revocación de la credencial, evaluación de cachés/registro Docker e higiene de la historia Git.

## Criterio de salida

- Renders Compose estructuralmente válidos y sin secretos impresos.
- Política pnpm y caché Turbo verificables.
- Lint y typecheck ejecutados con sus resultados reales.
- Informe de fase localizable en `docs/informes/` y gates G6/G6.5/G7 registrados por separado.
