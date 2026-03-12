# PROMPT — Ejecución de Fase: MOD01 Scaffold

**Versión:** 1.0
**Fecha:** 2026-03-08
**Estado:** Generado — Listo para ejecución
**Generado por:** Engineering Manager (AI-EM-ARCH)

## Módulo

- Nombre: Auth + Tenant + Audit
- Código: MOD01
- Fase: Scaffold (Pre-Sprint / Semana 0)
- Versión: 1.0
- Fecha: 2026-03-08
- Generado por: Engineering Manager (AI-EM-ARCH)
- Nombre de archivo destino: `docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md`

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Archivo destino: `docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md`
- Convención documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`
- Política de ejecución: `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md`

---

## 1. Objetivo Exacto de la Fase

- **Resultado esperado:** Monorepo Turborepo funcional con apps scaffoldeados, infraestructura Docker dev operativa, CI básico en GitHub Actions, y design tokens iWana integrados. El resultado es un workspace compilable y linteable con `turbo build` y `turbo lint` en verde, sobre el cual arrancará el Sprint 1.

- **Lo que SÍ entra:**
  - Scaffold del monorepo: `turbo.json`, `apps/` (api, web, portal, worker), `packages/` (shared, database, config, ui)
  - `docker-compose.dev.yml` con servicios: PostgreSQL 16, Redis 8, MinIO, pgBouncer, Nginx, Adminer
  - `docker-compose.yml` (producción on-premise, sin Adminer)
  - Dockerfiles base: `Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`
  - `.env.example` completo y documentado (referencia Sección 7 del HLD-MOD01-ARQUITECTURA-v1.0.md)
  - CI workflow: `.github/workflows/ci.yml` (lint + typecheck + build)
  - Par de llaves RSA 2048-bit para JWT (en `secrets/`, gitignored)
  - Design tokens iWana en `packages/ui` (basados en Manual_Implementacion_Identidad_Iwana.md)
  - Configuración base: ESLint, Prettier, TypeScript strict, Husky, lint-staged, commitlint

- **Lo que NO entra:**
  - Lógica de negocio (ningún service, guard, module de NestJS)
  - Entidades TypeORM ni migraciones
  - Endpoints de API
  - Tests funcionales o de integración
  - Configuración de SMTP real ni servicios externos pagos

---

## 2. Artefactos de Entrada Obligatorios

- **PRD del módulo:** `docs/prds/PRD-MOD01-DEFINICION-v1.1.md`
- **HLD del módulo:** `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`
- **ADRs aplicables:** ADR-001 (Modulith NestJS), ADR-002 (Multi-tenant por schema), ADR-022 (Política ejecución modular)
- **Sprint plan aplicable:** `docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md`
- **Prompt arquitectónico origen:** `docs/prompts/PROMPT-ARCHITECT-MOD01-Auth-Tenant-Audit.md`
- **Stack tecnológico:** `docs/prds/Stack_Tecnologico.md`
- **Artefactos faltantes detectados:** Ninguno — HLD ya materializado el 2026-03-08.

---

## 3. Instrucciones para Sr. Dev Fullstack

### Día 1 — Monorepo base

1. Inicializar pnpm workspaces: `pnpm init` y configurar `pnpm-workspace.yaml` con `apps/*` y `packages/*`.
2. Instalar Turborepo: `pnpm add -D turbo` en raíz.
3. Crear `turbo.json` con pipelines: `build`, `test`, `lint`, `dev`, `typecheck`.
4. Crear estructura `apps/`:
   - `apps/api` — NestJS 11 scaffold vacío (sin lógica de negocio)
   - `apps/web` — Next.js 16 scaffold vacío (portal privado de empleados)
   - `apps/portal` — Next.js 16 scaffold vacío (portal de suscriptores)
   - `apps/worker` — NestJS 11 scaffold vacío para BullMQ workers
5. Crear estructura `packages/`:
   - `packages/shared` — enums, interfaces y DTOs compartidos (sin dependencias de NestJS)
   - `packages/database` — entidades TypeORM, migraciones, templates SQL
   - `packages/config` — configuración de TypeScript, ESLint, Prettier base
   - `packages/ui` — componentes React compartidos y design tokens iWana
6. Configurar `tsconfig.base.json` en `packages/config` con `"strict": true` y path aliases.
7. Configurar ESLint + Prettier en `packages/config` (reglas base para NestJS y Next.js).
8. Configurar Husky + lint-staged en raíz: pre-commit ejecuta lint y typecheck.
9. Configurar commitlint con `@commitlint/config-conventional`.
10. Definir path aliases en cada `tsconfig.json`: `@iwana/shared`, `@iwana/db`, `@iwana/config`, `@iwana/ui`.
11. Verificar: `turbo lint` y `turbo build` pasan sin errores (apps vacías pero compilando).

### Día 2 — Infraestructura Docker

1. Crear `docker-compose.dev.yml` con los siguientes servicios configurados:
   - `postgres` — PostgreSQL 16, puerto 5432, volumen persistente, healthcheck
   - `redis` — Redis 8, puerto 6379, volumen persistente, healthcheck
   - `minio` — MinIO latest, puertos 9000 y 9001 (consola)
   - `pgbouncer` — PgBouncer 1.22+, modo transaction, puerto 6432
   - `nginx` — Nginx alpine, puerto 80/443, reverse proxy a apps/api
   - `adminer` — Adminer latest, puerto 8080 (solo dev)
2. Crear `docker-compose.yml` (producción on-premise):
   - Servicios idénticos a dev pero SIN adminer
   - Configura restart policies (`unless-stopped`)
   - Healthchecks en todos los servicios críticos
3. Crear `Dockerfile.api` (base NestJS): multi-stage build con node:22-alpine, instala deps con pnpm, build, copia dist.
4. Crear `Dockerfile.web` (base Next.js): multi-stage build, output standalone.
5. Crear `Dockerfile.worker` (base NestJS): igual a Dockerfile.api pero con comando diferente para workers.
6. Crear `.env.example` completo con TODAS las variables documentadas (ref: HLD-MOD01-ARQUITECTURA-v1.0.md Sección 7). Usar SOLO valores placeholder — nunca valores reales.
7. Crear `.env.local` (gitignored con `.gitignore`) con valores de desarrollo local.
8. Verificar: `docker compose -f docker-compose.dev.yml up` levanta sin errores.

### Día 3 — Seguridad, CI y Design Tokens

1. Generar par RSA 2048-bit para JWT:
   ```bash
   mkdir -p secrets
   openssl genrsa -out secrets/jwt-private.pem 2048
   openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
   ```
2. Agregar a `.gitignore`: `secrets/`, `.env.local`, `*.pem`.
3. Generar `ENCRYPTION_KEY` ejemplo: `openssl rand -hex 32` (documentar en `.env.example` como placeholder).
4. Crear `.github/workflows/ci.yml` con jobs:
   - `lint`: `turbo lint`
   - `typecheck`: `turbo typecheck`
   - `build`: `turbo build`
   - Trigger: `push` a `main` y `pull_request`
   - Node version matrix: 22.x
   - Caché de pnpm store
5. Configurar branch protection en `main`: require PR + CI verde (documentar como instrucción manual para el CTO).
6. Integrar design tokens iWana en `packages/ui`:
   - Colores primarios, secundarios y neutros del Manual_Implementacion_Identidad_Iwana.md
   - Tipografía base (familia, pesos, tamaños)
   - Espaciado y bordes según el manual
   - Exportar como CSS custom properties y como tokens TypeScript
7. Verificar checklist final:
   - `turbo dev` arranca sin errores
   - `turbo lint` pasa sin errores
   - `turbo build` compila todos los apps (vacíos) sin errores
   - `docker compose -f docker-compose.dev.yml up` levanta todos los servicios
   - CI verde en GitHub Actions

---

## 4. Restricciones No Negociables

- No romper los boundaries del modulith (refs: ADR-001, ADR-002).
- No generar código de lógica de negocio en esta fase (ni services, ni entities, ni guards).
- No usar credenciales reales en `.env.example` — SOLO valores placeholder como `changeme`, `<generate-with-openssl>`.
- No omitir Dockerfiles ni `docker-compose.dev.yml` — son bloqueantes para Sprint 1.
- No usar `npm` ni `yarn` — solo `pnpm` con workspaces.
- No subir archivos de la carpeta `secrets/` al repositorio.
- No iniciar Sprint 1 sin que todos los criterios de aceptación de esta fase estén en verde.

---

## 5. Entregables Técnicos Obligatorios

- [ ] Monorepo Turborepo funcional: `turbo build` completa sin errores para todos los apps.
- [ ] `docker-compose.dev.yml` funcional: todos los servicios levantan sin errores con `docker compose up`.
- [ ] `docker-compose.yml` (producción) listo para revisión.
- [ ] Dockerfiles base: `Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`.
- [ ] CI pipeline verde en GitHub Actions (lint + typecheck + build).
- [ ] `.env.example` documentado con todas las variables del HLD Sección 7.
- [ ] Design tokens base en `packages/ui`.
- [ ] Par RSA generado localmente y path configurado en `.env.local`.

---

## 6. Entregables Documentales Obligatorios

- [ ] Informe de fase en `docs/informes/INFORME-MOD01-SCAFFOLD-v1.0.md` (usar plantilla `TEMPLATE-INFORME-FASE-v1.0.md`).
- [ ] Si la fase encuentra un bloqueo, documentar en `docs/quality/` usando `TEMPLATE-DECISION-BLOQUEO-TECNICO.md`.
- [ ] Actualizar este PRD si surgieron cambios de alcance durante el scaffold.

---

## 7. Criterios de Aceptación

| ID              | Criterio                                                                  | Verificación                                              |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| CA-SCAFFOLD-001 | `docker compose -f docker-compose.dev.yml up` levanta sin errores         | Terminal: todos los servicios `healthy` o `running`       |
| CA-SCAFFOLD-002 | `turbo build` compila todos los apps sin errores (vacíos pero compilando) | Exit code 0 en `turbo build`                              |
| CA-SCAFFOLD-003 | `turbo lint` pasa sin errores                                             | Exit code 0 en `turbo lint`                               |
| CA-SCAFFOLD-004 | CI verde en GitHub Actions (lint + typecheck + build)                     | GitHub Actions: todos los checks en verde                 |
| CA-SCAFFOLD-005 | `.env.example` completo con todas las variables documentadas              | Diff contra lista en HLD Sección 7: 0 variables faltantes |

---

## 8. Criterio de Stop/Go

- **Detenerse inmediatamente si:** Docker Desktop no está disponible o no funciona en la máquina de desarrollo.
- **Documentar causa en:** `docs/quality/DECISION-BLOQUEO-SCAFFOLD.md` (usar template de bloqueo técnico).
- **Escalar a:** CTO.
- **Recomendación:** No continuar con Sprint 1 hasta resolver el bloqueo. La infraestructura Docker es prerequisito bloqueante para el Sprint 1 (no se puede correr PostgreSQL ni Redis sin contenedores o equivalente local).

---

## 9. Criterio de Salida de la Fase

- **Backend validado:** `turbo build` pasa para `apps/api` (scaffold vacío compilando con TypeScript strict).
- **Frontend validado:** `turbo build` pasa para `apps/web` y `apps/portal` (scaffolds vacíos compilando).
- **Base de datos validada:** Contenedor PostgreSQL levanta y acepta conexiones en `localhost:5432`.
- **Tests en verde:** N/A — no hay tests funcionales en la fase de scaffold. `turbo test` puede devolver "no tests found" sin error.
- **Documentación archivada:** `docs/informes/INFORME-MOD01-SCAFFOLD-v1.0.md` completado y archivado.

---

_Prompt generado por: AI-EM-ARCH (Engineering Manager + Architect) — iWana neXt Platform_
_Fecha: 2026-03-08 | Framework de Gobernanza Multi-IA v2.0_
_Referencia HLD: docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md_
_Referencia ADR: docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md_
