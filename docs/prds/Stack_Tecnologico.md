# Stack Tecnológico — iWana neXt Platform

**Última actualización:** 2026-04-01
**Fuente:** Documentación oficial de cada proyecto (verificado)

> ⚠️ **IMPORTANTE — Dos capas de versiones:**
>
> - **Este archivo:** Registra las **últimas versiones estables disponibles** (fuentes oficiales).
>   Es la referencia de "qué es lo más reciente" para tomar decisiones de actualización.
> - **PROMPT-EXEC de cada sprint:** Declara las versiones **probadas en conjunto** para ese sprint.
>   Pueden ser menores por compatibilidad entre dependencias.
>
> Toda actualización que implique **breaking changes** requiere ADR aprobado por el Architect Software
> antes de incorporarse a un PROMPT-EXEC.

---

## Runtime y Tooling

| Tecnología    | Versión Latest (Abr 2026)        | Link oficial                                       |
| ------------- | -------------------------------- | -------------------------------------------------- |
| Node.js       | **25.8.2** (current; LTS: v24.x) | <https://nodejs.org/en/blog/>                      |
| pnpm          | **10.32.1**                      | <https://github.com/pnpm/pnpm/releases>            |
| TypeScript    | **5.9.3**                        | <https://www.typescriptlang.org/docs>              |
| Turborepo     | **2.8.11**                       | <https://turbo.build/repo/docs>                    |
| Docker Engine | **29.1.5**                       | <https://docs.docker.com/engine/release-notes/29/> |

---

## Backend (apps/api)

| Paquete                 | Versión Latest (Abr 2026) | Notas                                            |
| ----------------------- | ------------------------- | ------------------------------------------------ |
| NestJS (`@nestjs/core`) | **11.1.14**               | <https://github.com/nestjs/nest/releases>        |
| TypeORM                 | **0.3.28**                | <https://github.com/typeorm/typeorm/releases>    |
| BullMQ                  | **5.71.0**                | <https://github.com/taskforcesh/bullmq/releases> |
| Zod                     | **4.0.1** ⚠️              | <https://github.com/colinhacks/zod/releases>     |
| bcryptjs                | **3.0.3**                 | <https://www.npmjs.com/package/bcryptjs>         |
| otplib                  | **13.3.0** ⚠️             | <https://github.com/yeojz/otplib>                |
| pg (node-postgres)      | latest stable             | <https://github.com/brianc/node-postgres>        |
| ioredis                 | **5.10.0**                | <https://github.com/redis/ioredis>               |
| Pino                    | latest stable             | <https://github.com/pinojs/pino>                 |
| Helmet                  | latest stable             | <https://github.com/helmetjs/helmet>             |
| uuid                    | latest stable             | <https://github.com/uuidjs/uuid>                 |
| nodemailer              | latest stable             | <https://nodemailer.com/>                        |

---

## Frontend (apps/web, apps/portal)

| Paquete                 | Versión Latest (Abr 2026) | Notas                                         |
| ----------------------- | ------------------------- | --------------------------------------------- |
| Next.js                 | **16.1.6**                | <https://nextjs.org/blog>                     |
| React                   | **19.2**                  | <https://react.dev/versions>                  |
| Tailwind CSS            | **4.x** ⚠️                | <https://tailwindcss.com/blog/tailwindcss-v4> |
| shadcn/ui               | **2.5.0+**                | <https://ui.shadcn.com/docs/changelog>        |
| `@tanstack/react-query` | latest stable             | <https://tanstack.com/query>                  |
| react-hook-form         | latest stable             | <https://react-hook-form.com/>                |
| Zod                     | **4.0.1** ⚠️              | (compartido con backend; en proyecto: 3.24.2) |

---

## Testing

| Paquete    | Versión Latest (Abr 2026) | Notas                                              |
| ---------- | ------------------------- | -------------------------------------------------- |
| Jest       | **29.7.0**                | <https://jestjs.io/versions>                       |
| Playwright | **1.58.2**                | <https://github.com/microsoft/playwright/releases> |
| Supertest  | latest stable             | Integración con Jest para integration tests        |

---

## Infraestructura

| Servicio   | Versión Latest (Abr 2026) | Notas                                    |
| ---------- | ------------------------- | ---------------------------------------- |
| PostgreSQL | **18.3** ⚠️               | <https://www.postgresql.org/about/news/> |
| Redis      | **8.6**                   | <https://redis.io/downloads/>            |
| pgBouncer  | latest stable             | <https://www.pgbouncer.org/>             |
| MinIO      | latest stable             | <https://min.io/download>                |

---

## Notas de breaking changes ⚠️

