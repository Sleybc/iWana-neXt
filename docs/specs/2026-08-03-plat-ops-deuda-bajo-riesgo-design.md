# PLAT-OPS Deuda de Bajo Riesgo — Diseño

**Fecha:** 2026-08-03  
**Estado:** Propuesto para revisión  
**Alcance:** D4, D6 y la mitad restante de A2 (migrator single-stage)

## Objetivo

Cerrar tres deudas de la auditoría Docker sin abrir decisiones de arquitectura
pendientes: hacer coherente el proxy de desarrollo con el contrato `/api/v1`,
evitar que el liberador de puertos termine procesos ajenos y reducir el runtime
del migrator a una imagen multi-stage con dependencias de producción únicamente.

## No alcance

Este lote no modifica B4, A1, A3, A4, A8 ni A9. En particular, no introduce
heartbeat del worker, pgBouncer, Docker secrets, redes nuevas, límites de
recursos, Redis authentication, Trivy/SBOM/cosign ni attestation. Esas deudas
requieren sus ADR, revisión de seguridad o decisión del CTO correspondiente.

## Diseño

### D4 — Contrato de proxy

La API NestJS declara `api/v1` como prefijo global. Por tanto, la localización
`/api/` de `nginx/nginx.dev.conf` debe usar `proxy_pass http://api;` sin barra
final, igual que `nginx/nginx.prod.conf`, para preservar `/api/v1/...` al
upstream. La ruta exacta `/health` también reenviará a
`/api/v1/health`, manteniendo el mismo contrato del healthcheck de la API.

Se añadirá una prueba de configuración basada en texto que compruebe ambas
propiedades y evite una regresión silenciosa por trailing slash. No se cambia el
rewrite de Next.js: el navegador normalmente usa el proxy de Next, mientras que
el nginx de desarrollo seguirá siendo correcto para acceso directo por
`DEV_PROXY_PORT`.

### D6 — Liberación segura de puertos

`free-dev-ports.mjs` conservará la detección de procesos que escuchan en
3000–3002, pero solo terminará PIDs que `findRepoWatcherPids` pueda asociar a
los watchers del workspace y que no estén en la cadena de procesos protegida.

Un PID externo que ocupe un puerto no se termina. El script lo reportará con su
PID y, cuando esté disponible, el comando; luego devolverá código 1 para que
`pnpm dev` no falle más tarde con un error de bind ambiguo. Los watchers propios
residuales continuarán limpiándose como antes. La lógica de selección se
extraerá a una función pura para cubrirla con tests sin crear procesos reales.

### A2 — Migrator multi-stage

El Dockerfile quedará dividido en:

1. `base/deps`: Node 24.13.1 bookworm, pnpm fijado y dependencias completas del
   workspace instaladas con cache mount.
2. `builder`: copia el grafo instalado, compila `@iwana/shared` y
   `@iwana/db`, y ejecuta `pnpm --filter @iwana/db deploy --prod --legacy
   /output`.
3. `runner`: `node:24.13.1-bookworm-slim`, sin pnpm global, sin TypeScript ni
   devDependencies, con `USER node`, `HOME=/home/node` y solo `/output`.

`@iwana/shared` se moverá de `devDependencies` a `dependencies` de
`@iwana/db`, porque las entidades compiladas importan sus enums en runtime y el
deploy de producción debe conservar ese workspace. `@iwana/config` seguirá
siendo dependencia de desarrollo: solo se usa para configuración de TypeScript,
no es necesaria por el JavaScript compilado del migrator.

El entrypoint conserva el orden y la propagación de errores actuales:
primero migraciones públicas y después migraciones tenant; un fallo termina el
contenedor sin mensaje de éxito falso.

## Validación

- Test de tooling: la configuración nginx y la selección segura de PIDs pasan.
- `pnpm --filter @iwana/db typecheck` y build del migrator correctos.
- `docker build --file packages/database/Dockerfile.migrator` correcto.
- Inspección del runner: usuario no-root, Node 24.13.1, ausencia de pnpm y
  ausencia de TypeScript/devDependencies en el runtime.
- `pnpm test:tooling`, lint, typecheck y suite afectada en verde.
- CI Linux mediante PR de GitHub; no se declara deuda cerrada sin esa evidencia.

## Riesgos y reversión

- Si `pnpm deploy --prod` no conserva un runtime ejecutable del migrator, se
  detiene el cambio y se conserva el Dockerfile anterior; no se improvisa una
  copia manual de dependencias.
- Si el cambio de proxy rompe una ruta existente, la prueba de configuración y
  un smoke HTTP sobre `/api/v1/health` deben detectarlo antes del merge.
- La reversión es un revert del commit del PR: no requiere migración de base de
  datos ni modifica volúmenes.
