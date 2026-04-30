# INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-14  
**Modo activo:** Mixto (EM + Architect)

## Resumen Ejecutivo

Se ejecutó la implementación transversal de enablement operativo para habilitar perfil de plataforma, settings funcionales de tenant, flujo de alta de primera empresa y gestión operativa de usuarios internos. El cierre incluyó la corrección del flujo MFA de plataforma en web, la activación real de acciones de usuarios por tenant y la ampliación del E2E de bootstrap administrativo.

### Addendum correctivo 2026-04-30 — Habilitación de MCPs en OpenCode

Se actualizó `.opencode/opencode.json` para dejar habilitados tres servidores MCP de uso operativo en el workspace: `chrome-devtools`, `context7` y `playwright`. La configuración quedó declarada como MCPs `local` con ejecución vía `npx`, lo que evita acoplar el repo a instalaciones globales manuales y permite resolver la versión publicada más reciente al iniciar el cliente.

Como parte del ajuste, `context7` dejó de apuntar al endpoint remoto directo y pasó a consumir el paquete oficial `@upstash/context7-mcp`, alineando los tres MCPs bajo el mismo mecanismo de arranque. Si operación requiere elevar cuota o autenticación para Context7, el paso posterior queda limitado a inyectar variables de entorno del cliente sin volver a tocar la estructura de configuración.

### Addendum correctivo 2026-04-30 — Favicon web alineado al portal

Se eliminó el `favicon.ico` especial de Next.js en `apps/web/src/app`, que podía prevalecer sobre el favicon declarado por metadata. La consola web, incluyendo creación de empresas, queda alineada con el portal corporativo usando `/brand/iwiso6.png` como `icon` y `shortcut icon`.

### Addendum correctivo 2026-04-30 — Ajuste final de settings y notificaciones web

Se refinó `Configuración -> Seguridad` en `apps/web` para corregir campos de contraseña visualmente sobredimensionados. El bloque de cambio de contraseña ahora limita el ancho efectivo a 440px y alinea el CTA con los campos, evitando que el botón flote al extremo derecho del panel.

También se corrigió la campana de notificaciones del header: deja de mostrar vacío cuando todas las empresas están activas y ahora lista los registros operativos recientes derivados de `tenantApi.list`, priorizando estados de error/provisioning/suspensión y usando empresas activas como señales informativas. El copy visible cambia de `tenants` a `empresas`.

### Addendum correctivo 2026-04-30 — Jerarquía de botones en sistema de empresas

Se inició la normalización visual del flujo de creación, listado y configuración de empresas en `apps/web`. La decisión base queda registrada: la consistencia de botones se define por escala y rol, no por tamaño único. Las acciones primarias de formulario y destructivas usan `size="lg"`; las acciones secundarias mantienen variante secundaria; los cierres de modal pasan a acciones terciarias para no competir con guardados o eliminaciones.

Primera fase aplicada: `CredentialsModal` usa cierre `ghost sm` en header; `Crear empresa`, `Guardar configuración`, `Guardar datos de empresa` y `Eliminar empresa permanentemente` usan `lg`; el trigger de menú de `TenantsTable` usa la primitive `Button` como `ghost icon`. El plan quedó registrado en `docs/plans/PLAN-WEB-EMPRESAS-UI-v1.0.md` como semilla del futuro manual de diseño UI.

### Addendum correctivo 2026-04-30 — Fase 2 primitives UI empresas

Se implementó la segunda fase del sistema visual de empresas con primitives compartidas en `@iwana/ui`: `Alert`, `Tabs` y `DropdownMenu`. `DropdownMenu` renderiza su contenido en portal con posición fija para evitar recortes dentro de tablas con overflow; `Tabs` soporta uso controlado/no controlado e indicador de error; `Alert` centraliza mensajes `neutral`, `info`, `success`, `warning` y `error` con rol accesible por defecto.

El flujo de empresas fue migrado para consumir esas primitives: `TenantsTable` eliminó el menú contextual manual; `TenantCreateForm` y `TenantSettingsForm` reemplazaron tabs y alertas ad hoc; `CredentialsModal` pasó a usar `Dialog` existente junto con `Alert` para mensajes de acceso inicial. La deuda restante queda acotada a consolidación de formularios (`Input`, `FormField`, fieldsets y `TabsContent`) y pruebas visuales/E2E de interacción.

### Addendum correctivo 2026-04-30 — Fase 3 formularios empresas

Se ejecutó la tercera fase del sistema visual de empresas consolidando formularios en `@iwana/ui`. `Input` ahora soporta `label`, `helperText`, `error`, `requiredIndicator` y `containerClassName`; se agregó `FormSection` con `FormPanel`, `FormSectionTitle` y `FormFieldset` para paneles, subtítulos y agrupaciones internas accesibles.

`TenantCreateForm` y `TenantSettingsForm` fueron migrados para eliminar constantes locales de input, label, error y fieldset. La deuda natural posterior también quedó resuelta: se implementó `CheckboxCard`, se migraron los booleanos con descripción, se integró `TabsContent` para completar la semántica accesible de tabs y se extendió `Input` con `startIcon` para reemplazar el buscador manual de `TenantsTable`. El cierre de código queda completo; para merge solo resta evidencia visual/E2E si se exige en la revisión.

### Addendum correctivo 2026-04-30 — Actor legible en Audit Logs

Se cerró la deuda de legibilidad del actor en `/audit-logs`: la API ahora conserva `userId` como dato canónico, pero agrega `actor` enriquecido en las respuestas de auditoría tenant y plataforma. El resolver trabaja por lote, evita N+1 y usa un read-model mínimo con `id`, `displayName`, `role`, `status` e indicador de soft-delete. En plataforma no se selecciona ni expone email porque `PlatformUser.email` está cifrado.

El frontend web consume `actor` en modo Básico, modo Técnico, resumen superior y export CSV, manteniendo fallback a ID corto para logs antiguos o actores no resolubles. Con esto, la columna `Actor` y el top de actores dejan de depender de UUIDs como contenido principal.