Las tecnologías marcadas tienen breaking changes significativos respecto a las versiones
del Sprint 1. El **Architect Software debe emitir un ADR** validando compatibilidad antes
de que el Staff Engineer proponga actualizar el PROMPT-EXEC de un sprint:

| Tecnología       | Versión Sprint 1 | Versión Latest               | Impacto principal                                                          |
| ---------------- | ---------------- | ---------------------------- | -------------------------------------------------------------------------- |
| **PostgreSQL**   | 16               | 18.3                         | Cambios en SQL parser, comportamiento de RLS, funciones                    |
| **Tailwind CSS** | 3.4.x            | 4.x                          | Sintaxis de configuración completamente nueva (CSS-first, sin JS config)   |
| **Zod**          | 3.24.x           | 4.0.1                        | API de métodos cambiada — migración requerida en todos los validators      |
| **otplib**       | 7.11.x           | 13.3.x                       | API de autenticación TOTP cambiada (+6 versiones major)                    |
| **bcryptjs**     | 2.4.x            | 3.0.x                        | Paquete en uso es `bcryptjs` (no `bcrypt`); revisar compatibilidad Node 24 |
| **Node.js**      | 22.14.0 LTS      | 25.8.2 (current; LTS: v24.x) | Cambios en resolución de módulos, deprecaciones de APIs                    |
| **pnpm**         | 9.15.x           | 10.x                         | Workspace protocol y lockfile format                                       |
| **Next.js**      | 15.2.x           | 16.x                         | Revisar App Router, RSC y Server Actions                                   |

---

## Contexto histórico de versiones por sprint

| Sprint   | Node.js             | NestJS  | Next.js | PostgreSQL | Fecha verificación |
| -------- | ------------------- | ------- | ------- | ---------- | ------------------ |
| Sprint 1 | 22.14.0 LTS         | 11.1.0  | 15.2.0  | 16         | 2026-02-27         |
| Sprint 2 | 25.8.2 (LTS: v24.x) | 11.1.14 | 16.1.6  | 18         | 2026-04-01         |

> El Architect Software actualiza esta tabla al inicio de cada sprint si propone cambios de versión.
> Las versiones deben ser verificadas en conjunto antes de actualizar el PROMPT-EXEC.

---

## Evaluación de Adecuación para iWana neXt

### Conclusión Ejecutiva

El stack definido es **adecuado para el proyecto** iWana neXt por estas razones:

- **NestJS + Modulith** encaja bien con un equipo pequeño, dominio complejo y necesidad de crecer por módulos sin asumir la complejidad operativa de microservicios desde el MVP.
- **PostgreSQL multi-tenant por schema** es una decisión correcta para aislamiento fuerte, cumplimiento y reporting transaccional en un entorno ISP/ERP on-premise.
- **Next.js + Tailwind CSS + shadcn/ui** es una combinación adecuada para dashboards operativos, portales multirol y consistencia visual rápida.
- **Redis + BullMQ** resuelve bien caché, sesiones, colas y tareas asincrónicas del dominio ISP sin introducir infraestructura innecesaria.
- **Turborepo** es apropiado para compartir contratos, DTOs, diseño UI y configuración entre apps y packages.

### Riesgo Principal

El riesgo no está en la **selección del stack**, sino en intentar mover simultáneamente demasiadas piezas a su última versión major durante una fase MVP con despliegue on-premise y múltiples integraciones críticas.

---

## Recomendación de Baseline Implementable

### Regla general

Para iWana neXt se recomienda distinguir entre:

- **Latest stable de referencia:** útil para vigilancia tecnológica.
- **Baseline implementable del sprint:** útil para construir sin romper compatibilidad.

### Recomendación actual

El proyecto adopta un **baseline moderno alineado con latest stable** para las capas principales del stack. Esto implica trabajar con las versiones más recientes listadas en este documento, no solo como referencia tecnológica sino como dirección operativa deseada.

