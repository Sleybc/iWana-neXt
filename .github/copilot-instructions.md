# iWana neXt — Copilot Instructions

## Proposito

Este archivo es el bootstrap operativo del workspace para GitHub Copilot.

- `AGENTS.md` es la fuente maestra de gobernanza, precedencia documental y boundaries.
- `CLAUDE.md` complementa con comandos, arquitectura operativa y gotchas ya verificados.
- Usa este archivo para arrancar rapido y luego profundiza en las fuentes anteriores cuando la tarea lo requiera.

## Fuentes obligatorias

Antes de proponer arquitectura, cambios de modulo o decisiones de seguridad, revisa en este orden:

1. `AGENTS.md`
2. `docs/prds/Stack_Tecnologico.md`
3. PRD del sistema o del modulo vigente
4. HLD del modulo vigente
5. ADRs aplicables

Si dos artefactos chocan en multi-tenancy, seguridad, boundaries o stack, no inventes una sintesis: documenta el conflicto y escala.

## Build y Test

Usa `pnpm` en todo el monorepo. No uses `npm` ni `yarn` para flujos del repo.

- `pnpm dev` levanta Docker dev y ejecuta `turbo run dev`
- `pnpm build` ejecuta `turbo run build`
- `pnpm lint` ejecuta `turbo run lint`
- `pnpm typecheck` ejecuta `turbo run typecheck`
- `pnpm test` ejecuta `turbo run test`
- `pnpm test:e2e` ejecuta Playwright web
- `pnpm test:e2e:portal` ejecuta Playwright portal

Para workspaces puntuales:

- `pnpm --filter @iwana/api test`
- `pnpm --filter @iwana/web test`
- `pnpm --filter @iwana/portal test`
- `pnpm --filter @iwana/db migration:run`

Nota de entorno Windows: Corepack puede fallar en NTFS/Win11. Si pasa, instala `pnpm@10` globalmente y continua.

## Arquitectura

Monorepo Turborepo + pnpm con esta separacion funcional:

- `apps/api`: NestJS modulith, API REST versionada, puerto 3000
- `apps/web`: consola de plataforma, puerto 3001
- `apps/portal`: consola empresarial tenant-aware, puerto 3002
- `apps/worker`: consumidores BullMQ sin HTTP
- `packages/database`: TypeORM, entities, DataSource, migraciones
- `packages/shared`: DTOs, enums, interfaces y contratos compartidos
- `packages/ui`: design system y estilos globales
- `packages/config`: tsconfig, eslint y prettier compartidos

Reglas estructurales no negociables:

- Modulith con boundaries explicitos por modulo
- Multi-tenant por schema PostgreSQL desde el inicio
- Sin acceso directo a tablas de otro modulo
- Sin imports circulares entre bounded contexts
- Comunicacion inter-modulo via interfaces tipadas o eventos
- API externa REST con OpenAPI

## Convenciones criticas

- Versiones: no asumir. Consultar `docs/prds/Stack_Tecnologico.md`.
- Validacion: Zod en boundaries externos y formularios; no omitir validaciones por conveniencia.
- ORM: TypeORM con migraciones versionadas. No usar `synchronize: true` en produccion.
- Tenant: nunca hardcodear tenant ni schema. Resolver siempre desde contexto de request o flujo aprobado.
- Seguridad: cero PII real, secretos, tokens o connection strings en codigo, tests, docs o logs.
- Comentarios: escribir en espanol cuando la logica no sea trivial.
- Testing: Jest + Supertest en backend, Jest en unit frontend, Playwright en E2E. Mantener cobertura >= 80% en modulos core.
- Informes: despues de cambios, actualizar el informe vigente en `docs/informes/`; si es correctivo, reutilizar el documento vivo.
- Documentos nuevos: usar `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.
- Prompts de fase: derivar de `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`.

## Skills

Cuando una skill aplique, leela antes de actuar. Las skills activas viven en `.agents/skills/{nombre}/SKILL.md`.

Atajos utiles:

- Backend NestJS: `nestjs-expert`
- Auth, JWT, MFA: `auth-implementation-patterns`
- PostgreSQL y TypeORM: `postgresql`
- Frontend App Router: `nextjs-app-router-patterns`
- Formularios y UI: `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`
- Testing: `testing-patterns`, `playwright-skill`, `e2e-testing-patterns`
- Docs e informes: `docs-architect`
- Seguridad: `backend-security-coder`, `frontend-security-coder`, `security-auditor`

Para el mapa completo de despacho, usa `AGENTS.md`.

## Gotchas del repo

- `@Roles()` debe usar `UserRole.*`; strings literales pueden producir 403 silencioso.
- Con pgBouncer en transaction pooling, el `search_path` no persiste: usar `SET LOCAL` por transaccion.
- `AsyncLocalStorage` no se propaga a BullMQ automaticamente; pasar contexto de tenant de forma explicita.
- El token `scope='mfa-setup'` incluye `tenantId` y `schemaName`; no dependas de `X-Tenant-Slug` en ese flujo.
- `setupMfa()` es idempotente para tolerar dobles invocaciones en React Strict Mode.
- Tailwind es v4 CSS-first: no agregues `tailwind.config.js` salvo ADR explicito.
- Para texto sobre blanco con color secundario, usar `iwana-secondary-700`; el verde secundario base no cumple AA para texto.

## Archivos guia

Revisa estos archivos para aterrizar patrones reales antes de tocar codigo:

- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/modules/auth/`
- `packages/database/src/data-source.ts`
- `packages/database/src/tenant-context.ts`
- `packages/ui/src/styles/globals.css`
- `apps/portal/src/lib/api-client.ts`
- `apps/api/jest.config.js`
- `docs/adrs/ADR-019-JWT-RS256-Refresh-Rotation.md`

## Entregables

En entregables mayores:

- declara el modo activo: `EM`, `Architect` o `Mixto`
- referencia los documentos que soportan la decision
- usa `[ESCALACION AL CTO]` si hay excepcion de seguridad, boundary o stack