Validación focalizada: `pnpm --filter @iwana/api exec tsc --noEmit`, `pnpm --filter @iwana/web exec tsc --noEmit` y `pnpm --filter @iwana/api test -- audit-actor.resolver.spec.ts audit-query.service.spec.ts platform-audit.service.spec.ts` en verde.

### Addendum 2026-04-29 — Rediseño de Audit Logs web (modo Básico / Técnico + panel de resumen)

Se rediseñó por completo la pantalla `/audit-logs` de `apps/web` para soportar dos modos de lectura operativa (Básico narrativo y Técnico tabular), un panel de resumen con 4 tarjetas de métricas y filtros bidireccionales resumen ↔ tabla.

**Componentes y helpers creados:**

- `helpers/actionLabel.ts` — verbos en pasado y etiquetas legibles para cada `AuditAction`.
- `helpers/entityLabel.ts` — nombres de entidades en español de negocio.
- `helpers/formatActor.ts` — actor humanizado (Sistema / Usuario + primeros 8 chars del UUID).
- `helpers/pickKeyChange.ts` — extrae el cambio más relevante de un diff para la frase narrativa.
- `helpers/deriveSeverity.ts` — clasifica eventos en `critical / medium / info` con clases Tailwind.
- `helpers/computeDiff.ts` — genera tabla de diff entre `oldValue` / `newValue`.
- `helpers/timeAgo.ts` — tiempo relativo en español.
- `AuditExpandedDetails.tsx` — panel expandible con tabla de diff (UPDATE) y metadatos técnicos con copia.
- `AuditRowBasic.tsx` — fila narrativa: punto de severidad + frase actor/acción/entidad + cambio clave + badges + footer compacto.
- `AuditRowTechnical.tsx` — fila tabular: 9 columnas con celdas copiables y expansión de detalles.
- `AuditSummary.tsx` — 4 tarjetas operativas (Eventos críticos, Accesos, Seguridad/Permisos, Empresas activas / Top actores); delta 24h/7d; `onFilterApply` para conectar con la tabla.

**Archivos modificados:**

- `AuditLogsTable.tsx` — reescrito: conmutador Básico/Técnico (segmented control), `BaseAuditEntry` incluye `requestId`, `TableFilters` con `actionSet` y `severity`, fusión de filtros externos + internos, `EmptyState`, contador "N registros · Página X", CSV incluye `Request ID`.
- `audit-logs/page.tsx` — reescrito: estado `viewMode` compartido entre tablas, cargas separadas (`limit=200`) para resumen, `pageIndex` por tabla, `externalFilters` bidireccionados desde el resumen con botón "Limpiar filtro", `AuditSummary` montado sobre cada sección.

**Typecheck:** sin errores tras corrección de `exactOptionalPropertyTypes` en interfaces de props opcionales.

### Addendum correctivo 2026-04-28 — Modo técnico de Audit Logs sin tabla cruda de IDs

Se refinó el modo `Técnico` de `/audit-logs` para que conserve trazabilidad sin exponer UUIDs como contenido principal. La tabla pasó de columnas crudas (`Entity ID`, `Actor ID`, `User-Agent`, `Request ID`) a una jerarquía operativa: `Fecha`, `Evento`, `Registro afectado`, `Actor`, `Origen`, `Cliente` y `Trazabilidad`. Los nombres del registro afectado se resuelven desde `newValue/oldValue` (`name`, `legalName`, `email`, `slug`, etc.) y los identificadores quedan como metadatos copiables secundarios.

Se agregó `helpers/auditDisplay.ts` para centralizar la presentación de sujeto afectado, actor, IP y trazabilidad. También se normalizó `localhost` para evitar ruido visual con direcciones `::1` / `::ffff:127.0.0.1`, y el panel expandido conserva los IDs completos con copia para diagnóstico.

### Addendum correctivo 2026-04-28 — Localización de roles y estados en portal

Se corrigió la exposición de enums técnicos en `apps/portal` para la gestión de usuarios internos. Los filtros `Rol` y `Estado`, la tabla de usuarios, los modales de creación/edición, el header de perfil y el shell autenticado ahora consumen un mapa centralizado de etiquetas en español (`apps/portal/src/lib/user-labels.ts`), preservando los valores técnicos solo para contratos de API. El estado `PENDING_VERIFICATION` se muestra como `Pendiente de verificación` y los roles tenant-aware se presentan con etiquetas de negocio (`Administrador`, `Técnico`, `Talento humano`, `Aliado`, etc.).

Como parte del barrido de copy visible, se sustituyeron usos de `Tenant`/`tenant` en flujos públicos de acceso y paneles operativos por lenguaje funcional de negocio (`Empresa`, `portal empresarial`, `identificador de la empresa`) sin modificar variables, headers ni payloads tenant-aware.

### Addendum correctivo 2026-04-28 — Localización de roles y estados en usuarios web

Se corrigió la exposición de enums técnicos en `apps/web` para la pantalla `/users` de la consola de plataforma. La tabla de usuarios, el modal `Gestionar`, el modal `Crear usuario` y los selects de rol/estado ahora consumen etiquetas centralizadas en español desde `apps/web/src/lib/user-labels.ts`, preservando los valores técnicos únicamente para payloads y comparaciones de API. Los valores `ADMIN` y `ACTIVE` se presentan como `Administrador` y `Activo`, y estados como `PENDING_VERIFICATION` se muestran como `Pendiente de verificación`.

En el mismo barrido se normalizó copy visible del flujo: `tenant` pasó a lenguaje de negocio (`empresa`), `Prev/Next` se reemplazó por `Anterior/Siguiente`, `Último login` por `Último acceso`, `Reset clave` por `Restablecimiento` y `Email` por `Correo electrónico` donde aplicaba en formularios y mensajes de validación.

### Addendum correctivo 2026-04-28 — Ajuste de layout en parámetros regionales (web)

Se ajustó la distribución visual de los dropdowns en `Configuración de empresa -> Parámetros base -> Configuración operativa -> Parámetros regionales` para mantener consistencia de lectura en escritorio y tablet. El bloque dejó de usar distribución en cuatro columnas a breakpoint `xl` y pasó a una grilla de dos columnas, forzando dos filas en el orden solicitado por operación: `Zona horaria` + `Moneda` en la primera fila y `Idioma` + `País operativo` en la segunda.

