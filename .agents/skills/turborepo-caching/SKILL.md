---
name: turborepo-caching
description: Optimización de pipelines Turborepo 2.x con caché local y remoto para iWana neXt. Usar cuando se configuren pipelines de build, se optimice CI/CD o se depuren cache misses en el monorepo pnpm.
---

# Turborepo Caching — iWana neXt

## Propósito

Gobierna la configuración y optimización del pipeline de Turborepo 2.x en el monorepo iWana neXt.
El proyecto usa pnpm@10.32.1 como gestor de paquetes y Turborepo 2.x con sintaxis `"tasks"`.

## Usar este skill cuando

- Se configure o modifique `turbo.json` (pipeline de tasks, inputs, outputs, cache).
- Se depuren cache misses en CI o en desarrollo local.
- Se optimice el tiempo de build en CI/CD.
- Se evalúe la configuración de remote caching on-prem.
- Se agreguen nuevas apps o packages al monorepo y necesiten tareas en el pipeline.

## No usar este skill cuando

- La tarea sea de arquitectura general del monorepo (usar `monorepo-architect`).
- La tarea sea de configuración de CI/CD sin relación con caché (usar `docker-expert`).

## Regla crítica: Turborepo 2.x usa `"tasks"`, no `"pipeline"`

```json
// ✅ Correcto — Turborepo 2.x
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { ... }
  }
}

// ❌ Incorrecto — Turborepo v1 (no usar en este repo)
{
  "pipeline": {
    "build": { ... }
  }
}
```

## Estructura del turbo.json del repo

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts", "**/*.spec.ts"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

## Comandos pnpm en este monorepo

```bash
# Correr una tarea en todos los workspaces
pnpm build          # turbo build
pnpm test           # turbo test
pnpm lint           # turbo lint
pnpm typecheck      # turbo typecheck

# Correr en un workspace específico
pnpm --filter @iwana/api build
pnpm --filter @iwana/web dev
pnpm --filter @iwana/db test

# Ver qué se cachea y qué no
pnpm turbo run build --dry-run
pnpm turbo run build --verbosity=2

# Limpiar caché local
pnpm turbo daemon stop
rm -rf .turbo
```

## Depuración de cache misses

Un cache miss ocurre cuando Turborepo no puede reutilizar un resultado previo.

### Causas comunes y soluciones

**1. Inputs mal definidos — se incluyen archivos que cambian siempre**

```json
// ❌ Demasiado amplio — cualquier cambio en el repo invalida el caché
"test": {
  "inputs": ["**/*"]
}

// ✅ Solo los archivos relevantes para los tests
"test": {
  "inputs": ["src/**/*.ts", "src/**/*.tsx", "**/*.spec.ts", "**/*.test.ts"]
}
```

**2. Variables de entorno no declaradas**

```json
// Declarar variables de entorno que afectan el output
"build": {
  "dependsOn": ["^build"],
  "env": ["NODE_ENV", "NEXT_PUBLIC_API_URL"],
  "outputs": [".next/**", "!.next/cache/**"]
}
```

**3. Outputs no definidos — Turborepo no sabe qué guardar en caché**

```json
"build": {
  "dependsOn": ["^build"],
  "outputs": [".next/**", "!.next/cache/**", "dist/**"]
}
```

## Remote caching on-prem

El proyecto es on-premise. Las opciones compatibles sin Vercel son:

### Opción 1: turbo-remote-cache (self-hosted, recomendado para MVP)

```bash
# Instalar el servidor de caché remoto
npx turbo-remote-cache
```

Configuración en `turbo.json`:
```json
{
  "remoteCache": {
    "enabled": true
  }
}
```

Variables de entorno en CI:
```bash
TURBO_TOKEN=<token-generado>
TURBO_TEAM=iwana-next
TURBO_API=http://<tu-servidor>:3000
```

### Opción 2: Caché local compartido via volumen Docker (CI simple)

Para un CI on-prem sin servidor de caché, montar `.turbo` como volumen persistente entre runs:

```yaml
# En el CI runner — montar el directorio de caché
volumes:
  - turbo-cache:/app/.turbo
```

## Checklist de configuración

- [ ] `turbo.json` usa `"tasks"` (no `"pipeline"`)
- [ ] Cada task tiene `outputs` definidos si produce artefactos
- [ ] `env` declaradas para variables que afectan el build
- [ ] `inputs` acotados — no usar `**/*` salvo en tasks sin caché
- [ ] `dev` y `clean` tienen `"cache": false`
- [ ] `packageManager` en `package.json` raíz: `"pnpm@10.32.1"` (requisito Turborepo 2.x)

## Anti-patrones

- Usar `"pipeline"` en lugar de `"tasks"` — sintaxis v1, Turborepo 2.x la ignora silenciosamente
- `inputs: ["**/*"]` — invalida el caché con cualquier cambio
- Variables de entorno no declaradas en `env` — cache inconsistente entre entornos
- Asumir remote caching Vercel — el proyecto es on-prem
- Usar `npm` o `yarn` en scripts — el monorepo usa pnpm exclusivamente
