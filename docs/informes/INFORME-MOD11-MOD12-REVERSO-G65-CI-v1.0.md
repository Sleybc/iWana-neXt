# Reparación de G6.5 — CI del reverso MOD11 ↔ MOD12

- **Fecha:** 2026-10-10
- **Rama:** `main`
- **Dictamen actual:** **pendiente de CI Linux sobre el SHA correctivo**.
- **CI previa:** run `38066413751`, SHA `26a6c8b5`; el job bloqueante falló en Build.

## Causa y corrección

La construcción de `apps/web` falló 35 veces al resolver `Exo_2` por `next/font/google`. Next.js 16.2.12/Turbopack recibió URLs de Google Fonts sin extensión; el job de imagen aislada pasó con otra respuesta. Se eliminaron las descargas de fuentes de Google durante el build: `apps/web` y `apps/portal` cargan ahora Exo 2 y JetBrains Mono desde `packages/ui/src/styles/fonts/`, junto con sus licencias OFL. La guía oficial de Next admite el autoalojamiento con `next/font/local`; el fallo de resolución coincide con [Next.js #99114](https://github.com/vercel/next.js/issues/99114).

## Verificación local de la reparación

| Gate                                  | Resultado                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm typecheck --force`              | **8/8**, `Cached: 0`                                                                       |
| Worker Jest                           | **20 suites, 167/167 tests**                                                               |
| Lint del worker                       | **0 errores**, 1 warning preexistente en `apps/worker/src/main.ts:56`                      |
| Build Next de web y portal            | **GO local**; ambas aplicaciones compilaron, pasaron TypeScript y generaron sus rutas      |
| Imagen final del worker               | **Build Docker GO**; assertion de que la imagen incluye `dist/worker-healthcheck.js`       |
| Compose E2E y producción              | `config --quiet` **GO** con placeholders efímeros; no se imprimieron ni guardaron secretos |
| Auditoría de ubicaciones documentales | **BLOQUEANTE: 0**, 3 avisos preexistentes                                                  |
| Auditoría de citas ADR                | **BLOQUEANTE: 0**, 142 avisos heurísticos preexistentes                                    |

Estos resultados locales no cierran G6.5. La CI debe terminar en verde sobre el SHA que incluya esta reparación y el reverso. Registrar aquí el SHA y el run nuevos cuando concluyan.