### Addendum correctivo 2026-04-28 — Header de configuración de empresa con nombre legible

Se corrigió el subtítulo de `Configuración de empresa` en la vista `tenants/[id]/settings` para evitar exponer el UUID técnico del tenant como identificador visible (`Tenant: <uuid>`). El encabezado ahora resuelve y muestra el nombre de la empresa en formato de negocio (`Empresa: <nombre>`), manteniendo el `tenantId` solo como parámetro interno de ruta.

### Addendum correctivo 2026-04-28 — Manejo de sesión expirada sin overlay de runtime

Se corrigió el manejo de expiración de sesión en `apps/web` cuando una petición protegida recibía `401` y también fallaba el refresh. Antes, el flujo podía terminar en `Runtime ApiError` visible en pantalla (`La sesión expiró. Inicia sesión de nuevo.`) por rechazos no controlados durante cargas automáticas. El cliente HTTP ahora redirige de forma controlada a login con `next` y evita overlay durante la transición. En paralelo, la carga inicial de tenants en `Usuarios` quedó protegida con `try/catch` para eliminar rechazos no controlados en montaje.

### Addendum correctivo 2026-04-28 — Modal de gestión de usuarios sin UUIDs en UI

Se ajustó el modal de `Usuarios -> Gestionar` para retirar identificadores técnicos visibles que no aportaban contexto operativo. Debajo del nombre del usuario se eliminó la exposición de `user.id` (UUID) y se reemplazó por resumen legible de `rol` y `estado`. En el bloque `Seguridad y acceso`, la línea `Tenant` dejó de mostrar `tenantId` truncado y ahora presenta el nombre de empresa seleccionado (con fallback a slug), alineado con copy de negocio.

Complemento de copy (2026-04-28): la etiqueta visible `Tenant` se renombró a `Empresa` para mantener lenguaje funcional en español y reducir ambigüedad para operación.

Complemento de accesibilidad visual (2026-04-28): en la tabla de `Usuarios`, el botón de acción `Gestionar` se ajustó para modo oscuro con tokens de color explícitos, evitando pérdida de contraste sobre fondos dark y manteniendo legibilidad del CTA.

### Addendum correctivo 2026-04-28 — Homologación visual de Profile y Configuración/Seguridad

Se normalizó la composición visual de formularios en `apps/web` para alinear `Mi perfil` y `Configuración -> Seguridad` con el patrón de `Configuración de empresa` (paneles `rounded-[24px]`, borde `gray-100`, fondo blanco, sombra suave y densidad de spacing consistente). También se actualizaron las pestañas de `Configuración` al patrón de tabs en cápsula y se ajustaron las acciones `Cambiar email` y `Cambiar contraseña` en `Mi perfil` para usar botones primarios del sistema, eliminando la apariencia de controles secundarios ad hoc.

Complemento de densidad de formulario (2026-04-28): se compactaron los anchos efectivos de campos en `Mi perfil` y `Configuración -> Seguridad` para evitar inputs excesivamente largos cuando el dato esperado es corto o medio (teléfono, email de acceso, contraseñas, código TOTP). El cambio se implementó con columnas internas `max-w-*`, preservando paneles amplios pero controlando mejor la longitud visual de cada control.

Complemento estructural (2026-04-28): `Mi perfil` y `Configuración` adoptaron la misma jerarquía visual de `Configuración de empresa`: encabezado de página, card contenedora con título, contenido interno con ancho controlado y paneles funcionales. En `Configuración -> Seguridad`, las secciones de contraseña y MFA quedaron consolidadas en un único panel con divisor interno, igualando el modelo visual de secciones usado en `Configuración operativa`.

Complemento de alineación (2026-04-28): en `Mi perfil`, la tarjeta de identidad del usuario quedó dentro del mismo wrapper `max-w-[1180px]` que el panel `Datos de perfil`, evitando que el nombre/avatar ocupen más ancho que el formulario y manteniendo alineación visual entre ambos bloques.

Complemento dashboard (2026-04-28): se corrigió la alineación de `/dashboard` retirando el padding interno adicional del `main` que desplazaba métricas, tabla y paneles laterales respecto al `PageHeader`. La pantalla quedó con el mismo gutter estructural usado por `Configuración de empresa` y el resto de vistas normalizadas.

### Addendum correctivo 2026-04-28 — Login web alineado visualmente al portal corporativo

Se aplicó en `apps/web` el lenguaje visual del login de `apps/portal` sin copiar su comportamiento tenant-aware. La consola de plataforma conserva su flujo propio de bootstrap inicial, autenticación de plataforma, MFA y cambio obligatorio de contraseña, pero adopta el panel premium de 520px, inputs altos `h-14` con radio `rounded-2xl`, botón principal verde de 56px, info-box superior de acceso administrativo y footer de sesión segura vía JWT. No se agregó campo `Tenant (slug)` en web, porque ese control pertenece exclusivamente al portal empresarial.

### Addendum correctivo 2026-04-25 — Resolución estable del preset TypeScript compartido en portal

Se corrigió un falso positivo del editor sobre `apps/portal/tsconfig.json` que reportaba `Archivo '@iwana/config/tsconfig/nextjs' no encontrado` pese a que `tsc` sí resolvía el preset vía `pnpm`. La causa práctica era una divergencia entre la resolución del compilador y la del editor sobre `extends` en el monorepo. El ajuste dejó dos defensas complementarias: en `packages/config` se añadieron rutas físicas de compatibilidad bajo `tsconfig/`, y `apps/portal/tsconfig.json` pasó a extender el preset compartido mediante ruta relativa al workspace (`../../packages/config/tsconfig.nextjs.json`). Como validación, `get_errors` dejó de reportar el problema y `pnpm --filter @iwana/portal exec tsc --noEmit` continuó en verde.

### Addendum correctivo 2026-04-25 — Stack Docker dev estabilizado en Linux + dropdown y comentarios del processor

