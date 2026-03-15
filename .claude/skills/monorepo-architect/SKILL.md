---
name: monorepo-architect
description: Monorepo guidance for iWana neXt with Turborepo, pnpm, boundaries claros y caching coherente con el workspace. Use cuando se definan packages, pipelines, dependencias internas o convenciones del monorepo real del proyecto.
---

# Monorepo Architect

## Proposito

Este skill aterriza la arquitectura del monorepo de iWana neXt sobre Turborepo y pnpm. No trata la seleccion entre herramientas; parte de la decision ya tomada y se enfoca en estructura, boundaries, pipelines y calidad operativa.

## Usar este skill cuando

- se creen nuevas apps o packages dentro del monorepo
- se definan pipelines de build, lint, test o typecheck
- se revisen boundaries entre paquetes
- se optimicen caches, dependencias o tiempos de CI

## No usar este skill cuando

- la tarea sea puramente de feature dentro de un solo paquete
- la decision principal sea de arquitectura backend o frontend y no del monorepo
- se quiera evaluar Nx, Bazel o Lerna como alternativas activas para este repo

## Decisiones base del monorepo

1. Turborepo es la orquestacion principal.
2. pnpm es el gestor de paquetes esperado.
3. El monorepo debe reforzar boundaries, no diluirlos.
4. Cada package debe tener responsabilidad clara y API publica minima.
5. Los pipelines deben ser cacheables, reproducibles y acotados.

## Estructura real del monorepo iWana neXt

```
iwana-next/
├── apps/
│   ├── api/          @iwana/api      — NestJS Modulith (puerto 3000)
│   ├── web/          @iwana/web      — Next.js Admin (puerto 3001)
│   ├── portal/       @iwana/portal   — Next.js Portal Cliente (puerto 3002)
│   └── worker/       @iwana/worker   — BullMQ consumers (sin puerto HTTP)
├── packages/
│   ├── database/     @iwana/db       — TypeORM entities, DataSource, migrations
│   ├── shared/       @iwana/shared   — DTOs, enums, interfaces compartidas
│   ├── ui/           @iwana/ui       — Design system: tokens, componentes
│   └── config/       @iwana/config   — tsconfig/eslint/prettier base
├── e2e/                              — Tests Playwright (web + portal)
├── docs/                             — ADRs, HLDs, PRDs, informes, plans
├── .agents/skills/                   — Catálogo de skills del proyecto
├── turbo.json
├── pnpm-workspace.yaml
└── package.json  ← debe tener "packageManager": "pnpm@10.32.1"
```

### Requisitos del gestor de paquetes

- **pnpm@10.32.1** — instalar con `npm install -g pnpm` (Corepack bloqueado por NTFS en Win11)
- El campo `"packageManager": "pnpm@10.32.1"` en `package.json` raíz es **obligatorio** para Turborepo 2.x
- `pnpm.onlyBuiltDependencies` requerido para: `@nestjs/core`, `msgpackr-extract`, `sharp`

## Reglas de boundary

- una app puede depender de packages compartidos aprobados
- un package no debe importar internals de otro package
- evitar dependencias ciclicas entre packages
- no mezclar logica de dominio con utilidades genericas en el mismo package
- si un package expone demasiado, probablemente esta mal cortado

## Reglas de pipeline

- definir tareas claras: `lint`, `typecheck`, `test`, `build`
- cachear todo lo deterministico
- declarar outputs correctos en `turbo.json`
- evitar scripts que mezclen demasiadas responsabilidades
- preferir pipelines incrementales y composables

## Checklist para nuevos packages

- [ ] nombre coherente con su responsabilidad
- [ ] `package.json` minimo y limpio
- [ ] entrada publica clara
- [ ] sin imports a rutas internas de otros paquetes
- [ ] scripts alineados con turbo
- [ ] pruebas y typecheck cuando aplique

## Anti-patrones

- tratar el monorepo como si fuera un solo proyecto sin boundaries
- duplicar configuracion entre apps si puede centralizarse en un package de config
- crear packages demasiado pequenos sin beneficio real
- meter codigo especifico de una app en un package supuestamente compartido
- introducir decisiones o ejemplos orientados a Nx, Bazel o Lerna como camino por defecto

## Integracion con otras skills

- `architect-review` para validar boundaries y tradeoffs
- `nestjs-expert` para la app backend
- `nextjs-app-router-patterns` para la app web
- `typescript-expert` para tipado y toolchain
- `docker-expert` para empaquetado y despliegue