| Tecnología                      | Evaluación                                                     | Recomendación                                                           |
| ------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **NestJS 11.1.x**               | Adecuado y maduro                                              | **Adoptar** como baseline                                               |
| **TypeORM 0.3.28**              | Adecuado para Modulith + migraciones versionadas               | **Adoptar** como baseline                                               |
| **BullMQ 5.71.x**               | Adecuado para jobs de provisioning, billing y ETL              | **Adoptar** como baseline                                               |
| **Next.js 16.1.x**              | Adecuado para App Router, portales multirol y RSC              | **Adoptar** como baseline                                               |
| **React 19.2**                  | Coherente con Next.js 16                                       | **Adoptar** como baseline                                               |
| **Tailwind CSS 4.x**            | Adecuado y consistente con el enfoque CSS-first ya documentado | **Adoptar** como baseline                                               |
| **shadcn/ui 2.5+**              | Muy adecuado para velocidad de desarrollo y consistencia de UI | **Adoptar** como baseline                                               |
| **PostgreSQL 18.3**             | Potente y alineado al crecimiento del proyecto                 | **Adoptar**, con validación reforzada de RLS, migraciones y performance |
| **Redis 8.6**                   | Adecuado y consistente con BullMQ                              | **Adoptar** como baseline                                               |
| **Node.js 25.8.2** (LTS: v24.x) | LTS vigente y deseado para el proyecto                         | **Adoptar** como baseline                                               |
| **pnpm 10.32.x**                | Coherente con Node 24/25 y monorepo moderno                    | **Adoptar** como baseline                                               |
| **Zod 4.0.1**                   | Adecuado para validación moderna del proyecto                  | **Adoptar** como baseline                                               |
| **otplib 13.3.x**               | Adecuado para MFA/TOTP en baseline moderno                     | **Adoptar** como baseline                                               |
| **bcryptjs 3.0.x**              | Adecuado y verificado con runtime actual                       | **Adoptar** como baseline                                               |

---

## Recomendación Arquitectónica por Fase

### Para el MVP inmediato

Se adopta una estrategia **moderna con latest stable**, manteniendo control técnico explícito en los puntos de mayor riesgo:

- Mantener la arquitectura actual: NestJS + TypeORM + PostgreSQL + Redis + BullMQ + Next.js + Tailwind + shadcn/ui.
- Trabajar con las últimas versiones listadas en este documento como baseline objetivo del proyecto.
- Tratar la validación conjunta como criterio de entrada al sprint, no como razón para degradar versiones por defecto.

### Regla de ejecución

1. El baseline del sprint debe declarar explícitamente Node 24/25, pnpm 10, Next.js 16, Tailwind 4, Zod 4, otplib 13, bcryptjs 3 y PostgreSQL 18 si ese sprint los usa.
2. Todo cambio con breaking changes debe acompañarse de smoke tests, pruebas de compatibilidad y, si afecta decisiones estructurales, ADR correspondiente.
3. La estrategia del proyecto es **adoptar latest stable con disciplina**, no permanecer en versiones anteriores por inercia.

---

## Recomendación de Baseline Sugerido para Sprint 2

El baseline sugerido para el siguiente sprint, alineado con la decisión actual del proyecto, es:

| Capa            | Recomendación Sprint 2                                          |
| --------------- | --------------------------------------------------------------- |
| Runtime         | Node.js 25.8.2 (LTS: v24.x)                                     |
| Package manager | pnpm 10.32.x                                                    |
| Backend         | NestJS 11.1.x + TypeORM 0.3.28 + BullMQ 5.71.x                  |
| Frontend        | Next.js 16.1.x + React 19.2 + Tailwind CSS 4.x + shadcn/ui 2.5+ |
| Validación      | Zod 4.0.1 (en proyecto activo: 3.24.2)                          |
| Auth/MFA        | otplib 13.3.x + bcryptjs 3.0.x                                  |
| Infra de datos  | PostgreSQL 18.3                                                 |
| Cache/colas     | Redis 8.6                                                       |

### Justificación

Esta combinación alinea el proyecto con un baseline actual, reduce deuda de actualización diferida y deja la carga de trabajo concentrada en validar compatibilidad una sola vez sobre la base tecnológica objetivo.

### Controles obligatorios para este baseline

- Smoke test de instalación completa en monorepo con Node 24 + pnpm 10.
- Verificación de compatibilidad real de bcryptjs 3 y otplib 13.
- Validación de todos los schemas y validators con Zod 4 (migración pendiente desde 3.24.2).
- Pruebas de RLS, migraciones y rendimiento básico sobre PostgreSQL 18.3.
- Validación de frontend con Next.js 16 + React 19 + Tailwind 4 + shadcn/ui.

---

## Decisión Recomendada

**Sí, el stack es adecuado para el proyecto.**

**Sí, el proyecto adopta latest stable como baseline objetivo de trabajo.**

La decisión técnicamente más sólida para iWana neXt es:

- mantener este documento como fuente primaria del baseline objetivo,
- fijar por sprint la combinación exacta de versiones implementadas,
- trabajar con Node 24/25 + pnpm 10 + Zod 4 + otplib 13 + bcryptjs 3 + PostgreSQL 18 como línea base moderna,
- y acompañar esa decisión con pruebas conjuntas y ADR cuando los breaking changes afecten arquitectura, seguridad o persistencia.