Se cerraron tres deudas operativas detectadas al levantar el stack Docker dev en Linux.

**1. nginx — host.docker.internal no resuelve en Linux**
`host.docker.internal` solo se resuelve automáticamente en Docker Desktop (macOS/Windows). En Linux el contenedor nginx caía en restart loop con `host not found in upstream "host.docker.internal:3000"`. Se añadió `extra_hosts: - "host.docker.internal:host-gateway"` al servicio nginx en `docker-compose.dev.yml`, que mapea el gateway del bridge de Docker al nombre del host. nginx quedó estable.

**2. Dockerfile.migrator — incompatibilidad musl/glibc con Node 24**
El migrator usaba `node:20-alpine` (musl libc) pero pnpm intentaba descargar binarios de Node 24 (solo disponibles para glibc), provocando un build roto. La imagen se migró a `node:24-bookworm-slim` (Debian, glibc), alineándose con el Dockerfile del worker. Adicionalmente, `pnpm --filter @iwana/config build` fallaba con `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` porque `@iwana/config` es un paquete de configuración pura sin script `build`. Se reemplazó por `pnpm exec tsc --project` explícito, compilando solo `@iwana/shared` y `@iwana/db`.

**3. Worker — variables de entorno faltantes en docker-compose.dev.yml**
El worker arrancaba en crash loop por dos variables ausentes en su bloque `environment`: `MFA_ENCRYPTION_KEY` (requerida por `TenantSeedService` en el constructor) y `TENANT_INITIAL_ADMIN_PASSWORD` (validada en bootstrap contra la política de contraseñas). Se añadieron ambas al servicio worker con valores de desarrollo seguros para entorno local.

**4. Processor — comentario stale + import huérfano**
El bloque de documentación de `TenantProvisioningProcessor` describía el enfoque antiguo basado en `tenant_template.sql`. El código ya usaba `CREATE SCHEMA IF NOT EXISTS` + migraciones TypeORM, pero el comentario creaba confusión. Se actualizó el JSDoc para reflejar el flujo real y se eliminó el import `* as path` que quedó huérfano tras eliminar la lectura de archivos SQL.

**5. Dropdown — clipping por overflow:hidden**
El componente `ActionsDropdown` de `TenantsTable` (web/dashboard) quedaba cortado por el contenedor de la tabla que tiene `overflow:hidden`. Se reimplementó usando `position:fixed` calculado desde `getBoundingClientRect()` al momento de apertura, escapando correctamente del stack de apilamiento del contenedor.

### Addendum correctivo 2026-03-18 — Bootstrap genérico del admin principal y cambio de email de acceso

Se corrigió una deuda de diseño en el onboarding de empresas: el login inicial del ADMIN del tenant estaba acoplado al `contactEmail` empresarial. El flujo quedó desacoplado en tres frentes. Primero, el worker ahora siembra siempre un usuario principal genérico `admin@iwana.co` con contraseña inicial fija controlada por entorno mediante `TENANT_INITIAL_ADMIN_PASSWORD` y `passwordResetRequired=true`, sin depender del correo comercial de la empresa ni hardcodear secretos en código versionado. Segundo, `POST /api/v1/tenants/:id/regenerate-admin-credentials` dejó de buscar por `contactEmail` y pasó a regenerar sobre el ADMIN principal vigente del tenant. Tercero, tanto portal como web incorporaron cambio de email de acceso desde Perfil con validación de contraseña actual; en el caso del ADMIN principal del tenant, ese cambio sincroniza también `public.tenants.contact_email`.

### Addendum correctivo 2026-03-18 — Eliminación del warning Redis por deriva de entorno y arranque duplicado

Se corrigió la causa raíz de los mensajes repetidos `This Redis server's default user does not require a password, but a password was supplied` durante el arranque local. Había dos derivas combinadas. La primera era de configuración: API y, sobre todo, worker mezclaban `.env.development` con `.env`, por lo que en desarrollo terminaban heredando `REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD` desde el template de producción aun cuando `docker-compose.dev.yml` levanta Redis sin `requirepass`. La segunda era operativa: `pnpm dev` arrancaba infraestructura Docker y luego `turbo run dev`, pero también dejaba disponible un worker Docker en la misma compose, abriendo la puerta a procesos BullMQ duplicados. El fix dejó el bootstrap de Nest aislado por entorno: en `development` solo carga `.env.development`, en `production/staging` ignora archivos `.env` y depende exclusivamente de variables inyectadas. Además, el script raíz `pnpm dev` pasó a levantar solo la infraestructura base de Docker y no el worker containerizado, evitando duplicidad con `@iwana/worker` ejecutado por Turbo.

### Addendum correctivo 2026-03-18 — Limpieza estructural de workspace y contexto Docker

Se ejecutó una limpieza transversal para eliminar residuos locales que estaban inflando innecesariamente el workspace y el contexto de build de Docker. El diagnóstico mostró que el peso principal no estaba en código fuente sino en artefactos generados: `apps/web/.next` (~890 MB), `apps/portal/.next` (~648 MB), `apps/portal/test-results` y `.turbo`. Como corrección estructural se añadió un `.dockerignore` raíz para excluir `node_modules`, `.next`, `dist`, `coverage`, `test-results`, documentación y metadatos de tooling del contexto enviado al daemon. En paralelo, `.gitignore` quedó alineado para ignorar artefactos de Playwright y resultados locales de pruebas, el worker de `docker-compose.dev.yml` pasó a un profile opcional para no levantarse por defecto en entornos locales, y el `Dockerfile` del worker ahora elimina `.env*` del runtime igual que la API. Como endurecimiento adicional de mantenimiento, los scripts `clean` del monorepo dejaron de depender de `rm -rf` y pasaron a un helper Node cross-platform para limpiar artefactos también en Windows.

### Addendum correctivo 2026-03-18 — Orden de build en `pnpm dev` para `@iwana/shared` y `@iwana/db`

Se corrigió una regresión operativa introducida al limpiar los artefactos `dist` del workspace. El script raíz `pnpm dev` reconstruía `@iwana/db` antes de que existiera nuevamente el build de `@iwana/shared`, pero `packages/database` importa enums y tipos desde `@iwana/shared` tanto para compilación como para runtime de migraciones. Con `dist` limpio, `tsc` en `@iwana/db` fallaba con `TS2307: Cannot find module '@iwana/shared'`. El flujo quedó corregido construyendo primero `@iwana/shared` y luego `@iwana/db` antes de ejecutar `migration:run`, manteniendo el arranque local determinista después de una limpieza completa del monorepo.

### Addendum correctivo 2026-03-18 — Limpieza de `dist` antes del watch de `@iwana/worker`

Se corrigió una deriva operativa en el arranque local del worker. Aunque el código fuente de `TenantSeedService` ya validaba `TENANT_INITIAL_ADMIN_PASSWORD` correctamente, `@iwana/worker:dev` podía iniciar con una versión obsoleta de `apps/worker/dist` mientras `nest start --watch` recompilaba en segundo plano. Eso permitía ejecutar JavaScript viejo en el bootstrap y reintroducir mensajes o validaciones ya corregidas en `src`. El ajuste dejó el script `dev` de `@iwana/worker` limpiando `dist` antes de levantar el watcher, forzando que cada arranque en desarrollo compile desde el código fuente vigente y evitando que el bootstrap cargue artefactos stale.

### Addendum correctivo 2026-03-18 — Override local seguro para `.env.development`

Se corrigió la precedencia de configuración local para evitar que secretos operativos de desarrollo dependieran del entorno persistido del sistema o de templates versionados con placeholders. `@iwana/api` y `@iwana/worker` ahora cargan `.env.development.local` antes de `.env.development` cuando `NODE_ENV=development`. Con esto, los overrides locales quedan fuera de git, mantienen el aislamiento respecto a `.env` de producción y permiten fijar secretos de bootstrap válidos sin reintroducir la deriva previa de Redis ni acoplar el arranque a variables de usuario del sistema.

### Addendum correctivo 2026-03-18 — Acceso inicial fijo del tenant y enforcement real de cambio de contraseña

Se cerró una inconsistencia funcional en el onboarding de empresas. El seed del ADMIN inicial ya dejaba `passwordResetRequired=true`, pero el flujo no era coherente extremo a extremo: la consola web seguía privilegiando la regeneración manual de credenciales y, además, después de completar MFA el portal podía saltarse la redirección obligatoria a cambio de contraseña. El ajuste dejó tres correcciones coordinadas. Primero, la API expone de forma controlada el acceso bootstrap fijo del ADMIN inicial solo mientras el hash vigente siga correspondiendo a `TENANT_INITIAL_ADMIN_PASSWORD`, el usuario continúe en primer ingreso y la ventana temporal no haya expirado; si ya hubo rotación o regeneración, el endpoint rechaza la consulta. Segundo, la pantalla de creación de empresa ahora distingue entre `Ver acceso inicial fijo` y `Regenerar credenciales temporales`, preservando el soporte operativo sin mezclar ambos conceptos. Tercero, tanto web como portal corrigen el flujo post-MFA para que `passwordResetRequired=true` redirija siempre a `/auth/change-password` antes de conceder acceso al dashboard.

### Addendum correctivo 2026-03-14 — Estabilización de `pnpm run dev`

Se corrigieron tres fallos detectados durante el arranque integrado del workspace: desalineación entre DTOs y servicio de `PlatformUsersModule`, carga temprana de configuración PostgreSQL en el worker y consumo de artefactos `dist` obsoletos desde `@iwana/db` en runtime. Como cierre, `pnpm run dev` volvió a levantar `@iwana/db`, `@iwana/api`, `@iwana/worker`, `@iwana/web` y `@iwana/portal` sin errores de compilación ni de conexión.

### Addendum correctivo 2026-03-17 — Alineación de proxy frontend + saneamiento estático

Se eliminó el acoplamiento por defecto de `@iwana/web` y `@iwana/portal` a `http://localhost:3000/api/v1` en el navegador, migrando ambos clientes HTTP a base relativa `/api/v1` con rewrites de Next.js hacia el backend real. En paralelo, se alinearon contratos TypeScript del portal con el backend self-service de branding y se normalizó la flat config de ESLint para registrar `@typescript-eslint` en todo el monorepo. Como cierre, `typecheck` y `lint` quedaron sin errores en todos los workspaces; solo persiste una advertencia no bloqueante de Node sobre `eslint.config.js` como ESM sin `type: module` en el `package.json` raíz.

### Addendum correctivo 2026-03-17 — Hotfix de login tenant por drift de esquema público

Se corrigió un `500 Internal Server Error` en `POST /api/v1/auth/login` que afectaba tanto a `@iwana/api` como al portal vía rewrite. La causa raíz no estaba en el cliente HTTP ni en JWT: `TenantMiddleware` resolvía el tenant con `TenantService.findBySlug()`, pero la entidad `Tenant` ya esperaba columnas de branding (`logo_light_url`, `logo_dark_url`, `seal_light_url`, `seal_dark_url`, `show_tenant_name`) ausentes en `public.tenants`. El fix operativo consistió en dos partes: aplicar la migración pendiente `005_add_tenant_branding_columns.ts` sobre la base local y endurecer `packages/database/src/data-source.ts` para que el runner CLI de TypeORM cargue `.env.development`/`.env` cuando se ejecuta fuera del bootstrap de NestJS. Como validación final, el login dejó de responder 500 y volvió a entregar `401 Credenciales invalidas` para intentos no válidos, tanto por `http://localhost:3000/api/v1/auth/login` como por `http://localhost:3002/api/v1/auth/login`.

## Cambios Implementados

### Backend

- Se extendió la entidad `PlatformUser` con `displayName`, `phone`, `timezone`, `language`.
- Se creó migración reversible en `packages/database/src/migrations/public/002_add_platform_user_profile.ts`.
- Se implementó `PlatformUsersModule` con:
  - `GET /api/v1/platform-users/me`
  - `PATCH /api/v1/platform-users/me`
  - `PATCH /api/v1/platform-users/me/login-email`
- Se implementó cambio de email de acceso para usuarios tenant en `PATCH /api/v1/users/:id/login-email` con confirmación de contraseña actual.
- Se implementaron DTOs y lógica de `GET/PATCH /api/v1/tenants/:id/settings` con defaults Colombia y merge parcial.
- Se agregó auditoría de cambios de settings de tenant con `oldValue/newValue`.
- Ajuste correctivo posterior: el contrato operativo de `PlatformUsersModule` quedó alineado con la evolución real del esquema `public.platform_users` (`firstName` + `lastName` en lugar de `displayName`), eliminando errores de compilación en `platform-users.service.ts` y sus pruebas.
- El worker dejó de usar `AppDataSource.options` evaluado antes de cargar variables de entorno y pasó a construir TypeORM con `ConfigService`, reutilizando el fallback local `apps/api/.env` cuando corre fuera de Docker.
- Se añadieron scripts `dev` con `tsc --watch` en `@iwana/shared` y `@iwana/db` para evitar que API y worker consuman artefactos `dist` desactualizados durante el desarrollo.
- Ajuste correctivo posterior de migraciones: `packages/database/src/data-source.ts` ahora carga `.env.development` y `.env` cuando se invoca desde el runner CLI de TypeORM fuera de NestJS, evitando fallos SASL por credenciales no inicializadas al ejecutar `migration:run` en local.
- Ajuste correctivo posterior de bootstrap: `TenantSeedService` ahora siembra el ADMIN principal con login genérico cifrado `admin@iwana.co` y contraseña fija inicial tomada desde `TENANT_INITIAL_ADMIN_PASSWORD`, mientras `AuthService.regenerateTenantAdminCredentials()` resuelve al ADMIN principal por orden de creación en vez de depender de `contactEmail`.
- Ajuste correctivo posterior de onboarding: `AuthService.getBootstrapTenantAdminCredentials()` expone el acceso inicial fijo del ADMIN bootstrap únicamente mientras siga vigente el primer ingreso; `TenantCreateForm` lo consume desde la consola de creación y el flujo post-MFA de web/portal ya no puede saltarse `passwordResetRequired`.
- Ajuste correctivo posterior de entorno Redis: `AppModule` y `WorkerModule` dejaron de usar `.env` de producción como fallback en `development`; ahora solo consumen `.env.development` en local y variables inyectadas en `production/staging`.

### Frontend

- Se creó layout group protegido en `apps/web/src/app/(protected)/layout.tsx`.
- Se movió dashboard a `apps/web/src/app/(protected)/dashboard/page.tsx`.
- Se actualizaron rutas raíz para mantener redirect `/ -> /dashboard`.
- Se amplió `api-client` con:
  - `platformUsersApi`
  - `tenantApi` extendido (create, getOne, getSettings, updateSettings, regenerateCredentials)
  - `usersApi`
  - métodos faltantes de `authApi` para seguridad
- Se implementaron nuevas páginas y componentes:
  - `/profile` + `ProfileForm`
  - `/settings` + `SecuritySettings`
  - `/tenants`, `/tenants/new`, `/tenants/[id]/settings`
  - `/users` + `UsersTable` + `UserCreateModal` + `UserManagementModal`
- Se actualizó `Sidebar` (label negocio: "Empresas") y tabla de tenants con acción "Configurar".
- `ProfileForm` en web y `PersonalInfoForm` en portal ahora separan datos personales del cambio de email de acceso, exigiendo contraseña actual para confirmar la rotación del login.
- Se corrigió el flujo MFA de plataforma en web:
  - login inicial con soporte de `mfaRequired`
  - segundo paso MFA reutilizando `POST /auth/platform/login` con `totpCode`
  - setup MFA desde `/settings` con verificación explícita del primer código TOTP
- Se corrigió el cliente HTTP para manejar respuestas `204 No Content` en operaciones destructivas.
- Se agregó semántica accesible a modales críticos (`role="dialog"`, `aria-modal`) para estabilizar UX y automatización.
- Se habilitó gestión real de usuarios internos desde SYSTEM_ADMIN sobre tenant seleccionado:
  - ver detalle operativo
  - cambiar rol
  - cambiar estado
  - eliminar usuario
  - paginación cursor-based con `meta.nextCursor` y total.
- Se ajustó la UX de `/profile` y `/settings` en el dashboard:
  - `PageHeader` quedó alineado con el gutter real del contenido
  - `ProfileForm` pasó a card autocontenida con footer y acción primaria visible
  - `SecuritySettings` se separó en cards funcionales (`Cambiar contraseña`, `MFA`) con acciones visibles por bloque
  - se eliminó la doble anidación visual que ocultaba botones y rompía la alineación vertical.
  - Ajuste posterior sobre causa raíz visual: las acciones primarias de perfil y contraseña se movieron dentro de `CardContent`, porque en el layout anterior el uso de `CardFooter` seguía dejando los botones fuera del área visible efectiva del formulario.
- Ajuste correctivo posterior: `ProfileForm`, `platformUsersApi` y `AuthProvider` se alinearon con el contrato actual basado en `firstName` y `lastName`, derivando el nombre visible del shell desde esos campos y evitando requests inválidos con `displayName`.

### Testing

- Backend:
  - `platform-users.service.spec.ts`
  - `platform-users.controller.spec.ts`
  - `tenant-settings.spec.ts`
  - `tenant.controller.spec.ts`
  - `users.service.spec.ts`
  - `auth.service.spec.ts`
- E2E:
  - `e2e/tests/web/admin-bootstrap.spec.ts`
  - `apps/portal/tests/e2e/auth-tenant.spec.ts`

## Archivos Creados/Modificados

- Backend y DB:
  - `packages/database/src/entities/platform-user.entity.ts`
  - `packages/database/src/migrations/public/002_add_platform_user_profile.ts`
  - `packages/database/src/migrations/public/005_add_tenant_branding_columns.ts`
  - `packages/database/src/data-source.ts`
  - `apps/api/src/modules/platform-users/*`
  - `apps/api/src/modules/users/*`
  - `apps/api/src/modules/tenant/dto/tenant-settings.dto.ts`
  - `apps/api/src/modules/tenant/tenant.controller.ts`
  - `apps/api/src/modules/tenant/tenant.service.ts`
  - `apps/api/src/modules/tenant/tenant.module.ts`
  - `apps/api/src/app.module.ts`
- Frontend:
  - `apps/web/src/app/(protected)/**`
  - `apps/web/src/components/profile/ProfileForm.tsx`
  - `apps/web/src/components/settings/SecuritySettings.tsx`
  - `apps/web/src/components/tenants/*`
  - `apps/web/src/components/users/*`
  - `apps/web/src/components/layout/Sidebar.tsx`
  - `apps/web/src/components/dashboard/TenantsTable.tsx`
  - `apps/web/src/lib/api-client.ts`
  - `apps/web/src/components/auth/AuthProvider.tsx`
  - `apps/portal/src/components/profile/PersonalInfoForm.tsx`
  - `apps/portal/src/lib/api-client.ts`
  - `apps/worker/src/services/tenant-seed.service.ts`
  - `apps/worker/src/processors/tenant-provisioning.processor.ts`

## Resultados de Validación

- Backend:
  - `pnpm typecheck` en verde para todo el monorepo.
  - Validación correctiva puntual posterior: `pnpm --filter @iwana/api exec tsc --noEmit` en verde.
  - Validación correctiva adicional posterior: `pnpm --filter @iwana/api test -- --runInBand src/modules/auth/auth.service.spec.ts src/modules/tenant/tenant.controller.spec.ts src/modules/users/users.service.spec.ts src/modules/platform-users/platform-users.service.spec.ts src/modules/platform-users/platform-users.controller.spec.ts` en verde (`5` suites / `116` tests).
  - Corrida focalizada de backend en verde:
    - `platform-users.service.spec.ts`
    - `platform-users.controller.spec.ts`
    - `tenant-settings.spec.ts`
    - `tenant.controller.spec.ts`
    - `users.service.spec.ts`
  - Resultado de la corrida focalizada: 5 suites, 36 tests, todos en verde.
  - Suite residual reactivada en verde:
    - `auth.service.spec.ts`
  - Resultado de la suite residual: 1 suite, 20 tests, todos en verde.
  - Validación puntual del hotfix de `platform-users`: `2` suites / `9` tests en verde.
  - Cobertura focalizada del alcance transversal:
    - `platform-users.controller.ts`: 100% statements / 100% branches / 100% funcs / 100% lines
    - `platform-users.service.ts`: 93.10% / 45.45% / 100% / 92.59%
    - `users.service.ts`: 95.55% / 83.87% / 100% / 96.38%
    - `tenant.controller.ts` y `tenant.service.ts` quedan por debajo del umbral agregado porque el archivo conserva superficie legacy fuera del alcance de settings; los contratos nuevos `getSettings/updateSettings` quedaron cubiertos por `tenant-settings.spec.ts` y `tenant.controller.spec.ts`.
- Frontend:
  - `@iwana/web` typecheck en verde dentro de la corrida de monorepo.
  - Validación correctiva adicional posterior: `pnpm --filter @iwana/web typecheck` y `pnpm --filter @iwana/portal typecheck` en verde tras separar el cambio de email de acceso del formulario general de perfil.
  - Diagnósticos del editor sin errores en MFA, profile, tenants y users tras el cierre funcional.
  - Ajuste incremental de layout validado con `pnpm --filter @iwana/web typecheck` en verde tras reestructurar `PageHeader`, `ProfileForm` y `SecuritySettings`.
  - Validación correctiva puntual posterior: `pnpm --filter @iwana/web typecheck` en verde tras migrar el perfil de plataforma a `firstName` / `lastName`.
  - Validación correctiva transversal posterior: `@iwana/web` y `@iwana/portal` con typecheck en verde tras adoptar base relativa `/api/v1` + rewrites de Next.js.
  - Diagnósticos del editor sin errores tras alinear `TenantSelf`/`updateBranding` con los DTOs reales del backend y simplificar el control accesible de MFA obligatorio en portal.
- Tooling:
  - Validación secuencial de typecheck en verde para `@iwana/api`, `@iwana/web`, `@iwana/portal`, `@iwana/worker`, `@iwana/db`, `@iwana/shared` y `@iwana/ui`.
  - Validación correctiva adicional posterior: `pnpm --filter @iwana/worker typecheck` en verde tras fijar el seed genérico del admin principal.
  - Validación secuencial de lint sin errores en todos los workspaces tras registrar `@typescript-eslint` en `eslint.config.js` y limpiar directivas obsoletas en tests/servicios.
  - Advertencia residual no bloqueante: `MODULE_TYPELESS_PACKAGE_JSON` al cargar `eslint.config.js` como ESM desde Node.
- Runtime dev:
  - `pnpm run dev` quedó estable tras corregir los errores iniciales de TypeScript en `@iwana/api`, la conexión PostgreSQL del worker y el consumo de `dist` obsoleto desde `@iwana/db`.
  - Arranque final verificado en verde para `@iwana/db`, `@iwana/api`, `@iwana/worker`, `@iwana/web` y `@iwana/portal`.
  - Hotfix adicional 2026-03-18: se eliminó la deriva de `REDIS_PASSWORD` en local y se evitó el arranque duplicado del worker desde Docker en `pnpm dev`; con esto, BullMQ/ioredis dejan de autenticar contra el Redis dev sin password y el entorno reduce el riesgo de consumidores duplicados.
  - Hotfix adicional 2026-03-18: se corrigió `GET /api/v1/users/:id` para tolerar nombres/apellidos legados en texto plano o con cifrado inválido/incompatible. Antes, `UsersService.toDto()` intentaba descifrar siempre `first_name` / `last_name` y el portal disparaba un `500` durante login al resolver el nombre del usuario desde `AuthProvider`. El endpoint ahora degrada de forma segura: valores legados se retornan tal cual, y payloads con forma de AES-GCM pero no descifrables se omiten como `null` sin romper la sesión.
- E2E:
  - Se detectó causa de fallo en `admin-bootstrap.spec.ts`: el patrón `testMatch` no incluía specs bajo `e2e/tests/web/**`.
  - Fix aplicado en `e2e/playwright.web.config.ts` para incluir ambos patrones: specs legacy (`web-*.spec.ts`) y specs organizados por carpeta (`web/**.spec.ts`).
  - Se amplió `admin-bootstrap.spec.ts` para cubrir:
    - edición de perfil
    - reflejo del displayName en shell
    - setup MFA inicial
    - creación de empresa y provisioning a `ACTIVE`
    - regeneración de credenciales admin
    - actualización de settings del tenant
    - alta, edición y eliminación de usuario interno
  - Corrida consolidada final ejecutada: `pnpm test:e2e` -> 2/2 tests en verde.
- OpenAPI:
  - Verificación de montaje en código: Swagger sigue expuesto en `/api/v1/docs` desde `apps/api/src/main.ts` y los endpoints nuevos conservan decoradores `@ApiOperation` / `@ApiBearerAuth`.
- Migraciones:
  - Se reutilizó el PostgreSQL local levantado por `docker-compose.dev.yml` (`iwana_postgres_dev`, PostgreSQL 16.13, puerto 5432).
  - Se verificó conectividad SQL real con `docker exec iwana_postgres_dev psql -U iwana -d dbiw -c "SELECT version();"`.
  - Se ejecutó `pnpm --filter @iwana/db migration:show` con variables operativas apuntando a `localhost:5432`, confirmando 1 migración pendiente (`AddPlatformUserProfile1742100000000`).
  - Se ejecutó `pnpm --filter @iwana/db migration:run` en verde; `migration:show` posterior confirmó ambas migraciones marcadas como aplicadas.
  - Se verificó físicamente la creación de columnas en `public.platform_users`: `display_name`, `phone`, `timezone`, `language`.
  - Se ejecutó `pnpm --filter @iwana/db migration:revert` en verde; `migration:show` posterior volvió a dejar `AddPlatformUserProfile1742100000000` como pendiente.
  - Se verificó físicamente la reversión: el conteo de columnas objetivo en `public.platform_users` pasó de 4 antes del revert a 0 después del revert.
  - Como cierre operativo del workspace local, se reaplicó `pnpm --filter @iwana/db migration:run`; `migration:show` final dejó `AddPlatformUserProfile1742100000000` marcada como aplicada y la verificación SQL final confirmó nuevamente las 4 columnas presentes en `public.platform_users`.
  - Hotfix adicional 2026-03-17: se detectó una tercera deriva de esquema en `public.tenants`, donde la entidad ya requería columnas de branding pero la base local seguía en el estado previo a `005_add_tenant_branding_columns.ts`; tras recompilar `@iwana/db`, aplicar la migración y verificar `typeorm_migrations`, el login tenant dejó de lanzar `QueryFailedError: column Tenant.logo_light_url does not exist`.
  - Hotfix adicional 2026-03-18: se corrigió una deriva de configuración en Docker para `@iwana/api`. La imagen runtime estaba en riesgo de leer `apps/api/.env` copiado dentro del contenedor por el `Dockerfile`, mientras `docker compose config` ya mostraba que `MFA_ENCRYPTION_KEY` y los `SMTP_*` se resolvían correctamente desde el entorno inyectado. Se endureció `ConfigModule.forRoot()` para ignorar archivos `.env` en producción y se eliminó cualquier `.env` embebido del runtime image, de modo que el arranque en contenedor dependa solo de variables de entorno explícitas y no de archivos locales arrastrados por el build context.
  - Hotfix adicional 2026-03-18: se corrigió el arranque del entorno dev para evitar `500` en `POST /api/v1/auth/login` sobre bases limpias. La causa raíz era operativa: `pnpm dev` levantaba PostgreSQL/Redis y los servidores locales, pero no aplicaba migraciones, dejando `public.tenants` inexistente y haciendo que el proxy del portal a `localhost:3000` fallara durante la resolución de tenant. Se aplicaron las migraciones pendientes en la base local y se actualizó el script raíz `pnpm dev` para ejecutar `@iwana/db build` + `migration:run` antes de `turbo run dev`.
  - Hotfix adicional 2026-03-18: se corrigió una deriva entre el template SQL de schemas tenant y la entidad `User`. El provisioning fallaba en `PROVISIONING_FAILED` porque `tenant_template.sql` no creaba la columna `mfa_required`, y el `TenantSeedService` consultaba `users` vía TypeORM con una metadata más nueva. Como refuerzo operativo, el template quedó idempotente para reintentos (tablas e índices con `IF NOT EXISTS`, recreación segura de la política RLS) y el script raíz `pnpm dev` ahora usa `docker compose -f docker-compose.dev.yml up -d --build` para evitar workers Docker con imágenes stale durante cambios de provisioning.
- Estado global: validación funcional completa para cierre de fase.

## Pendientes y Deuda Técnica

- Se cerró la deuda preexistente de `auth.service.spec.ts` agregando el mock de `PlatformUserRepository` requerido por el constructor actual de `AuthService`; la suite quedó nuevamente estable en verde (20/20).
- Durante la validación de migraciones se detectó una incompatibilidad de metadata TypeORM en `PlatformUser`: `displayName` y `phone` no explicitaban `type: 'varchar'`, lo que hacía fallar `migration:show` con `DataTypeNotSupportedError`. Se corrigió la entidad y la validación quedó operativa.
- Hotfix backend validado: `pnpm --filter @iwana/api exec jest src/modules/users/users.service.spec.ts --runInBand` en verde (`33/33` tests), incluyendo cobertura nueva para compatibilidad con datos legados en `firstName`/`lastName`.

## Trazabilidad

- Prompt de ejecución: `docs/prompts/PROMPT-TRANSVERSAL-ENABLEMENT-FASE-01-v1.0.md`
- HLD base: `docs/hlds/HLD-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`
- PRD base: `docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md`
- ADRs de referencia: `docs/adrs/ADR-016-Cierre-MOD01-Produccion.md`, `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md`
