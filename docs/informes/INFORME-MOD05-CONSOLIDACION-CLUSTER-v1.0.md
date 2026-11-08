# MOD05 — Consolidación del clúster D + E + F + U

**Versión:** 1.0 · **Fecha:** 2026-11-01 · **Estado:** Cerrado el 2026-11-07. GO con G6.5 cumplido, ver §«Cierre AI-EM-ARCH». El dictamen siguiente conserva el NO-GO de la repetición de G1 de §C1b como registro histórico.
**Base revisada:** `main`, árbol de trabajo separado tras K3 autorizado para cerrar el boundary Quotes → Subscribers.

**Prompt:** [PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md](../prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md) · **Plan:** [2026-10-31-mod05-consolidacion-cluster.md](../plans/2026-10-31-mod05-consolidacion-cluster.md).
**Evidencia Ola 1:** [INFORME-MOD05-CONSOLIDACION-CLUSTER-OLA1-v1.0.md](INFORME-MOD05-CONSOLIDACION-CLUSTER-OLA1-v1.0.md).

## Dictamen (2026-11-01; histórico, supersedido por §«Cierre AI-EM-ARCH»)

La primera corrida quedó en NO-GO por seguridad y por falta de entorno E2E. K3 y K4 atendieron esos puntos. C1b encontró después un P1 de boundary: `SubscribersService` consultaba `Quote` directamente. Tras la autorización del usuario, K3 trasladó la lectura al módulo Quotes mediante `CrmQuoteReadPort`; la prueba unitaria del adaptador y la integración 360° real pasaron. La repetición completa de G1 está documentada en §C1b: typecheck/lint, E2E, migraciones 167/168 y auditorías pasan, pero las suites completas de API, DB y portal, tres integraciones PostgreSQL, la cobertura de ramas del perfil tributario (79,22 %) y el hash/patch B1 mantienen el NO-GO. No se hizo staging, stash ni commit.

## G1 — Primera corrida de referencia (2026-10-31; histórica)

| #   | Gate                                                                      | Estado                              | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Typecheck y lint de shared, db, API y portal                              | **Cumple**                          | `pnpm exec turbo run lint typecheck --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/api --filter=@iwana/portal --force`: 12 tareas exitosas, 0 cacheadas, salida 0. ESLint reportó 0 errores; hubo advertencias existentes: API 7, portal 42 y db 5.                                                                                                                                                                                           |
| 2   | Suites completas de shared, db, API y portal                              | **Cumple con omisiones declaradas** | `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/portal --filter=@iwana/shared --filter=@iwana/db --force`: `Cached: 0`. API 441 suites aprobadas, 4 omitidas; 5906 tests aprobados, 15 omitidos. Portal 340 suites aprobadas; 3421 tests aprobados, 1 omitido. Shared 28 suites/278 tests aprobados. DB 77 suites/423 tests aprobados. Turbo terminó con salida 0.                                                                         |
| 3   | Integraciones PostgreSQL requeridas, sin omisiones                        | **Cumple**                          | Base `dbiw` en PostgreSQL local `127.0.0.1:5433`, `IWANA_DB_INTEGRATION_AVAILABLE=true`. API: 5 suites/43 tests aprobados y 0 omitidos (contratos, cambio de plan, ciclo de vida, 360 cotizaciones y fecha de nacimiento). DB: 2 suites/2 tests aprobados y 0 omitidos (migraciones 167 y 168). Incluye RF-LC-17 y la prueba real de `CONTRACT_CHANGED`. JSON de Jest: `%TEMP%\mod05-g1-api-integrations.json` y `%TEMP%\mod05-g1-db-integrations.json`. |
| 4   | E2E de cambio de plan y ciclo de facturación                              | **NOT_EXECUTED**                    | No había servicios escuchando en `127.0.0.1:3000` (API) ni `127.0.0.1:3002` (portal), según sondeo TCP. No se ejecutaron `portal-contract-plan-change.spec.ts` ni `portal-crm-ciclo-facturacion-live.spec.ts`; este gate queda abierto hasta correr contra el entorno de desarrollo.                                                                                                                                                                     |
| 5   | Sin vulnerabilidades críticas                                             | **Cumple al umbral crítico**        | `pnpm audit --prod --audit-level critical`: salida 0; 11 vulnerabilidades reportadas, ninguna crítica (1 baja, 7 moderadas, 3 altas). No hubo cambios de dependencias.                                                                                                                                                                                                                                                                                   |
| 6   | Cobertura ≥80 % en los tres módulos, por línea, rama, función y sentencia | **Cumple**                          | Corrida Jest sin caché con 3 suites unitarias y 3 integraciones Postgres focales: 6 suites/247 tests aprobados, 0 omitidos. Se usó `coverage-summary.json` por archivo; métricas abajo.                                                                                                                                                                                                                                                                  |
| 7   | Auditorías de citas ADR y ubicación documental sin bloqueantes            | **Cumple al umbral bloqueante**     | `pnpm audit:adr-citations`: salida 0, 0 bloqueantes y 153 avisos heurísticos. `pnpm audit:doc-locations`: salida 0, 0 bloqueantes y 3 avisos preexistentes sobre archivos fuera de `docs/informes/` dentro de `.playwright-mcp/`.                                                                                                                                                                                                                        |

### Cobertura por módulo

Comando base: `pnpm --filter @iwana/api exec jest --runInBand --no-cache --testTimeout=180000 --testPathIgnorePatterns=node_modules --coverage --coverageThreshold='{}'`, con `collectCoverageFrom` limitado a los tres módulos y los seis tests anotados en el log de cobertura combinada.

| Módulo                              |  Líneas |   Ramas | Funciones | Sentencias |
| ----------------------------------- | ------: | ------: | --------: | ---------: |
| `contracts.service.ts`              | 92,04 % | 81,65 % |   88,63 % |    90,47 % |
| `subscribers.service.ts`            | 94,21 % | 86,20 % |   85,52 % |    93,60 % |
| `subscriber-tax-profile.service.ts` | 98,54 % | 82,89 % |     100 % |    96,64 % |

Resumen de Jest: 92,55 % sentencias, 84,06 % ramas, 88,58 % funciones y 93,72 % líneas. El JSON por archivo y el log están en `%TEMP%\mod05-g1-api-coverage-combined\coverage-summary.json` y `%TEMP%\mod05-g1-api-coverage-combined.log`.

### Migraciones, OpenAPI y logs

- Las integraciones reales de 167/168 ejecutaron sus pruebas `up/down`; además, `pnpm --filter @iwana/db exec jest --runInBand --no-cache --runTestsByPath src/migrations/tenant/migration-order.spec.ts` aprobó 1 suite/6 tests. Ambas migraciones implementan `down()` y están registradas en `TENANT_MIGRATIONS` (`runner.ts:126-127`).
- Se verificaron los decoradores Swagger de las rutas nuevas: cambio de plan declara operación, cuerpo y respuestas; confirmación tributaria declara operación y respuestas. Están en `contracts.controller.ts:622-661` y `subscriber-tax.controller.ts:143-155`.
- Búsqueda de líneas nuevas `logger.*`/`console.*` en el diff backend: solo se agregó un log con ID de perfil tributario; no contiene correo, documento, teléfono, token ni payload personal. R3 hizo la revisión de seguridad complementaria.

Logs completos de lint/typecheck y suites: `%TEMP%\mod05-g1-lint-typecheck.log` y `%TEMP%\mod05-g1-package-tests.log`.

## Revisiones R1–R4

### R1 — Boundary y arquitectura

- **P2** — El adaptador de settings de contratos depende directamente del `TenantService` concreto del módulo Tenant, aunque CRM exponga un port: [contracts-tenant-settings-read.adapter.ts:2](../../apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.adapter.ts:2) y [contracts-tenant-settings-read.adapter.ts:7](../../apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.adapter.ts:7). El precedente en WFM no elimina el acoplamiento.
- **P2** — La comparación de versión de contrato tiene precisión de milisegundos mientras `updated_at` en PostgreSQL conserva precisión submilisegundo; dos cambios en menos de 1 ms podrían colisionar: [contracts.service.ts:931](../../apps/api/src/modules/crm/contracts/contracts.service.ts:931) y [contracts.service.ts:1668](../../apps/api/src/modules/crm/contracts/contracts.service.ts:1668).

### R2 — Contratos compartidos

Sin deriva detectada entre shared, API y portal para el contrato 360°, `contract.schema.ts`, `billing-cycle.schema.ts`, `confirmProfile`, alias o tipos duplicados. Observación sin severidad: `BILLING_CYCLE_ERROR_CODES` está definido en shared, pero API repite sus códigos como literales: [contracts.service.ts:1600](../../apps/api/src/modules/crm/contracts/contracts.service.ts:1600) y [contracts.service.ts:1686](../../apps/api/src/modules/crm/contracts/contracts.service.ts:1686). Los valores coinciden actualmente.

### R3 — Seguridad (hallazgos iniciales; tratados en K3)

Hallazgos P1 abiertos:

- **P1** — La ruta de confirmación del perfil tributario carece de `PermissionsGuard`/permiso explícito: [subscriber-tax.controller.ts:42](../../apps/api/src/modules/crm/subscribers/subscriber-tax.controller.ts:42) y [subscriber-tax.controller.ts:143](../../apps/api/src/modules/crm/subscribers/subscriber-tax.controller.ts:143).
- **P1** — `confirmProfile` no aplica `GuardBlockedTitular` y no registra la confirmación mediante `AuditService.logWithin` en la transacción; el interceptor de auditoría ocurre después de la operación: [subscriber-tax-profile.service.ts:370](../../apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts:370).
- **P1** — La ficha 360° devuelve solicitudes y autorizaciones de privacidad con el permiso general `CRM_SUBSCRIBERS_READ`, sin autorización específica para esos datos: [subscribers.controller.ts:765](../../apps/api/src/modules/crm/subscribers/subscribers.controller.ts:765), [subscribers.service.ts:1735](../../apps/api/src/modules/crm/subscribers/subscribers.service.ts:1735) y [subscribers.service.ts:1774](../../apps/api/src/modules/crm/subscribers/subscribers.service.ts:1774).

En el endpoint de cambio de plan no se reportaron hallazgos de seguridad.

### R4 — Experiencia y design system

`ds-owner`: `audit-ui.mjs --json` en seis componentes de U/E, salida 0 y `findings: []` (P0–P3: 0).

`prod-ux` reporta:

- **P2** — Navegar desde una acción interna cambia la pestaña, pero deja el foco en el panel oculto: [SubscriberOverviewTab.tsx:108](../../apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.tsx:108), [SubscriberTabsContainer.tsx:50](../../apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx:50) y [SubscriberTabsContainer.tsx:124](../../apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx:124).
- **P2** — Al activar un servicio, el diálogo se desmonta y desaparece el botón que lo abrió sin definir el destino del foco: [ActivateServiceDialog.tsx:72](../../apps/portal/src/components/crm/subscribers/ActivateServiceDialog.tsx:72), [ServiciosTab.tsx:537](../../apps/portal/src/components/crm/subscribers/ServiciosTab.tsx:537) y [ContractCard.tsx:351](../../apps/portal/src/components/crm/subscribers/ContractCard.tsx:351).
- **P2** — La carga del perfil tributario usa `aria-label`/`aria-busy`, pero no una región de estado accesible: [TaxProfileBlock.tsx:547](../../apps/portal/src/components/crm/subscribers/TaxProfileBlock.tsx:547).
- **P2** — El diálogo puede mostrar el valor técnico de `plan.technology` cuando no encuentra una etiqueta amigable: [ChangeContractPlanDialog.tsx:33](../../apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.tsx:33).
- **P3** — El selector no precarga el plan vigente, como pide la spec E: [spec E:22](../specs/2026-10-30-mod05-cambio-plan-contrato-ux.md:22) y [ChangeContractPlanDialog.tsx:72](../../apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.tsx:72).

Las pestañas revisadas enlazan correctamente sus paneles y responden a flechas, Inicio y Fin; las regiones revisadas tienen etiquetas accesibles.

## Dictamen inicial tras G1 (2026-10-31; histórico)

En esa fecha, el siguiente paso era corregir los tres P1 de R3 y repetir G1; ambos pasos se ejecutaron en K3/K4. Las E2E no estaban disponibles en ese corte y se corrieron después, con resultado vigente en §C1b. Los P2/P3 de R1 y R4 quedan como observaciones de esa revisión según la asignación de AI-EM-ARCH.

**Decisión inicial:** Q2 y Q3 quedaron en **NO-GO** en esa corrida. K3 y K4 se ejecutaron después; el dictamen vigente está en §C1b. Las corridas locales de calidad no representan G6.5 ni CI Linux.

## K3a — Matriz de permisos verificada (2026-10-31)

**[SEC-REVIEW] Resultado:** se pueden reutilizar claves existentes sin crear permisos ni modificar perfiles. La revisión se hizo en solo lectura de producto; esta sección es la única escritura de K3a. No se ejecutaron pruebas ni migraciones.

La convergencia aquí propuesta responde al encargo expreso K3a/K3b. ADR-083 D2 establece el doble guard y sus roles como techo; su D7 dejó históricamente `SubscriberTaxController` como excepción `@Roles`-only. Esa excepción se deja documentada para no atribuirle al ADR una autorización de cableado que no contenía. El encargo actual ordena converger este controlador con las claves existentes y mantener sus roles.

### Rutas tributarias

Prefijo común: `/crm/subscribers/:subscriberId/tax-profile`. En todas las rutas se conservan `ADMIN`, `ACCOUNTANT` y `SYSTEM_ADMIN`; poseer la clave no amplía ese techo de roles.

| Ruta                                                    | Clave propuesta                                     | Perfiles estándar que contienen la clave                                                      | Impacto efectivo con los roles actuales                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /` (`getProfile`)                                  | `CRM_SUBSCRIBERS_READ` (`crm.subscribers.read`)     | Administrador general; Acceso estándar NOC, Soporte, Comercial, Técnico, Contable y Auditoría | ADMIN conserva acceso; ACCOUNTANT conserva acceso con Contable activo; el resto de categorías continúa excluido por `@Roles` |
| `PUT /assignments` (`saveAssignments`)                  | `CRM_SUBSCRIBERS_MANAGE` (`crm.subscribers.manage`) | Administrador general; Acceso estándar Soporte, Comercial y Contable                          | ADMIN conserva acceso; ACCOUNTANT conserva acceso con Contable activo; Soporte y Comercial continúan excluidos por `@Roles`  |
| `PATCH /assignments/:assignmentId` (`updateAssignment`) | `CRM_SUBSCRIBERS_MANAGE`                            | Los mismos perfiles de mutación anteriores                                                    | Mismo impacto; requiere también superar validación/tenancy de la ruta                                                        |
| `POST /suggest-vat` (`suggestVat`)                      | `CRM_SUBSCRIBERS_MANAGE`                            | Los mismos perfiles de mutación anteriores                                                    | Es una mutación persistida, por lo que exige MANAGE                                                                          |
| `POST /confirm` (`confirmProfile`)                      | `CRM_SUBSCRIBERS_MANAGE`                            | Los mismos perfiles de mutación anteriores                                                    | Exige MANAGE además del rol y de la guarda de titular bloqueado que implementará K3b                                         |

`SYSTEM_ADMIN` conserva el tratamiento de actor de plataforma del `PermissionsGuard`: `user.type === 'platform'` permite el paso del guard de permisos; esto no transforma un rol tenant en actor plataforma. No cambiar ese comportamiento ni los roles en K3b.

El GET crea/sugiere el perfil si todavía no existe, según su contrato actual; K3a lo clasifica como lectura de la ficha conforme a la preferencia explícita del encargo. No se amplía ese efecto ni se cambia su semántica en K3b.

**Evidencia de semillas y runtime:**

- La migración 119 inserta las claves en los perfiles estándar: ADMIN en `119_seed_mod00_access_v2_convergencia_rbac.ts:160`; NOC en `:168`; Soporte en `:181`; Comercial en `:193`; Técnico en `:201`; **Contable en `:210-216`**, con READ y MANAGE; Auditoría en `:233`. La asignación de corte se limita a usuarios activos sin perfiles activos; un usuario que haya perdido o personalizado esos grants no recibe una autorización implícita por su rol.
- `ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[ACCOUNTANT]` conserva ambas claves (`access-control.constants.ts:881-889`) y la plantilla «Acceso estándar Contable» deriva de ella (`:955-959`). No existe una clave tributaria en `AccessPermissionKey`; tampoco se necesita para esta matriz.
- `EffectivePermissionsService` calcula baseline solo para ADMIN y agrega perfiles activos, vigentes y compatibles con la categoría base; ACCOUNTANT sin grant efectivo debe recibir 403. No se deben resembrar ni alterar perfiles para evitar ese rechazo.
- `PermissionsGuard` exige todas las claves declaradas, devuelve 403 si falta alguna y conserva el bypass exclusivo de audiencia plataforma (`access-control/guards/permissions.guard.ts:37-62`).

### Privacidad en la ficha 360°

La ruta 360° mantiene `CRM_SUBSCRIBERS_READ` para abrir la ficha. **Solo `PRIVACY_READ` habilita los detalles** `habeasData` (autorizaciones) y `arcoRequests` (solicitudes ARCO). Sin esa clave, la respuesta debe contener ambas listas vacías y `privacyDetailsRestricted: true`; con ella, conserva los detalles y `privacyDetailsRestricted: false`. K3b debe usar permisos efectivos del actor, no inferirlos del nombre del rol ni del estado visual del portal.

`privacyMarks` se conserva para todos los lectores de la ficha porque alimenta las guardas de titular bloqueado. `CRM_BLOCKED_DATA_READ` permite su finalidad específica de lectura de datos bloqueados, pero **no sustituye `PRIVACY_READ`** ni autoriza ver autorizaciones/ARCO.

| Perfil o actor                                           | ¿Tiene `PRIVACY_READ` en la semilla/baseline?                                                                             | Resultado esperado en la 360°                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ADMIN                                                    | Sí, baseline runtime de todas las claves ASSIGNABLE; la plantilla runtime Administrador general deriva de la misma matriz | Detalles visibles                                                                                                             |
| «Oficial de protección de datos», categoría AUDITOR      | Sí; migración 147 inserta READ y MANAGE en esa plantilla                                                                  | Detalles visibles si además posee `CRM_SUBSCRIBERS_READ` mediante un perfil compatible, por ejemplo Acceso estándar Auditoría |
| «Acceso estándar Auditoría»                              | No; la plantilla runtime excluye expresamente READ/MANAGE de privacidad                                                   | Ficha disponible, detalles restringidos salvo otro perfil compatible que conceda READ                                         |
| «Acceso estándar Contable»                               | No                                                                                                                        | Ficha disponible, detalles restringidos; la clave de datos bloqueados de su finalidad contable no concede privacidad          |
| «Acceso estándar NOC», «Soporte», «Comercial», «Técnico» | No                                                                                                                        | Detalles restringidos; el resto de la ficha conserva el techo de roles/permisos vigente                                       |
| RRHH, Contratista, SUBSCRIBER, PARTNER e INVESTOR        | No en sus plantillas/matriz estándar                                                                                      | No obtienen acceso adicional a la ficha ni a privacidad por este cambio                                                       |

La migración `147_seed_privacy_permissions.ts:37-43` crea las dos claves ASSIGNABLE y `:53-82` crea «Oficial de protección de datos» con `base_role_constraint = 'AUDITOR'` y sus dos grants. No asigna esa plantilla automáticamente a usuarios. `access-control.constants.ts:976-981` excluye ambas claves de la plantilla estándar Auditoría, aunque la matriz de compatibilidad AUDITOR permita asignarlas mediante otro perfil. La lectura de 360° ya obtiene el conjunto efectivo en `subscribers.controller.ts:881-898`; se puede reutilizar para K3b sin otra consulta por rol.

**Impacto y límite:** no hay `[BLOQUEO]` por clave nueva o cambio de perfiles. Se admite que un perfil personalizado sin el permiso correspondiente pierda esta operación: es el control efectivo solicitado, no un motivo para añadir grants. El análisis verifica fuentes versionadas y semillas; no afirma haber inspeccionado las asignaciones personalizadas de ningún tenant real. Los tres P1 permanecen abiertos hasta implementar y verificar K3b.

## K3b — Correcciones de API (2026-10-31)

Verificado con conteo real en esta sesión. Comandos: `pnpm exec jest <ruta>` en `apps/api` (unitarias) y `IWANA_DB_INTEGRATION_AVAILABLE=true pnpm exec jest --config jest.integration.config.js <ruta>` (integración contra PostgreSQL de desarrollo). Ninguna corrida usó caché de Turbo.

| Punto                                                                            | Estado                                          | Evidencia                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · P1-1 `PermissionsGuard` + `@Permissions` en `SubscriberTaxController`        | Hecho                                           | `subscriber-tax.controller.ts:45,56,75,102,131,151`; prueba HTTP por ruta `tests/subscriber-tax.security.http.spec.ts`                                                                                         |
| 2 · P1-2 `GuardBlockedTitular` en `confirm` y auditoría dentro de la transacción | Hecho                                           | `subscriber-tax.controller.ts:152`; `subscriber-tax-profile.service.ts:403` (`logWithin`); `tests/subscriber-tax-confirm.postgres.integration.spec.ts`: 2/2 pasan (incluye rollback si la auditoría falla)     |
| 3 · P1-3 `privacyDetailsRestricted` en la 360°                                   | Hecho                                           | `subscribers.controller.ts:798-802`; pruebas por rol en `tests/subscribers.controller.spec.ts`                                                                                                                 |
| 4 · P2 adaptador de settings mediante port                                       | Hecho                                           | `contracts/ports/contracts-tenant-settings-read.adapter.ts` depende de `SettingsPriorityTenantReadPort`; `contracts-tenant-settings-read.adapter.spec.ts`: PASS                                                |
| 5 · P2 precisión de milisegundos en la versión                                   | Sin cambio de código; cubierto por lo existente | `advanceContractVersion` (`contracts.service.ts:1669`) fuerza `max(Date.now(), previo + 1)`; prueba «dos escrituras en el mismo milisegundo» en `contract-plan-change.postgres.integration.spec.ts`: 8/8 pasan |

Notas del punto 5: no se cambió la consulta `SELECT updated_at` de `assertContractVersionForSave`. Un intento con `date_trunc('milliseconds', …)` rompió 17 pruebas de `contracts.service.spec.ts`, porque su doble de `qr.query` despacha por el texto exacto del SQL; se revirtió y el spec volvió a 95/95. La precisión ya es de milisegundos en ambos lados (node-pg devuelve `Date` en ms), así que no se identificó un defecto activo que la consulta corrija.

**Conteos:**

- Unitarias de subscribers (7 suites): 133/133 pasan.
- Contratos, unitarias (`contracts.service.spec.ts`, `contract-plan-change.service.spec.ts`, `ports/`): 95/95 y las demás suites pasan.
- Integración `contract-plan-change.postgres`: 8/8.
- Integración `subscriber-tax-confirm.postgres`: 2/2.
- `tsc --noEmit` en `apps/api`: exit 0. En `packages/shared`: exit 0.

## K3c — Portal (2026-10-31)

| Punto                                                     | Estado | Evidencia                                                                               |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| 1 · R4-P2 foco tras navegar desde «Vista general»         | Hecho  | `SubscriberTabsContainer.tsx:47-49` enfoca el panel de la pestaña destino               |
| 2 · R4-P2 foco tras activar un servicio                   | Hecho  | `ServiciosTab.tsx:103` enfoca la tarjeta del contrato activado                          |
| 3 · R4-P2 región de estado al cargar el perfil tributario | Hecho  | `TaxProfileBlock.tsx:548` (`role="status"`)                                             |
| 4 · R4-P2 etiqueta de tecnología                          | Hecho  | `ChangeContractPlanDialog.tsx:31-33`: sin etiqueta muestra «Tecnología no especificada» |
| 5 · R4-P3 precargar el plan vigente                       | Hecho  | `ChangeContractPlanDialog.tsx:71-72` inicializa la selección con `contract.planId`      |
| 6 · P1-3 aviso de detalle restringido                     | Hecho  | `SubscriberOverviewTab.tsx` consume `privacyDetailsRestricted`                          |

**Pruebas:** 8 suites, 73/73 pasan (`SubscriberOverviewTab.spec.tsx`, `ChangeContractPlanDialog.spec.tsx`, `ServiciosTab.filtros.spec.tsx`, `ServiciosTab.interes-comercial.spec.tsx`, `subscriber-ficha-ux-qw.portal.spec.tsx`, `SubscriberDetailClient.mod05-deuda.portal.spec.tsx`, `contracts-dialogs.behavior.spec.tsx`, `tributario-ux.portal.spec.tsx`).

**`audit-ui.mjs`:** sin hallazgos en los archivos del clúster (ninguno en `components/crm/subscribers`). El total del repositorio no es 0: P1 4 (`apps/web/.../PlatformAuthExperience.tsx`, `packages/ui/.../SectionAccordion.tsx`) y P2 50, fuera del alcance de K3. No se verificó si son anteriores a esta ola.

## K3d — E2E del clúster (2026-10-31)

**Entorno:** API en `127.0.0.1:3000` y portal de desarrollo en `127.0.0.1:3002`, ya levantados. Las specs usan tenants `srqa-mod05-cf-*` y `qa-plan-change-synthetic`, nunca `tenant_iwana`. La configuración `e2e/playwright.portal.config.ts` intenta levantar su propio servidor en 3002 y falla si el puerto está ocupado. Se ejecutó con una configuración temporal equivalente que reutiliza el servidor de desarrollo (`reuseExistingServer: true`), eliminada después. Esto prueba el portal de desarrollo, no el build standalone que usa el gate.

**Resultado:** 1 pasa, 3 fallan (4 pruebas, 4.6 min).

| Prueba                                                    | Resultado | Clasificación                                            | Causa observada                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | --------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portal-contract-plan-change` · DRAFT compara y confirma  | Falla     | **Test desactualizado frente a comportamiento aprobado** | Espera «Nuevo plan» vacío; el portal ahora precarga el plan vigente («Fibra sintética 100»). Es el punto 5 de K3c (spec E:22).                                                                                                                          |
| `portal-contract-plan-change` · ACTIVE compara y confirma | Falla     | Igual que la anterior                                    | Igual                                                                                                                                                                                                                                                   |
| `portal-contract-plan-change` · cancelar conserva el plan | Pasa      | —                                                        | —                                                                                                                                                                                                                                                       |
| `portal-crm-ciclo-facturacion-live` · CA-CF-12            | Falla     | **Selector desactualizado (no regresión funcional)**     | Busca `button[name="Acciones del contrato"]`. En `HEAD`, `ContractCard.tsx:192` tenía ese nombre; el árbol de trabajo lo cambió a `Acciones del servicio ${serviceName}` (`ContractCard.tsx:239`). Ese cambio no está en la lista de K3 y no lo revisé. |

**Repetición tras actualizar las specs (mismo entorno): 4 de 4 pasan (16.8 s).** Cambios solo en `e2e/tests/` (no en producto):

- `portal-contract-plan-change.spec.ts`: el selector «Nuevo plan» espera el plan vigente (`oldPlan.name`) en lugar de vacío, según K3c punto 5 (spec E:22). Confirmar sigue deshabilitado porque no hay cambio.
- `portal-crm-ciclo-facturacion-live.spec.ts` (CA-CF-12):
  - El botón es «Acciones del servicio …» en el árbol actual (`ContractCard.tsx:239`), no «Acciones del contrato». No se revirtió el nombre de producto.
  - Abrir el menú dejaba su velo encima de la acción rápida «Activar» al pie de la tarjeta DRAFT (`ContractCard.tsx:350`). La prueba activa desde esa acción rápida.
  - La tarjeta ACTIVE muestra «Ciclo día N · Próximo corte: fecha» en un solo párrafo; la prueba espera ese texto.

Pendiente de revisión: el árbol de trabajo cambió la etiqueta del botón de `ContractCard.tsx` y no lo revisé. Si el nombre anterior era el deseado, hay que revertir el producto y no el selector. Los cambios de spec deben pasar por `test-change-reviewer` antes de cerrar la ola.

**Estado al redactar el cierre de K3, antes de K4:** G1 completo (§G1) no se había repetido. Los puntos de K3 estaban verificados por pruebas unitarias e integración; la repetición histórica siguiente quedó reemplazada por K4 y luego por §C1b.

## G1 tras K3 antes de K4 (2026-10-31; histórico)

Sin Turbo: `pnpm --filter <paquete> run <script>`. Conteos literales de las salidas. Veredicto tras la repetición: **GO** para los siete gates, con la nota de repetición al final de esta sección.

| #   | Gate                                                | Resultado                                                                                                                                                                                                                                                                | Estado                                                              |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1   | typecheck y lint de `shared`, `db`, `api`, `portal` | 8 de 8 con exit 0                                                                                                                                                                                                                                                        | PASA                                                                |
| 2   | Suites completas                                    | shared 28/28 (278 tests); db 77/77 (423); api 443 pasan y 4 se omiten (5917 tests, 15 omitidos); portal 340/340 (3430 tests, 1 omitido)                                                                                                                                  | PASA                                                                |
| 3   | Integraciones Postgres (`dbiw`)                     | 13 de 13 specs de api pasan (75 tests). Migraciones 167 y 168: 2/2                                                                                                                                                                                                       | PASA                                                                |
| 4   | E2E de plan y ciclo                                 | 4/4 (ver §K3d)                                                                                                                                                                                                                                                           | PASA                                                                |
| 5   | `pnpm audit --prod --audit-level critical`          | exit 0; 11 vulnerabilidades (3 altas, 7 moderadas, 1 baja), ninguna crítica                                                                                                                                                                                              | PASA (umbral crítico)                                               |
| 6   | Cobertura ≥80 % en los tres servicios               | `contracts.service.ts`: líneas 94.45, ramas 82.82, funciones 98.87, sentencias 92.90 (antes de añadir pruebas: 87.52 / 73.04 / 78.65 / 86.29). `subscribers.service.ts`: 94.21 / 86.20 / 85.52 / 93.60. `subscriber-tax-profile.service.ts`: 98.57 / 82.89 / 100 / 96.71 | PASA tras añadir 9 pruebas unitarias en `contracts.service.spec.ts` |
| 7   | `audit:adr-citations` y `audit:doc-locations`       | 0 bloqueantes en ambos (153 y 3 avisos)                                                                                                                                                                                                                                  | PASA                                                                |

**Gate 3 — spec fallida:** `subscriber-enum-parity.postgres.integration.spec.ts` inspecciona el esquema `tenant_test`, que no existe en `dbiw` (consulta a `list_schemas`). La consulta devuelve `[]`, así que la comparación falla. Es una precondición de entorno, no un cambio de producto. No está en la lista de G1, pero sí en el repositorio. Tras la repetición, la spec ya no depende de `tenant_test`: aprovisiona su propio esquema con `applyTenantMigrationsInOrder` y lo limpia al terminar.

**Nota de repetición (2026-10-31, tras atender los gates abiertos):**

- Re-ejecutados: `typecheck` y `lint` de `@iwana/api` (exit 0), integraciones de api (13/13 suites, 75/75 tests), suite unitaria completa de api con cobertura (443 suites pasan, 5926 tests), y las specs de contratos (104/104).
- Sin cambios desde la corrida anterior: `shared`, `db` y `portal` (typecheck, lint y suites), E2E (4/4 en §K3d), `pnpm audit --prod --audit-level critical` (exit 0), `audit:adr-citations` y `audit:doc-locations` (exit 0).
- Cobertura final de `contracts.service.ts`: líneas 94.45 %, ramas 82.82 %, funciones 98.87 %, sentencias 92.90 %.
- Sigue abierto y no bloquea el umbral crítico: 3 vulnerabilidades altas en `pnpm audit --prod`. Conviene documentarlas en un informe de dependencias.

**Gate 6 — cobertura:** la medición se hizo con la suite unitaria completa (las specs de integración se omiten en esa configuración). La medición con solo las specs de integración de `contracts.service.ts` da 68.45 líneas / 42.39 ramas / 68.53 funciones. No medí la combinación de ambas corridas, así que no sé si llega a 80 %.

**Gates abiertos para cerrar la ola:**

1. ~~Cobertura de ramas y funciones de `contracts.service.ts` por debajo de 80 %~~ — resuelto: ramas 82.82 %, funciones 98.87 %.
2. ~~Precondición de `tenant_test` en `dbiw` para `subscriber-enum-parity`~~ — resuelto: la spec instala su propio esquema `tenant_enum_parity_*` con la cadena de migraciones vigente, registra un tenant canónico temporal y elimina ambos al terminar. Verificado: 1/1 pasa y no quedan restos en `dbiw`.
3. Repetir G1 tras corregir lo anterior, y con eso fijar la versión final del informe.
4. Revisar las 3 vulnerabilidades altas de `pnpm audit --prod`. No bloquean el umbral crítico, pero conviene documentarlas.

## Auditoría AI-EM-ARCH del cierre de K3 (2026-11-01)

**Alcance:** lectura del código corregido por K3 y dos revisiones independientes de solo lectura: `prod-ux` (tarjeta de contrato y E2E) y `test-change-reviewer` (todas las specs ajustadas o nuevas de la ola). Nadie ejecutó suites en esta auditoría.

**Dictamen: GO condicionado.** Los tres P1 están cerrados en el código:

- `subscriber-tax.controller.ts:45` y `:56-151` tienen `PermissionsGuard` y `@Permissions`, y `confirm` lleva `GuardBlockedTitular` (`:152`);
- la confirmación audita con `logWithin` (`subscriber-tax-profile.service.ts:403`);
- la 360° publica `privacyDetailsRestricted` (`subscribers.controller.ts:798`, `subscriber-360.ts:122`).

No hay regresión ocultada por ajuste de pruebas, ni hallazgos P0/P1. Antes de C1 queda un **K4 acotado** con cuatro P2 y cinco P3.

### Correcciones al registro de K3

| Sección              | Lo que dice                                                       | Lo verificado                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §K3b punto 5         | Precisión de milisegundos «sin cambio de código»                  | El árbol **sí** trae el arreglo: `GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')` en `subscriber-lifecycle.service.ts:289` y `:612`, y en `crm-contract-impersonation.adapter.ts:106`. Los escritores por ORM pasan por `advanceContractVersion` (`contracts.service.ts:1669`). Como node-pg trunca a milisegundos, no hay falso «sin cambios» ni falso 409 |
| §K3d, CA-CF-12       | El velo del menú tapaba «Activar»                                 | El velo es el cierre por clic exterior, intencional. La causa real es que U sacó «Activar» del menú al pie (`ContractCard.tsx:216` y `:350`)                                                                                                                                                                                                                                                                                            |
| §K3d, texto de ciclo | La prueba espera «Ciclo día N · Próximo corte» en un párrafo      | Contradice la spec de ciclo §3: la E2E fijó una deriva (H3)                                                                                                                                                                                                                                                                                                                                                                             |
| G1 tras K3           | `gate-verifier` añadió 9 pruebas y reescribió la paridad de enums | **Fuera de rol:** su definición dice que no escribe tests. Se acepta el trabajo porque `test-change-reviewer` lo revisó: la paridad queda fortalecida (B) y varias de las 9 pruebas tienen aserciones flojas (P3-3, en K4). En la próxima repetición G1 no edita: un gate rojo se reporta                                                                                                                                               |

### Hallazgos abiertos (entran en K4)

| ID   | Sev. | Origen               | Hallazgo                                                                                                                                                                                               | Dueño                   |
| ---- | ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| H2b  | P2   | prod-ux              | El menú de `ContractCard` hecho a mano no anuncia estado, no cierra con Escape ni devuelve el foco (CA-U-03)                                                                                           | `fe-platform`           |
| H3   | P2   | prod-ux              | Ciclo y próximo corte en una sola frase, contra spec de ciclo §3                                                                                                                                       | `fe-platform` + `sr-qa` |
| P2-1 | P2   | test-change-reviewer | `subscriber-tax-confirm.postgres.integration.spec.ts` depende del tenant `test-s2-live`, tiene una aserción vacua y no prueba que auditoría y `save` compartan transacción                             | `sr-backend`            |
| P2-2 | P2   | test-change-reviewer | `subscriber-tax.security.http.spec.ts` solo prueba 403 con permisos vacíos; no prueba la clave equivocada (READ en rutas de escritura)                                                                 | `sr-backend`            |
| H1   | P3   | prod-ux              | Nombre accesible redundante («Acciones del servicio Servicio — …»)                                                                                                                                     | `fe-platform`           |
| P3-1 | P3   | ambos                | Comentario de la E2E con la causa mal atribuida                                                                                                                                                        | `sr-qa`                 |
| P3-3 | P3   | test-change-reviewer | Pruebas de cobertura de G1 que solo ejecutan ramas                                                                                                                                                     | `sr-backend`            |
| P3-4 | P3   | test-change-reviewer | El adaptador de suplantación y el borrado de borradores no tienen prueba del avance de versión                                                                                                         | `sr-backend`            |
| R-ER | P3   | test-change-reviewer | `titular-erasure-sql.ts:279` fija `updated_at = CURRENT_TIMESTAMP` en `contracts`, sin garantía de +1 ms; un cliente obsoleto podría sobrescribir datos redactados si la guarda de titular no lo frena | `sec-eng` (triage)      |

**Resueltos por documentación (AI-EM-ARCH, 2026-11-01):** H2c y P3-2 (spec de ciclo v1.1: «Activar» en el pie; ciclo y corte como dos datos) y P3-6 (addendum U v1.1: `DropdownMenu` y nombre accesible «Acciones de {nombre}»).

**Deuda registrada, fuera de K4:** P3-5, pruebas de ciclo de vida y fecha de nacimiento con DDL hecho a mano en vez de la cadena migrada. Se migra al patrón de `subscriber-enum-parity` en una ola de salud de pruebas.

## K4c — Triage de R-ER (2026-11-01)

**[SEC-REVIEW] Resultado: [BLOQUEO]. R-ER permanece abierto.** Las guardas no rechazan toda mutación después de la supresión del titular. Se requiere una spec propia del módulo de privacidad; este triage no amplía el clúster ni modifica producto o pruebas.

### Cadena verificada

1. La supresión marca al suscriptor con `anonymized_at` mediante `markAnonymizedRows` (`crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts:385`; `titular-erasure-sql.ts:325`). Redacta ubicación, datos fiscales y alias del contrato (`crm-titular-erasure.participant.ts:130-144`, `:422-443`), sin borrar el contrato. La resolución además cierra la marca activa `DATOS_BLOQUEADOS` (`privacy/requests/requests.service.ts:1049`, `:1159-1172`).
2. `ContractsBlockedTitularGuard` resuelve `params.id` hacia `assertContractNotBlocked`; los resolvers `params.subscriberId` y `body.subscriberId` van a `assertSubscriberNotBlockedForMutation` (`contracts/guards/contracts-blocked-titular.guard.ts:40-44`). Ambos terminan en `ContractsService.assertSubscriberNotBlocked`, que retorna sin rechazo si `anonymizedAt != null` o no hay Party (`contracts/contracts.service.ts:669-675`, `:761-790`). Por tanto, el decorador está presente pero no prohíbe al titular ya anonimizado.
3. En la ficha ocurre el mismo bypass: `SubscribersBlockedTitularGuard` devuelve `true` cuando `anonymizedAt != null` (`subscribers/guards/subscribers-blocked-titular.guard.ts:42-43`). La existencia de `privacyMarks` en la respuesta o el ocultamiento visual de acciones no modifica este resultado del servidor.

### Ruta abierta que impide cerrar R-ER

| Ruta                                                      | Control actual                                                                                                                                                                        | Resultado del triage                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /crm/contracts/:id`                                | `GuardBlockedTitular('params.id')`, roles y `CRM_EXPEDIENTES_MANAGE` (`contracts.controller.ts:442-447`)                                                                              | Un actor autorizado puede pasar la guarda para un titular anonimizado. `update` lee el contrato sin excluir ese estado (`contracts.service.ts:467-478`, `:814-816`), admite alias y notas de instalación (`:860`, `:869-870`) y guarda bajo la versión del contrato (`:893-900`). No hay rechazo adicional por `anonymizedAt`. Alias y notas son campos que el participante de supresión acaba de redactar. |
| Resto de rutas de contrato con resolver `params.id`       | PATCH punto de servicio; POST/DELETE soporte de estrato; DELETE contrato; POST cambio de plan, activar, suspender, reactivar, terminar y archivar (`contracts.controller.ts:459-759`) | Comparten el bypass. Las reglas de estado/validación de cada operación pueden impedir casos particulares, pero la guarda no establece una prohibición general tras la supresión.                                                                                                                                                                                                                            |
| Rutas de servicios por suscriptor y creación de contratos | Resolver `params.subscriberId`/`body.subscriberId` (`contracts.controller.ts:150-368`)                                                                                                | También delegan al mismo bypass del servicio; no ofrecen el cierre universal requerido por K4c.                                                                                                                                                                                                                                                                                                             |
| Mutaciones de la ficha con guarda                         | PATCH ficha/sección/estado, DELETE ficha y POST confirmación tributaria (`subscribers.controller.ts:579-640`; `subscriber-tax.controller.ts:150-153`)                                 | La guarda de suscriptores admite el titular anonimizado. Las otras escrituras tributarias (PUT/PATCH asignaciones y POST sugerencia) no llevan ese decorador (`subscriber-tax.controller.ts:74-132`); sus permisos no equivalen a una prohibición por supresión.                                                                                                                                            |

**Alcance del riesgo:** queda refutada la precondición de cierre «ninguna mutación puede pasar tras el borrado». La guarda no permite descartar que un cliente con datos anteriores restaure campos redactados. La escritura de supresión sigue asignando `updated_at = CURRENT_TIMESTAMP` (`titular-erasure-sql.ts:279`), sin la garantía de avance de 1 ms de los escritores K3. Esta revisión estática no demuestra una carrera ejecutada ni afirma que toda operación tenga éxito: basta la ruta PATCH admitida para mantener R-ER abierto conforme al encargo.

**Siguiente decisión:** definir en una spec de privacidad la política de mutaciones de registros anonimizados y su garantía de concurrencia con supresión, incluyendo requests ya autorizadas antes de la transacción de borrado. Después se asignará implementación y pruebas al dueño del módulo. No se corrige R-ER dentro de K4.

**Evidencia y límites:** lectura de controllers, decoradores, guards, servicios CRM y participante/resolución de supresión; contexto PRD MOD05, HLD MOD05 y HLD Privacy v1.1 §6. No se ejecutaron pruebas ni solicitudes contra tenants. Única escritura de K4c: esta sección del informe.

## K4e — Revisión de pruebas ajustadas (2026-11-01)

**Resultado: sin hallazgos C; G1 puede ejecutarse.** Se revisaron las siete specs modificadas en K4a, K4b y K4d contra el código asociado y las reglas explícitas del prompt K4 y de la spec de ciclo v1.1. No se observó una expectativa previa legítima que el ajuste haya eliminado ni una regresión ocultada. Este resultado no cierra el bloqueo de privacidad R-ER documentado en §K4c.

| Prueba (`archivo:línea`)                                                                                       | Cambio                                                                                                                                                                                                                                                         | Hunk de producción o contrato                                                                                                                           | Regla que lo justifica                                                   | Veredicto       |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------- |
| `apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx:135`                                         | Comprueba apertura/estado del menú, recorrido por teclado, cierre con Escape, retorno del foco, nombre accesible y respaldo de nombre sin PII; añade casos para ciclo y próximo corte separados, skeleton y «Activar» fuera del menú (`:163`, `:386`, `:437`). | `ContractCard.tsx:159-161,251-264,315-325`; `DropdownMenu` sustituye el velo manual y la tarjeta separa los dos datos.                                  | Prompt K4a puntos 1–3; spec de ciclo v1.1 §3; addendum U v1.1.           | **Justificado** |
| `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx:321`            | Cambia el selector de acciones para localizar el disparador con el nombre accesible nuevo.                                                                                                                                                                     | `ContractCard.tsx:159-161,259`; el texto derivado del alias del servicio se anuncia en el disparador.                                                   | Prompt K4a punto 2 y addendum U v1.1.                                    | **Justificado** |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-confirm.postgres.integration.spec.ts:34,105`        | Sustituye el esquema copiado de `test-s2-live` por esquema propio migrado y prueba que un fallo posterior al insert real de auditoría revierte confirmación y auditoría.                                                                                       | `subscriber-tax-profile.service.ts:367` confirma y registra la auditoría bajo la transacción; `AuditService.logWithin` recibe el manager transaccional. | Prompt K4b P2-1; patrón `subscriber-enum-parity`.                        | **Justificado** |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax.security.http.spec.ts:105`                          | Añade casos HTTP PUT/PATCH/POST/confirm con solo `CRM_SUBSCRIBERS_READ`, esperan 403 y comprueban que no se llamó a los servicios de escritura.                                                                                                                | `subscriber-tax.controller.ts:74,101,130,150`; contrato de permisos de lectura frente a gestión.                                                        | Prompt K4b P2-2.                                                         | **Justificado** |
| `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts:2415,2442,2473,2495,2559`                  | Completa aserciones de auditoría (`blockedServed`), delegación y orden de lectura de contrato antes de resolver su suscriptor.                                                                                                                                 | `contracts.service.ts` agenda de corte, delegaciones a `SubscriberLifecycleService` y `assertContractNotBlocked`/`assertSubscriberNotBlocked`.          | Prompt K4b P3-3; no cambia la expectativa funcional ni reduce cobertura. | **Justificado** |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-lifecycle.service.postgres.integration.spec.ts:266,293` | Añade pruebas PostgreSQL para avance exacto de +1 ms sobre una versión futura y para idempotencia del reintento de suplantación.                                                                                                                               | `subscriber-lifecycle.service.ts:289` y `crm-contract-impersonation.adapter.ts:106` avanzan `updated_at` al menos 1 ms.                                 | Prompt K4b P3-4; exige Postgres real.                                    | **Justificado** |
| `e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts:354,398`                                                  | Corrige el comentario, prueba el menú por `/Acciones de /` y valida ciclo y corte como dos textos independientes.                                                                                                                                              | `ContractCard.tsx:251-264,315-325`; nuevo menú y presentación separada.                                                                                 | Prompt K4d punto 1 y spec de ciclo v1.1 §3.                              | **Justificado** |

**Specs revisadas:** las siete rutas de la tabla; diff contrastado con los snapshots de K4a/K4b/K4d. Revisión estática, sin ejecutar suites completas (eso corresponde a G1). No se editaron pruebas ni código en K4e.

## G1 repetido tras K4 (2026-11-01; histórico, supersedido por §C1b)

**Veredicto de gates: NO-GO.** K4e no encontró hallazgos C y se ejecutó G1 completo. La E2E live de ciclo no llegó al escenario de negocio porque el entorno local no tenía consumidor de `tenant-provisioning`; además, R-ER sigue en `[BLOQUEO]` según §K4c. No se modificaron pruebas ni código durante G1.

| #   | Gate                                                             | Evidencia ejecutada o reutilizada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Resultado                                    |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Typecheck y lint de shared, db, api y portal                     | `pnpm exec turbo run typecheck lint --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/api --filter=@iwana/portal --force`; 12 tareas, 0 cacheadas, salida 0. Typecheck sin errores. ESLint sin errores; 54 advertencias existentes: db 5, api 7, portal 42.                                                                                                                                                                                                                                                           | **PASS**                                     |
| 2   | Suites completas sin caché                                       | `pnpm exec turbo run test --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/api --filter=@iwana/portal --force --concurrency=1`; 0 tareas cacheadas. Shared: 28 suites/278 tests, 0 omitidos. DB: 77/423, 0 omitidos. Portal: 340/3435; 1 test omitido en `InventoryClient.spec.tsx`. API: 443 suites/5930 tests aprobados; 4 suites/15 tests omitidos por guards opt-in (`TENANT_MIGRATIONS_REAL_DB` y `EV1_REAL_DB`). Sin fallos. Jest portal advirtió que forzó la salida de un worker que no terminó limpiamente. | **PASS con omisiones registradas**           |
| 3   | Integraciones Postgres requeridas, `DB_NAME=dbiw`, sin omisiones | API: contratos, cambio de plan, ciclo de vida, 360 cotizaciones y fecha de nacimiento; 5 suites/47 tests, 0 omitidos. DB: migraciones 167 y 168; 2 suites/2 tests, 0 omitidos. PostgreSQL alcanzable en `127.0.0.1:5433/dbiw`; las suites usaron esquemas de prueba.                                                                                                                                                                                                                                                          | **PASS**                                     |
| 4   | E2E de cambio de plan y ciclo                                    | Ejecución local: `portal-contract-plan-change.spec.ts` y `portal-crm-ciclo-facturacion-live.spec.ts`; 4 tests: cambio de plan 3/3 PASS. El caso CA-CF-12 no alcanzó el escenario: setup dejó el tenant sintético en `PROVISIONING` y expiró. Triage `e2e-triage`: **entorno**, 1; flaky, 0; regresión, 0. API confirmó que encoló provisioning; Redis mostró `wait=1`, `active=0`, `delayed=0`; `docker ps` no tiene worker. No se reintentó ni movió la cola.                                                                | **NOT_EXECUTED para CA-CF-12; gate abierto** |
| 5   | `pnpm audit --prod --audit-level critical`                       | Salida 0. Resumen: 11 vulnerabilidades en total (1 baja, 7 moderadas, 3 altas); ninguna crítica al umbral solicitado.                                                                                                                                                                                                                                                                                                                                                                                                         | **PASS al umbral crítico**                   |
| 6   | Cobertura ≥80 % en tres servicios                                | Reutilizada evidencia K4b sin cambios productivos posteriores: 5 suites/244 tests, 0 fallidos/omitidos; JSON de cobertura de `k4b-coverage-final`. `contracts.service.ts`: líneas 94.45 %, ramas 82.82 %, funciones 98.87 %, sentencias 92.90 %. `subscribers.service.ts`: 94.21 %, 86.20 %, 85.52 %, 93.60 %. `subscriber-tax-profile.service.ts`: 98.57 %, 82.89 %, 100 %, 96.71 %.                                                                                                                                         | **PASS**                                     |
| 7   | Auditorías documentales                                          | `pnpm audit:adr-citations`: 0 bloqueantes, 153 avisos heurísticos. `pnpm audit:doc-locations`: 0 bloqueantes, 3 avisos por informes bajo `.playwright-mcp/`. Ambas salidas 0.                                                                                                                                                                                                                                                                                                                                                 | **PASS**                                     |

### Triage E2E y siguiente paso

El proceso `worker` no estaba levantado. La cola de desarrollo tiene un único job de provisioning sintético esperando. El teardown marcó el tenant de esa corrida para eliminación, pero el job sigue en `wait`; no se ejecutó el worker ni se reintentó, eliminó o movió el job. Conforme a `iwana-queue-inspect` («si hace falta actuar sobre una cola, se reporta y lo decide el usuario»), el siguiente paso requiere decisión del usuario para permitir que el worker local consuma ese job; después `sr-qa` puede repetir CA-CF-12. Este bloqueo es de entorno y no demuestra regresión del flujo.

**Bloqueo de cierre independiente:** R-ER sigue abierto por la ruta de mutación posterior a anonimización descrita en §K4c. Aun cuando se resuelva el worker y pase CA-CF-12, el clúster conserva NO-GO hasta resolver ese hallazgo con su spec de privacidad.

## Dictamen AI-EM-ARCH tras G1/K4f (2026-11-01; histórico, supersedido por §C1b)

**Seis de siete gates en PASS. Solo queda abierto el gate 4, por entorno. R-ER no bloquea C1.**

**R-ER se reclasifica como defecto preexistente fuera del clúster.** Lo verificado contra `HEAD` (`6dbdda8a`):

- La excepción por titular anonimizado ya existía en `HEAD`: `assertSubscriberNotBlocked` retorna con `anonymizedAt != null` (`HEAD:contracts.service.ts:575-577`). La introdujo el commit `079daf80` de la Fase 1b de privacidad. `subscribers-blocked-titular.guard.ts` no tiene cambios en el árbol.
- `titular-erasure/` tampoco tiene cambios: `CURRENT_TIMESTAMP` está en `HEAD:titular-erasure-sql.ts:279`.
- El clúster no crea ni amplía la ruta abierta. Cambió la línea de la excepción, pero no su condición.

Por eso aplica lo que dice §K4c del prompt: una spec propia del módulo de privacidad, sin ampliar el clúster. La lectura de §G1 que lo hacía bloquear el cierre no corresponde.

R-ER queda como **DT-3 de privacidad, prioridad alta**, por la Ley 2573, que rige desde el 19 de noviembre. La spec debe definir:

- qué mutaciones admite un registro anonimizado; como mínimo, que no se puedan reescribir los campos redactados (alias y notas, entre otros);
- la garantía de avance de versión de la escritura de supresión.

**Gate 4:** CA-CF-12 queda `NOT_EXECUTED` por falta de worker, clasificado como entorno, sin regresión. Para cerrarlo hace falta que el usuario autorice actuar sobre la cola de desarrollo (`iwana-queue-inspect`) y repetir CA-CF-12 (§K4f del prompt).

**Siguiente paso:** con CA-CF-12 en PASS, Q3 queda en GO y se lanza C1 (Ola 3), sin push.

## K4f — Repetición CA-CF-12 con worker autorizado (2026-11-01)

**Ejecución:** inspección de Redis en `db=0` antes y después; worker iniciado con `pnpm --filter @iwana/worker dev`, sin mover, reintentar ni borrar jobs. El job pendiente `provision-65da5d5f-219f-4156-8882-90e3690743df` correspondía a `srqa-mod05-cf-ed3b00f27351`, con estado `MARKED_FOR_DELETION` y sin esquema antes del worker. El worker lo consumió y lo completó: creó el esquema, ejecutó migraciones y seeds, y cambió el tenant a `ACTIVE`.

La repetición `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts --reporter=list` terminó en **1 test aprobado, 0 fallidos, 0 omitidos**. El esquema nuevo generado por la prueba cumple el patrón sintético y la spec comprueba que no sea `tenant_iwana`. Los 3 tests de cambio de plan se reutilizan de §G1; el gate 4 queda en **4/4 aprobados**.

### Colas antes y después

Conteos de `wait / active / paused / delayed / prioritized / failed / completed`. El corte posterior es 2026-11-01 07:08:32 (-05:00), después de la E2E.

| Cola                             | Antes                          | Después                        |
| -------------------------------- | ------------------------------ | ------------------------------ |
| `tenant-provisioning`            | 1 / 0 / 0 / 0 / 0 / 1 / 6      | 0 / 0 / 0 / 0 / 0 / 1 / 8      |
| `refresh-token-purge`            | 0 / 0 / 0 / 1 / 0 / 0 / 1      | 0 / 0 / 0 / 1 / 0 / 0 / 1      |
| `tenant-schema-purge`            | 0 / 0 / 0 / 1 / 0 / 0 / 18     | 0 / 0 / 0 / 1 / 0 / 0 / 18     |
| `search-index`                   | 2 / 0 / 0 / 0 / 0 / 0 / 0      | 0 / 0 / 0 / 0 / 0 / 0 / 0      |
| `assurance-field-service`        | 0 / 0 / 0 / 0 / 0 / 0 / 0      | 0 / 0 / 0 / 0 / 0 / 0 / 0      |
| `operations-execution-events`    | 0 / 0 / 0 / 0 / 0 / 0 / 0      | 0 / 0 / 0 / 0 / 0 / 0 / 0      |
| `inventory-execution-requests`   | 0 / 0 / 0 / 1 / 0 / 0 / 146    | 0 / 0 / 0 / 1 / 0 / 0 / 146    |
| `operations-execution-relay`     | 0 / 0 / 0 / 3 / 0 / 0 / 281799 | 0 / 0 / 0 / 3 / 0 / 0 / 281824 |
| `operations-execution-tombstone` | 0 / 0 / 0 / 1 / 0 / 0 / 2      | 0 / 0 / 0 / 1 / 0 / 0 / 2      |
| `operations-execution-dlq`       | 0 / 0 / 0 / 1 / 0 / 0 / 0      | 0 / 0 / 0 / 1 / 0 / 0 / 0      |
| `network-execution-events`       | 0 / 0 / 0 / 0 / 0 / 0 / 0      | 0 / 0 / 0 / 0 / 0 / 0 / 0      |
| `evidence-orphan-detection`      | 0 / 0 / 0 / 1 / 0 / 1 / 61     | 0 / 0 / 0 / 1 / 0 / 1 / 61     |
| `evidence-analysis`              | 0 / 0 / 0 / 0 / 0 / 0 / 0      | 0 / 0 / 0 / 0 / 0 / 0 / 0      |
| `schedule-events-sweep`          | 0 / 0 / 0 / 1 / 0 / 5 / 1561   | 0 / 0 / 0 / 1 / 0 / 5 / 1561   |

El job de provisioning anterior ya fallido permaneció en `failed=1`; no se reintentó ni eliminó. El worker también consumió los 2 jobs que estaban en espera de `search-index`. `operations-execution-relay` avanzó en 25 completados durante el intervalo, con `failed=0`; el log registró un `RELAY_FAILURE` de fondo para un tenant sintético, sin afectar la E2E.

### Verificación de tenant y gate 4

Tras el `afterAll` de la E2E, PostgreSQL muestra 16 tenants sintéticos `srqa-mod05-cf-*`, los 16 en `MARKED_FOR_DELETION`, con sus 16 esquemas asociados; el conteo de esquemas sintéticos sin fila de tenant es **0**. Los esquemas permanecen vinculados a sus registros marcados, a la espera de la purga programada; no se ejecutó ningún `DROP` manual.

**Estado final del gate 4: PASS.** CA-CF-12: 1/1 aprobado en esta repetición; cambio de plan: 3/3 aprobados según §G1. No se repitieron los otros seis gates, conforme a §K4f.

## Dictamen AI-EM-ARCH tras K4f (2026-11-01; histórico, supersedido por §C1b)

**Q3 en GO: siete de siete gates en PASS.** El gate 4 queda 4/4: CA-CF-12 1/1 en §K4f y los 3/3 de cambio de plan de §G1. No hay cambios de código desde §G1, así que la reutilización vale. **Q2 en GO:** sin P0/P1 abiertos; R-ER está fuera del clúster como DT-3. Se habilita C1.

**Observación nueva, fuera del clúster (DT-4, triage):** según §K4f, el worker procesó el job de un tenant que estaba en `MARKED_FOR_DELETION`: creó su esquema y lo pasó a `ACTIVE`. Si el aprovisionamiento puede resucitar un tenant marcado para borrar, ese tenant escapa de la purga programada. Hay una inconsistencia que resolver: al final §K4f cuenta los 16 tenants sintéticos en `MARKED_FOR_DELETION`. Se asigna triage de solo lectura a `plat-ops` (MOD13), después de C1; no bloquea el clúster. También queda registrado el `RELAY_FAILURE` de fondo, con `failed=0` en la cola.

## C1a — Inventario de rutas (2026-11-01)

**Corte actualizado para C1b, tras K3:** `git status --short`, 230 entradas. La tabla incluye el propio informe, que figura como `??` y se clasifica en commit 4. La clasificación usa rutas completas; los directorios `??` se cuentan tal como los resume Git. Los snapshots MOD05 se separaron de DT-3 antes de preparar el índice.

| Categoría                               |   Rutas |
| --------------------------------------- | ------: |
| Commit 1 — shared y migraciones 167/168 |      14 |
| Commit 2 — API MOD05                    |      52 |
| Commit 3 — portal y E2E                 |      52 |
| Commit 4 — documentación MOD05          |      30 |
| Excluida por D-CK-2                     |      13 |
| Ajena a C1                              |      69 |
| Dudosa — requiere decisión              |       0 |
| **Total**                               | **230** |

### Evidencia y criterio aplicado

- **E1 — Commit 1:** `git diff --stat` y diffs de `packages/shared` y migraciones 167/168 corresponden a ciclo de facturación, alias legible y contrato 360°. `packages/shared/src/index.ts:82` exporta el esquema de ciclo; API y portal consumen esos contratos. El snapshot completo de `runner.ts` conserva 167/168 y excluye 169.
- **E2a/E2b/E2c — Commit 2:** los diffs API corresponden a los puntos D/E/F/U y K1–K4; `contracts.module.ts` conecta el controlador de ciclos, y los controladores/servicios y specs de subscribers consumen los contratos compartidos. El informe de G1/K4 identifica las suites y rutas de API.
- **E3 — Commit 3:** los diffs son UI MOD05; `apps/portal/src/lib/api-client.ts:6894,7136,7145` consume el contrato 360° y las rutas de ciclo; las dos E2E listadas ejercitan cambio de plan y ciclo.
- **E4 — Commit 4:** los nombres y enlaces de planes, prompts, specs e informes coinciden con D/E/F/U y con el listado documental de C1b.
- **E5 — D-CK-2:** exclusión literal de §C1a y del punto 4 de Ola 3: archivos `next-env.d.ts`, temporal, PNG de evidencia, evidencia del cambio de plan y `.claude/launch.json`.
- **E6a–E6d — Ajena:** exclusiones expresas de §C1a. Los diffs de privacidad DT-3 (incluidos los nuevos B1R), gobernanza, checkpoint, otras iniciativas, configuración de prioridad y pruebas/resultados B1R no pertenecen a D/E/F/U. `rg` no muestra una importación nueva desde una ruta MOD05 limpia; los cruces con código de cluster quedan marcados E7.
- **E7 — Separación:** siete archivos de producción y dos specs tenían cambios MOD05 y B1 en el mismo archivo. Se prepararon snapshots completos MOD05, con copias y hashes de los originales fuera del repo y patches B1 de restauración. Antes de K3, los nueve hashes limpios coincidían con el manifest y ambos patches pasaban `git apply --check`. La corrección autorizada cambió `subscribers.service.ts`, uno de esos nueve archivos: el hash limpio del manifest ya no describe su estado K3 y `reapply-dt3-b1-after-c1.patch` ahora falla `git apply --check` en la línea 95; el patch del harness de contratos sigue pasando. Los originales, snapshots y patches se conservan. El patch 1 debe actualizarse y verificarse antes de cualquier commit que dependa de restaurar B1.

### Rutas dudosas

No quedan rutas dudosas después de preparar y verificar los snapshots completos MOD05.

**Dependencia de archivos completos:** los snapshots C1 de los seis archivos API y `runner.ts` no importan el helper `titular-anonymized-conflict` ni registran la migración 169. El controlador conserva permisos y `confirm` con la guarda de K3b; excluye las tres guardas añadidas por B1. Los dos casos B1 encontrados en specs K4 también se conservaron en patches separados. El guard `subscribers-blocked-titular.guard.ts`, el helper y la migración 169 siguen ajenos a C1.

**Entradas fuera del alcance original de B1 que aparecen en este corte:** `responsibilities.service.ts` y sus specs cambian para DT-3; además hay tres informes B1R. Se clasifican ajenos a C1. La ruta `responsibilities.service.ts` estaba fuera de las rutas B1 autorizadas.

**D-CK-2:** 13 entradas. **Privacidad DT-3 documental:** el estado actual contiene nueve rutas documentales DT-3, frente a las cuatro mencionadas al redactar §C1a §3; todas quedan ajenas a C1.

**Dictamen C1a actualizado para C1b:** inventario completo con 230/230 entradas clasificadas y 0 rutas dudosas después de separar los snapshots y añadir el K3 autorizado. Los totales cuadran; el usuario autorizó separar DT-3 primero y avanzar con C1b. No hay archivos staged todavía.

### Tabla completa de rutas

| Ruta (`git status --short`)                                                                                     | Categoría | Evidencia                                                        |
| --------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| ` M .agents/skills/INDEX.md`                                                                                    | Ajena     | E6a.                                                             |
| ` M .agents/skills/MANIFEST.json`                                                                               | Ajena     | E6a.                                                             |
| ` M .claude/agents/gate-verifier.md`                                                                            | Ajena     | E6a.                                                             |
| ` M .claude/hooks/guard-paths.mjs`                                                                              | Ajena     | E6a.                                                             |
| ` M .claude/hooks/session-context.mjs`                                                                          | Ajena     | E6a.                                                             |
| ` M .claude/settings.json`                                                                                      | Ajena     | E6a.                                                             |
| ` M .codex/agents/gate-verifier.toml`                                                                           | Ajena     | E6a.                                                             |
| ` M .opencode/agents/gate-verifier.md`                                                                          | Ajena     | E6a.                                                             |
| ` M AGENTS.md`                                                                                                  | Ajena     | E6a.                                                             |
| ` M apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts`                                            | Ajena     | E6c.                                                             |
| ` M apps/api/src/cli/anonymize-titular.spec.ts`                                                                 | Ajena     | E6c.                                                             |
| ` M apps/api/src/cli/anonymize-titular.ts`                                                                      | Ajena     | E6c.                                                             |
| ` M apps/api/src/common/filters/tenant-context-missing.filter.spec.ts`                                          | Ajena     | E6c.                                                             |
| ` M apps/api/src/common/filters/tenant-context-missing.filter.ts`                                               | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/access-control/access-permission-catalog.invariant.spec.ts`                            | Commit 2  | E2a.                                                             |
| ` M apps/api/src/modules/configuration/services/settings-priority-evaluator.spec.ts`                            | Ajena     | E6d.                                                             |
| ` M apps/api/src/modules/configuration/services/settings-priority.service.spec.ts`                              | Ajena     | E6d.                                                             |
| ` M apps/api/src/modules/crm/contracts/contracts.controller.ts`                                                 | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/contracts.module.ts`                                                     | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/contracts.service.ts`                                                    | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/dto/contract-response.dto.ts`                                            | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/dto/create-contract-from-expediente.dto.ts`                              | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/dto/create-contract.dto.ts`                                              | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/dto/update-contract.dto.ts`                                              | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/entities/contract.entity.ts`                                             | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.controller.http.spec.ts`                                 | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.controller.spec.ts`                                      | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`                    | Commit 2  | E2b.                                                             |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts`                                         | Commit 2  | E2b.                                                             |
| ` D apps/api/src/modules/crm/expedientes/crm-quote-read.adapter.ts`                                             | Commit 2  | E2c, K3: adaptador movido al módulo Quotes.                      |
| ` M apps/api/src/modules/crm/expedientes/expedientes.module.ts`                                                 | Commit 2  | E2c, K3: consume el port exportado por Quotes.                   |
| ` M apps/api/src/modules/crm/expedientes/expediente.service.ts`                                                 | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/expedientes/guards/expedientes-blocked-titular.guard.ts`                           | Ajena     | E6c.                                                             |
| ` D apps/api/src/modules/crm/expedientes/tests/crm-quote-read.adapter.spec.ts`                                  | Commit 2  | E2c, K3: spec trasladada a Quotes.                               |
| ` M apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`                                      | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts`                            | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/privacy-adapters/crm-contract-standing-read.adapter.ts`                            | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts`                             | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts`               | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.ts`                           | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/ports/crm-quote-read.port.ts`                                                      | Commit 2  | E2c, K3: proyección tipada para la ficha 360°.                   |
| ` M apps/api/src/modules/crm/provisioning-readiness.ts`                                                         | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/quotes/crm-quote-read.adapter.ts`                                                  | Commit 2  | E2c, K3: adapter propiedad de Quotes; campos limitados.          |
| ` M apps/api/src/modules/crm/quotes/quotes.module.ts`                                                           | Commit 2  | E2c, K3: registra y exporta el port.                             |
| `?? apps/api/src/modules/crm/quotes/tests/crm-quote-read.adapter.spec.ts`                                       | Commit 2  | E2c, K3: prueba de proyección y exclusión del snapshot del plan. |
| ` M apps/api/src/modules/crm/responsibilities/responsibilities.service.ts`                                      | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts`                           | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts`                   | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts`                                         | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/guards/guard-blocked-titular.decorator.ts`                             | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/guards/subscribers-blocked-titular.guard.ts`                           | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscriber-enum-parity.postgres.integration.spec.ts`                   | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscriber-lifecycle.service.ts`                                       | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts`                               | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts`                                     | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscriber-tax.controller.ts`                                          | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts`                             | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscribers.controller.ts`                                             | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/subscribers.module.ts`                                                 | Commit 2  | E2c, K3: importa QuotesModule.                                   |
| ` M apps/api/src/modules/crm/subscribers/subscribers.service.ts`                                                | Commit 2  | E2c, K3: consume CrmQuoteReadPort.                               |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-lifecycle.service.postgres.integration.spec.ts`       | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-projection.spec.ts`                                   | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts`                    | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts`                          | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-tax.controller.http.spec.ts`                          | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/tests/subscribers.controller.spec.ts`                                  | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`                                     | Commit 2  | E2c.                                                             |
| ` M apps/api/src/modules/crm/tests/crm-blocked-mutations.arch.spec.ts`                                          | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/crm/tests/crm-blocked-mutations.http.spec.ts`                                          | Ajena     | E6c.                                                             |
| `?? apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts`                 | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/privacy/requests/ports/contract-standing-read.port.ts`                                 | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/privacy/requests/requests.service.ts`                                                  | Ajena     | E6c.                                                             |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.spec.ts`                            | Ajena     | E6d.                                                             |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.ts`                                 | Ajena     | E6d.                                                             |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.port.ts`                                    | Ajena     | E6d.                                                             |
| ` M apps/portal/next-env.d.ts`                                                                                  | D-CK-2    | E5.                                                              |
| ` M apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx`                                           | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/ContractCard.tsx`                                                | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`                                        | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx`                           | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx`                                        | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/ServiciosTab.tsx`                                                | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx`              | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`                                      | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberFiscalFields.tsx`                                      | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberForm.tsx`                                              | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx`                                            | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberLifecycleDialog.portal.spec.tsx`                       | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberPeek.spec.tsx`                                         | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberSections.spec.tsx`                                     | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberSections.tsx`                                          | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx`                                     | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscriberTechnicalServiceSection.tsx`                           | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`                                       | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/TaxProfileBlock.tsx`                                             | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/contracts-dialogs.behavior.spec.tsx`                             | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx`                            | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx`                           | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx`                            | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/stratum-evidence-upload.portal.spec.tsx`                         | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/subscriber-contact-pending.portal.spec.tsx`                      | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/subscriber-ficha-ux-qw.portal.spec.tsx`                          | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/subscriber-fiscal.ts`                                            | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/subscriber-ui.spec.ts`                                           | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/crm/subscribers/subscriber-ui.ts`                                                | Commit 3  | E3.                                                              |
| ` M apps/portal/src/components/privacy/privacy-channel-capture.portal.spec.tsx`                                 | Ajena     | E6c.                                                             |
| ` M apps/portal/src/components/shared/portal-ui.tsx`                                                            | Commit 3  | E3.                                                              |
| ` M apps/portal/src/lib/api-client.ts`                                                                          | Commit 3  | E3.                                                              |
| ` M apps/web/next-env.d.ts`                                                                                     | D-CK-2    | E5.                                                              |
| ` M docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md`                                                 | Ajena     | E6b.                                                             |
| ` M docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.0.md`                                                  | Ajena     | E6b.                                                             |
| ` M docs/informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md`                                                 | Ajena     | E6b.                                                             |
| ` M docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`                                                     | Ajena     | E6b.                                                             |
| ` M docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`                                               | Ajena     | E6b.                                                             |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-plans-desktop.png`                        | D-CK-2    | E5.                                                              |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-plans-mobile.png`                         | D-CK-2    | E5.                                                              |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-products-desktop.png`                     | D-CK-2    | E5.                                                              |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-products-mobile.png`                      | D-CK-2    | E5.                                                              |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-summary-desktop.png`                      | D-CK-2    | E5.                                                              |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-summary-mobile.png`                       | D-CK-2    | E5.                                                              |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-tax-simulator-desktop.png`                | D-CK-2    | E5.                                                              |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-tax-simulator-mobile.png`                 | D-CK-2    | E5.                                                              |
| ` M docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`                                                 | Ajena     | E6c.                                                             |
| ` M docs/roles/Perfil_IA_Verificador_Gates_v1.md`                                                               | Ajena     | E6a.                                                             |
| ` M docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`                                                        | Ajena     | E6a.                                                             |
| ` M docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md`                                                        | Commit 4  | E4.                                                              |
| ` M packages/database/src/migrations/tenant/runner.ts`                                                          | Commit 1  | E1.                                                              |
| ` M packages/shared/src/calendar/index.ts`                                                                      | Commit 1  | E1.                                                              |
| ` M packages/shared/src/index.ts`                                                                               | Commit 1  | E1.                                                              |
| ` M packages/shared/src/schemas/contract.schema.spec.ts`                                                        | Commit 1  | E1.                                                              |
| ` M packages/shared/src/schemas/contract.schema.ts`                                                             | Commit 1  | E1.                                                              |
| ` M scripts/claude-hooks.test.mjs`                                                                              | Ajena     | E6a.                                                             |
| `?? .agents/skills/iwana-checkpoint-commit/`                                                                    | Ajena     | E6a.                                                             |
| `?? .claude/agents/test-change-reviewer.md`                                                                     | Ajena     | E6a.                                                             |
| `?? .claude/hooks/post-push-ci.mjs`                                                                             | Ajena     | E6a.                                                             |
| `?? .claude/launch.json`                                                                                        | D-CK-2    | E5.                                                              |
| `?? .claude/skills/iwana-checkpoint-commit/`                                                                    | Ajena     | E6a.                                                             |
| `?? .codex/agents/test-change-reviewer.toml`                                                                    | Ajena     | E6a.                                                             |
| `?? .opencode/agents/test-change-reviewer.md`                                                                   | Ajena     | E6a.                                                             |
| `?? .tmp-plan-change-tests.json`                                                                                | D-CK-2    | E5.                                                              |
| `?? apps/api/src/modules/crm/contracts/billing-cycle-date.util.spec.ts`                                         | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/billing-cycle-date.util.ts`                                              | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/billing-cycles.controller.spec.ts`                                       | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/billing-cycles.controller.ts`                                            | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/billing-cycles.swagger.spec.ts`                                          | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/ports/`                                                                  | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/tests/billing-cycles.controller.http.spec.ts`                            | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/tests/contract-plan-change.postgres.integration.spec.ts`                 | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/contracts/tests/contract-plan-change.service.spec.ts`                              | Commit 2  | E2b.                                                             |
| `?? apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.postgres.integration.spec.ts` | Ajena     | E6c.                                                             |
| `?? apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.postgres.integration.spec.ts`      | Ajena     | E6c.                                                             |
| `?? apps/api/src/modules/crm/subscribers/guards/titular-anonymized-conflict.ts`                                 | Ajena     | E6c.                                                             |
| `?? apps/api/src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts`                    | Commit 2  | E2c.                                                             |
| `?? apps/api/src/modules/crm/subscribers/subscriber-birth-date.postgres.integration.spec.ts`                    | Commit 2  | E2c.                                                             |
| `?? apps/api/src/modules/crm/subscribers/tests/subscriber-360.contract.spec.ts`                                 | Commit 2  | E2c.                                                             |
| `?? apps/api/src/modules/crm/subscribers/tests/subscriber-tax-confirm.postgres.integration.spec.ts`             | Commit 2  | E2c.                                                             |
| `?? apps/api/src/modules/crm/subscribers/tests/subscriber-tax.security.http.spec.ts`                            | Commit 2  | E2c.                                                             |
| `?? apps/portal/src/app/dashboard/crm/subscribers/agenda-corte/`                                                | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/ActivateServiceDialog.tsx`                                       | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/BillingCycleField.tsx`                                           | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.spec.tsx`                               | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.tsx`                                    | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/CutoffAgendaClient.portal.spec.tsx`                              | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/CutoffAgendaClient.tsx`                                          | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/LocationPreviewMap.tsx`                                          | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/ServiciosTab.filtros.spec.tsx`                                   | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/ServiciosTab.interes-comercial.spec.tsx`                         | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/SubscriberFiscalFields.spec.tsx`                                 | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/SubscriberFiscalSection.tsx`                                     | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.spec.tsx`                                  | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.tsx`                                       | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx`                            | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/billing-cycle-ui.ts`                                             | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/tributario-ux.portal.spec.tsx`                                   | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/use-billing-cycles.ts`                                           | Commit 3  | E3.                                                              |
| `?? apps/portal/src/components/crm/subscribers/use-contract-plan.ts`                                            | Commit 3  | E3.                                                              |
| `?? docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.0.md`                                              | Commit 4  | E4.                                                              |
| `?? docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.1.md`                                              | Commit 4  | E4.                                                              |
| `?? docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md`                                              | Commit 4  | E4.                                                              |
| `?? docs/informes/INFORME-MOD05-CAMBIO-PLAN-DISENO-v1.0.md`                                                     | Commit 4  | E4.                                                              |
| `?? docs/informes/INFORME-MOD05-CICLO-FACTURACION-GUARDADO-v1.0.md`                                             | Commit 4  | E4.                                                              |
| `?? docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-OLA1-v1.0.md`                                             | Commit 4  | E4.                                                              |
| `?? docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`                                                  | Commit 4  | E4.                                                              |
| `?? docs/informes/INFORME-PRIVACY-DT3-B1R-CONTRATOS-v1.0.md`                                                    | Ajena     | E6c.                                                             |
| `?? docs/informes/INFORME-PRIVACY-DT3-B1R-EXPEDIENTES-v1.0.md`                                                  | Ajena     | E6c.                                                             |
| `?? docs/informes/INFORME-PRIVACY-DT3-B1R-v1.0.md`                                                              | Ajena     | E6c.                                                             |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/`                                                       | D-CK-2    | E5.                                                              |
| `?? docs/plans/2026-10-30-mod05-cambio-plan-contrato.md`                                                        | Commit 4  | E4.                                                              |
| `?? docs/plans/2026-10-30-mod05-ciclo-facturacion.md`                                                           | Commit 4  | E4.                                                              |
| `?? docs/plans/2026-10-31-mod05-consolidacion-cluster.md`                                                       | Commit 4  | E4.                                                              |
| `?? docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md`                                                      | Ajena     | E6c.                                                             |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.0.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.1.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.2.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.4.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.5.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.6.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.7.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`                                                        | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.0.md`                                             | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.1.md`                                             | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.2.md`                                             | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.3.md`                                             | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.4.md`                                             | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`                                                    | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-MOD05-SUBSCRIBERS-360-COTIZACIONES-REVISION-v1.0.md`                                    | Commit 4  | E4.                                                              |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.0.md`                                                         | Ajena     | E6c.                                                             |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.1.md`                                                         | Ajena     | E6c.                                                             |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.2.md`                                                         | Ajena     | E6c.                                                             |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.3.md`                                                         | Ajena     | E6c.                                                             |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md`                                                                | Ajena     | E6c.                                                             |
| `?? docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-LAUNCH-v1.6.md`                                          | Commit 4  | E4.                                                              |
| `?? docs/roles/Perfil_IA_Revisor_Cambios_Pruebas_v1.md`                                                         | Ajena     | E6a.                                                             |
| `?? docs/specs/2026-10-30-mod05-cambio-plan-contrato-ux.md`                                                     | Commit 4  | E4.                                                              |
| `?? docs/specs/2026-10-31-mod05-ficha-suscriptor-addendum-u.md`                                                 | Commit 4  | E4.                                                              |
| `?? docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md`                                   | Ajena     | E6c.                                                             |
| `?? e2e/tests/portal-contract-plan-change.spec.ts`                                                              | Commit 3  | E3.                                                              |
| `?? e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts`                                                        | Commit 3  | E3.                                                              |
| `?? packages/database/src/migrations/tenant/167_crm_billing_cycles.integration.spec.ts`                         | Commit 1  | E1.                                                              |
| `?? packages/database/src/migrations/tenant/167_crm_billing_cycles.ts`                                          | Commit 1  | E1.                                                              |
| `?? packages/database/src/migrations/tenant/168_crm_contract_alias_readable.integration.spec.ts`                | Commit 1  | E1.                                                              |
| `?? packages/database/src/migrations/tenant/168_crm_contract_alias_readable.ts`                                 | Commit 1  | E1.                                                              |
| `?? packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations.integration.spec.ts`           | Ajena     | E6c.                                                             |
| `?? packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations.ts`                            | Ajena     | E6c.                                                             |
| `?? packages/shared/src/calendar/billing-cutoff.spec.ts`                                                        | Commit 1  | E1.                                                              |
| `?? packages/shared/src/calendar/billing-cutoff.ts`                                                             | Commit 1  | E1.                                                              |
| `?? packages/shared/src/contracts/crm/`                                                                         | Commit 1  | E1.                                                              |
| `?? packages/shared/src/schemas/billing-cycle.schema.spec.ts`                                                   | Commit 1  | E1.                                                              |
| `?? packages/shared/src/schemas/billing-cycle.schema.ts`                                                        | Commit 1  | E1.                                                              |

## C1b — Preflight y repetición G1 (2026-11-01)

**Estado: [BLOQUEO] antes de `git add`.** Se cerró el P1 de boundary autorizado y la repetición G1 anterior dio 4/7 PASS y 3/7 FAIL. En la revalidación precommit solicitada ahora, typecheck pasa, las suites completas API/DB fallan y las siete integraciones PostgreSQL se omitieron porque el daemon Docker y la base no están disponibles. §C1b exige cero omisiones y ordena parar si algo falla. No se hizo staging, stash, commit ni push.

### Cierre del P1 de boundary

`SubscribersService` ya no importa ni consulta `Quote`. La lectura de la ficha 360° cruza `CrmQuoteReadPort`; el adapter vive y se registra en `QuotesModule`, que exporta el port, y la consulta limita sus columnas a la proyección permitida (omite `planSnapshotJson`). `ExpedientesModule` y `SubscribersModule` consumen el módulo Quotes. La prueba del adapter verifica la proyección y la omisión del snapshot; la integración 360° contra PostgreSQL real también pasa.

- Foco y prueba unitaria: [crm-quote-read.port.ts](../../apps/api/src/modules/crm/ports/crm-quote-read.port.ts:12), [crm-quote-read.adapter.ts](../../apps/api/src/modules/crm/quotes/crm-quote-read.adapter.ts:10), [crm-quote-read.adapter.spec.ts](../../apps/api/src/modules/crm/quotes/tests/crm-quote-read.adapter.spec.ts:91), [subscribers.service.ts](../../apps/api/src/modules/crm/subscribers/subscribers.service.ts:1795).
- Verificación focalizada: 2 suites, 12 pruebas pasaron, 81 filtradas por el `-t` explícito; integración real 360°: 1 suite/1 prueba, 0 omitidas. No se tocó código productivo adicional en la repetición de G1.

### G1 repetido tras K3

|   # | Gate                                                                                 | Resultado | Evidencia fresca, sin caché                                                                                                                                                                                                                                                                                                                                                                                            |
| --: | ------------------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Typecheck y lint de shared, db, API y portal                                         | **PASS**  | Turbo `--force`: 12/12 tareas, 0 en caché, salida 0. Typecheck sin errores; ESLint sin errores. Warnings: DB 5, API 7, portal 42.                                                                                                                                                                                                                                                                                      |
|   2 | Suites completas de shared, db, API y portal                                         | **FAIL**  | Shared 28/28 suites y 278/278 tests. API 5 fallidas, 4 omitidas, 438 aprobadas (447 suites); 14 tests fallidos, 15 omitidos, 5936 aprobados (5965). DB 1 fallida y 76 aprobadas (77); 2 tests fallidos y 421 aprobados (423). Portal 1 fallida, 339 aprobadas (340); 1 test fallido, 1 omitido, 3434 aprobados (3436).                                                                                                 |
|   3 | Integraciones PostgreSQL: contratos, cambio de plan, ciclo, 360, fecha y migraciones | **FAIL**  | `DB_NAME=dbiw`, `IWANA_DB_INTEGRATION_AVAILABLE=true`, sin skips. API: 5 suites/47 tests; 2 suites pasan, 43 tests pasan y 4 fallan. Nacimiento y 360 pasan. Contratos: `CONTRACT_CHANGED` esperado no se produce; ciclo RF-LC-17 esperaba `ConflictException` y recibió `UnprocessableEntityException`; cambio de plan falla las comprobaciones de versión/concurrencia. Migraciones 167/168: 2 suites/2 tests pasan. |
|   4 | E2E portal de cambio de plan y ciclo live                                            | **PASS**  | 4/4 aprobadas, 0 omitidas. La configuración estándar reserva 3002, ocupado por el portal dev; se usó configuración temporal idéntica en 3003 y se eliminó al terminar. API dev respondió 200; ciclo creó tenant sintético `srqa-mod05-cf-*`, comprueba que el esquema no sea `tenant_iwana`, y pasó el teardown.                                                                                                       |
|   5 | Auditoría de dependencias sin críticas                                               | **PASS**  | `pnpm audit --prod --audit-level critical`: salida 0, 11 vulnerabilidades (1 baja, 7 moderadas, 3 altas), 0 críticas.                                                                                                                                                                                                                                                                                                  |
|   6 | Cobertura de líneas, ramas, funciones y sentencias ≥80 % en tres servicios           | **FAIL**  | Corrida focalizada de 6 suites/260 tests, 0 omitidos: `subscriber-tax-profile.service.ts` queda en 79,22 % de ramas, bajo el umbral. Detalle por servicio debajo.                                                                                                                                                                                                                                                      |
|   7 | Auditorías ADR y ubicación documental sin bloqueantes                                | **PASS**  | `audit:adr-citations`: 0 bloqueantes/153 avisos. `audit:doc-locations`: 0 bloqueantes/3 avisos.                                                                                                                                                                                                                                                                                                                        |

Comandos de suites completas, todos con `--runInBand --no-cache`: `pnpm --filter @iwana/shared exec jest`, `pnpm --filter @iwana/db exec jest`, `pnpm --filter @iwana/api exec jest` y `pnpm --filter @iwana/portal exec jest`. Integraciones: API `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runTestsByPath ...`; DB `pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runTestsByPath src/migrations/tenant/167_crm_billing_cycles.integration.spec.ts src/migrations/tenant/168_crm_contract_alias_readable.integration.spec.ts --runInBand --no-cache`. E2E: `pnpm exec playwright test --config=e2e/playwright.portal.c1b-temp.config.ts e2e/tests/portal-contract-plan-change.spec.ts e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts --reporter=line`; la configuración temporal solo cambió el puerto del standalone a 3003 y se borró al finalizar.

Logs completos en `%TEMP%`: `mod05-g1-typecheck-lint-after-k3-2026-11-01.log`, `mod05-g1-shared-2026-11-01.log`, `mod05-g1-api-2026-11-01.log`, `mod05-g1-db-2026-11-01.log`, `mod05-g1-portal-2026-11-01.log`, `mod05-g1-api-integrations-2026-11-01.log`, `mod05-g1-db-migrations-integration-2026-11-01.log`, `mod05-g1-e2e-2026-11-01.log`, `mod05-g1-focused-coverage-2026-11-01.log` y los logs de revalidación C1b listados al final.

#### Cobertura focalizada de los tres servicios

Comando Jest con `--coverage --no-cache`, `DB_NAME=dbiw` e `IWANA_DB_INTEGRATION_AVAILABLE=true`, limitado a los servicios CRM y a `contracts.service.spec.ts`, `subscribers.service.spec.ts`, `subscriber-tax-profile.service.spec.ts`, `contracts.service.postgres.integration.spec.ts`, `contract-plan-change.postgres.integration.spec.ts` y `subscriber-lifecycle.service.postgres.integration.spec.ts`. Las seis suites terminaron: 5 fallidas, 1 aprobada; 15 tests fallidos, 245 aprobados, 0 omitidos. Jest generó las métricas aunque el proceso salió 1.

| Servicio                            | Sentencias |       Ramas | Funciones |  Líneas |
| ----------------------------------- | ---------: | ----------: | --------: | ------: |
| `contracts.service.ts`              |    91,39 % |     84,02 % |   95,50 % | 93,00 % |
| `subscribers.service.ts`            |    93,10 % |     86,02 % |   85,33 % | 93,71 % |
| `subscriber-tax-profile.service.ts` |    89,67 % | **79,22 %** |     100 % | 90,90 % |

Resumen global de esas tres fuentes: 91,97 % de sentencias, 84,70 % de ramas, 91,84 % de funciones y 93,09 % de líneas. El gate 6 no pasa porque cada métrica por servicio debe alcanzar 80 %.

La suite completa de API falla en cinco archivos: `subscribers.service.spec.ts` (2), `subscriber-tax-profile.service.spec.ts` (9), `crm-blocked-mutations.http.spec.ts` (1), `contract-plan-change.service.spec.ts` (1) y `crm-blocked-mutations.arch.spec.ts` (1). El caso de titular bloqueado en `changePlan` deja que la promesa se resuelva; se registra como `[BLOQUEO]` de producción conforme a K4b, sin corregirlo en esta verificación. La suite DB falla en `migration-order.spec.ts`: la migración DT-3 169 está en el árbol ajeno, pero no en el runner limpio de C1. Portal falla en `TaskIntakeClient.spec.tsx` (no es una ruta MOD05 del diff): no encuentra la opción «Laura Ruiz». La misma cobertura focalizada deja nueve expectativas de `subscriber-tax-profile.service.spec.ts` fallidas y el gate de ramas en 79,22 %.

### Separación DT-3/B1 y estado del índice

Las copias originales MOD05+DT-3 se conservan en `C:\Users\SLEYB\AppData\Local\Temp\iwana-mod05-separate-snapshots-2026-11-01\mixed\` y `C:\Users\SLEYB\AppData\Local\Temp\iwana-mod05-separate-snapshots-2026-11-01\mixed-specs\`. Los manifests son `C:\Users\SLEYB\AppData\Local\Temp\iwana-mod05-separate-snapshots-2026-11-01\clean-and-mixed-sha256.csv` y `C:\Users\SLEYB\AppData\Local\Temp\iwana-mod05-separate-snapshots-2026-11-01\clean-and-mixed-specs-sha256.csv`. Los patches B1 originales son `C:\Users\SLEYB\AppData\Local\Temp\iwana-mod05-separate-snapshots-2026-11-01\reapply-dt3-b1-after-c1.patch` (SHA-256 `0BAAEE32F2250E687CE629C06C9423C20670FC1BB995BE5E6F02CAB415BCF299`) y `C:\Users\SLEYB\AppData\Local\Temp\iwana-mod05-separate-snapshots-2026-11-01\reapply-dt3-b1-contracts-spec-harness-after-c1.patch` (SHA-256 `21B08403D14E14FA06DF69822C264C27E52A05087396A11FF393B270AF009826`). Los seis artefactos existen.

Tras K3, `git apply --check` da **FAIL** para el primer patch: no aplica en `subscribers.service.ts:95` porque el import de `Quote` del snapshot original fue reemplazado por el port. El segundo patch sigue pasando. No se aplicó ninguno. Se debe adaptar y verificar el primer patch antes de reanudar C1b; los originales no se borran hasta cerrar DT-3 Fase 2.

El hallazgo P2 de concurrencia en `contracts.service.ts:814-891,1549-1617` sigue siendo preexistente según el contraste con `HEAD`; no se atribuye como regresión ni se amplía el arreglo autorizado.

### Revalidación precommit pedida por C1b (2026-11-01)

- Typecheck de API, DB y shared: Turbo `--force`, 4/4 tareas exitosas, 0 en caché, salida 0.
- Suite unitaria API: 5 suites fallidas, 4 omitidas, 438 aprobadas (443 de 447); 14 tests fallidos, 15 omitidos y 5936 aprobados (5965).
- Suite unitaria DB: 1 suite fallida y 76 aprobadas (77); 2 tests fallidos y 421 aprobados (423). Los fallos de `migration-order.spec.ts` esperan la migración DT-3 169, presente en el directorio ajeno, pero ausente del runner limpio de C1.
- Integraciones de API: 5 suites/47 tests omitidos; migraciones DB 167/168: 2 suites/2 tests omitidos. El probe recibió `ECONNREFUSED 127.0.0.1:5433`; `docker ps` no pudo conectar con el daemon de Docker Desktop. No se ejecutó ningún test PostgreSQL en esta repetición; por tanto no cumple 0 omisiones.
- `git status --short`: 230/230 rutas clasificadas en C1a, 0 faltantes y 0 dudosas. Índice vacío.
- `git apply --check`: patch B1 principal falla en `subscribers.service.ts:95`; patch del harness pasa. No se aplicó ningún patch.

Logs de esta revalidación en `%TEMP%`: `mod05-c1b-typecheck-2026-11-01.log`, `mod05-c1b-api-2026-11-01.log`, `mod05-c1b-db-2026-11-01.log`, `mod05-c1b-api-integrations-rerun-2026-11-01.log` y `mod05-c1b-db-integrations-rerun-2026-11-01.log`.

**Inventario operativo:** 230 rutas, 52 en commit 2, 0 dudosas; [la tabla C1a](#tabla-completa-de-rutas) cuadra con `git status --short`. `git diff --cached --name-only` = 0. Sin stash, commits ni push. Dictamen Q3/C1b: **NO-GO** mientras haya gates rojos.

## Dictamen AI-EM-ARCH tras el bloqueo de C1b (2026-11-01)

**La separación E7 está incompleta: el árbol separado no representa ningún estado que haya pasado los gates.** Lo verifiqué por lectura comparando `mixed/` con los archivos actuales:

1. **Producción.** Los 7 snapshots quitan solo los hunks de DT-3. Por ejemplo, en `subscriber-tax-profile.service.ts` desaparecen `lockSubscriberForMutation` y `titularAnonymizedConflict`. Esa parte es correcta.
2. **Specs.** Solo se separaron 2. Hay specs del clúster que siguen con expectativas de B1 frente a código sin B1:
   - `contract-plan-change.service.spec.ts`, modificada a las 08:02;
   - `subscribers.service.spec.ts`, a las 09:00;
   - `subscriber-tax-profile.service.spec.ts`.

   A eso se suman las specs exclusivas de DT-3 (`crm-blocked-mutations.*`) y la migración 169, que siguen en el árbol. Los 14 + 2 fallos unitarios son artefactos de esta mezcla y no prueban una regresión del clúster. Tampoco prueban que el clúster esté en verde.

3. **Cambio de producción durante C1b.** `plat-ops` cerró un P1 de boundary: `SubscribersService` deja de importar `Quote` y pasa a usar `CrmQuoteReadPort`, lo que cambia tres `@Module`. Por eso el patch B1 principal ya no aplica. Este cambio no estaba en ningún encargo de AI-EM-ARCH y no tiene revisión de `boundary-reviewer` ni de `test-change-reviewer`.
4. **Última evidencia verde: el árbol combinado**, clúster más B1/B2, en B1-R de DT-3. API dio 443 suites y 5.953 tests, y DB 77 y 423, con 0 fallos (`INFORME-PRIVACY-DT3-B1R-v1.0.md`). Ese verde es anterior al cambio de boundary.

**Opciones, a decidir por el usuario según el plan DT-3 §Estado tras la Ola 1:**

- **A · Consolidar clúster + DT-3 (recomendada).** Se restaura B1, adaptando el único hunk de `subscribers.service.ts`. DT-3 termina B3-R, B3 y B4, y un G1 conjunto verifica el árbol entero. Después C1 commitea por archivo completo. Los archivos mezclados van en el commit de API y declaran los dos alcances. Requiere el G0 del CTO sobre la spec DT-3, que el plan DT-3 aún marca como pendiente. Cuesta esperar a DT-3.
- **B · Completar la separación.** Habría que:
  - separar los hunks B1 de al menos tres specs más;
  - sacar del árbol, sin borrarlos, los archivos exclusivos de DT-3 que rompen las suites;
  - repetir G1 sobre el árbol del clúster y commitear;
  - restaurar todo.

  Es la misma cirugía por hunks que ya produjo tres bloqueos (G, la pérdida de las 08:22 y C1b).

En los dos casos hace falta Docker y Postgres en marcha (las integraciones quedaron omitidas). También hay que clasificar el fallo de `TaskIntakeClient.spec.tsx` (portal, ajeno a MOD05) antes de exigir la suite completa en verde.

## C4a — Restauración B1 (2026-11-01)

**Estado: [BLOQUEO].** La precondición de entorno sí pasa: `docker ps` mostró `iwana_postgres_dev` healthy y Postgres aceptó TCP en `127.0.0.1:5433` (`TcpTestSucceeded=True`).

Se verificaron por SHA-256 los snapshots originales: 7/7 rutas de `mixed/` y 2/2 de `mixed-specs/`. Son 9 rutas en los manifests: 8 destinos sin conflicto y `subscribers.service.ts`, que debe preservar `CrmQuoteReadPort`. Hashes esperados de los snapshots:

| Ruta                                                                                | SHA-256 del snapshot                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/api/src/modules/crm/contracts/contracts.service.ts`                           | `76920ADB09BF645D85A0818E01E40E332C4CB5E9E4D4B1975818D82EF03387AC` |
| `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts`   | `F2107D8085D489829D83C6B3FD73C813B660A3FA0DE0868425F63952DD95191E` |
| `apps/api/src/modules/crm/subscribers/subscriber-lifecycle.service.ts`              | `AEDEF9BF6E312443E264EC5F87F6BA8D86B222B1471F3702D6DDA1E842CFCB20` |
| `apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts`            | `0DC49E3CA0355A5BF2169E32A43A6C45FA3207705896367537A697274A3C7829` |
| `apps/api/src/modules/crm/subscribers/subscriber-tax.controller.ts`                 | `5C21832A5C1B72C0356F415AA206ACF1A8A2FA1F7A7953E386C444C47F8D92E8` |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts`                       | `9E03E0F7F194B776025F8D446D6FBB1F298FC97DF855690F19A612FDD653F774` |
| `packages/database/src/migrations/tenant/runner.ts`                                 | `175853E214DB32CD5BDC45D8560859E2D3DDD1534A966457BB4B058BA2D882E6` |
| `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts`                | `4B4309441E699216B7AF576CD4D3D4630D0E951739D77C374DCFAEFC7EA920B9` |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax.controller.http.spec.ts` | `D5C26895D14A0F12FA7446BC3B40B86C6B3004ABF106A73DB9BD94E67F523146` |

El patch adaptado se guardó junto al original en `%LOCALAPPDATA%\Temp\iwana-mod05-separate-snapshots-2026-11-01\reapply-dt3-b1-after-c1-adapted-crm-quote-read-port.patch` (SHA-256 `4D41D3BD461CD98DB65C1290240BB2DDDA5098F1EE662CCFC544C5B01F0565A8`). Su diff cambia solo el contexto de importación de la línea 95 de `Quote` a `CrmQuoteReadPort`. El patch de specs pasa `git apply --check`; el patch principal original falla en ese import y, después de la adaptación permitida, sigue fallando en otro hunk de `subscribers.service.ts:1001`. Resolver ese hunk requeriría adaptar contenido fuera de la línea autorizada. No se aplicaron patches ni se restauró ningún archivo. Por el bloqueo no se ejecutó el typecheck de api/db/shared.

Sin stash, staging ni commit.

**Actualización:** la ruta de restauración completa quedó resuelta y verificada en §C4a-R; el bloqueo de hunks de esta sección está supersedido.

## C4b — Revisión del boundary y de pruebas de C1b (2026-11-01)

**Hallazgos P0/P1: ninguno. Hallazgos C: ninguno.**

| Regla                                                                                 | Evidencia                                                                                                                                                                                                                                                                                                                                                              | Veredicto |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| El consumidor usa un port del CRM y no importa la entidad de Quotes                   | `apps/api/src/modules/crm/ports/crm-quote-read.port.ts:12-32` declara `CrmQuoteReadPort`; `apps/api/src/modules/crm/subscribers/subscribers.service.ts:97,1792-1810` lo inyecta y lo usa dentro de `runInTenantSchema`.                                                                                                                                                | Conforme  |
| La implementación y la entidad quedan en Quotes; la proyección no incluye el snapshot | `apps/api/src/modules/crm/quotes/crm-quote-read.adapter.ts:10-36` consulta `Quote` y limita `select` a id, expediente, estado, plan, valor y fechas; no lee ni devuelve `planSnapshotJson`.                                                                                                                                                                            | Conforme  |
| Wiring sin dependencia circular                                                       | `apps/api/src/modules/crm/quotes/quotes.module.ts:11-20` provee/exporta el port y solo importa Commercial/AccessControl; `apps/api/src/modules/crm/subscribers/subscribers.module.ts:27-46` y `apps/api/src/modules/crm/expedientes/expedientes.module.ts:18,28-45` importan QuotesModule. La dirección revisada no retorna desde Quotes a Subscribers ni Expedientes. | Conforme  |

Revisión de pruebas: `apps/api/src/modules/crm/quotes/tests/crm-quote-read.adapter.spec.ts:18-42,76-123` conserva las pruebas trasladadas del adaptador y añade la selección/proyección 360°; `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts:1850-2007` prueba el port, la omisión para titulares bloqueados/anonimizados y el expediente de origen; `apps/api/src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts:44-65,117-150` usa un schema aleatorio, fila con snapshot sintético, filas ajenas y borradas, y compara la proyección real. El cambio mueve la prueba junto a su módulo dueño y no reduce expectativas existentes; veredicto: justificado. El diff de boundary no presenta cambio de serialización no cubierto por la integración.

Archivos revisados: `crm-quote-read.port.ts`, `quotes/crm-quote-read.adapter.ts`, `quotes/quotes.module.ts`, `expedientes/expedientes.module.ts`, `subscribers/subscribers.module.ts`, `subscribers/subscribers.service.ts`, `quotes/tests/crm-quote-read.adapter.spec.ts`, `subscribers/tests/subscribers.service.spec.ts` y `subscribers/subscriber-360-quotes.postgres.integration.spec.ts`.

## C4c — Triage de `TaskIntakeClient.spec.tsx` (2026-11-01)

**Clasificación: flaky/intermitente; iniciativa MOD11 Operaciones, ajena al clúster MOD05 y a DT-3.** En la suite portal completa falló una prueba al buscar la opción `Laura Ruiz` en `apps/portal/src/components/operations/TaskIntakeClient.spec.tsx:137`; conteo: 1 suite fallida, 339 pasaron, 340 total; 1 test fallido, 1 omitido, 3434 pasaron, 3436 total (`%TEMP%\mod05-g1-portal-2026-11-01.log`).

La spec sí define la respuesta de búsqueda con `Laura Ruiz` (`TaskIntakeClient.spec.tsx:46-52`). La repetición aislada sin caché terminó en PASS: 1 suite y 6/6 tests, incluido D-A3 (`pnpm --filter @iwana/portal exec jest --runTestsByPath src/components/operations/TaskIntakeClient.spec.tsx --runInBand --no-cache`). Corridas previas de portal también registran esa spec en PASS; por ejemplo `%TEMP%\k4a-portal-tests.log` reporta 340/340 suites. El código usa un typeahead con debounce por defecto de 300 ms (`apps/portal/src/components/shared/SearchablePicker.tsx:127-128,441-449`), por lo que la hipótesis es sensibilidad temporal bajo carga de la suite; es una inferencia, no una causa demostrada.

`TaskIntakeClient.tsx`, su spec y `OperationsUserPicker.tsx` no tienen diff local; ambos archivos TaskIntake y el picker constan en `git log` bajo `5704e8df feat(mod11): bandeja de OT de ejecucion y sub-rutas de Operaciones`. No se encontró cambio MOD05/DT-3 que provoque el fallo. Siguiente paso: derivarlo a `sr-qa`/responsable de MOD11 para estabilizar la sincronización del typeahead, sin cambiar la expectativa de elegir la persona.

Conteo de triage: flaky 1; regresión 0; datos/fecha 0; entorno 0.

## C4a-R — Restauración B1 por archivo completo (2026-11-01)

**Estado: PASS; 9/9 archivos restaurados y verificados.** Docker mostró `iwana_postgres_dev` healthy, TCP a `127.0.0.1:5433` respondió `True`, el índice estaba vacío y `git stash list` no tenía entradas. Copié seis archivos de producción desde `mixed/`, dos specs desde `mixed-specs/` y `subscribers.service.ts` desde `resolved-c4a/`, sin `git apply`. Los snapshots se conservaron.

| Ruta                                                                                | SHA-256 final                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/api/src/modules/crm/contracts/contracts.service.ts`                           | `76920ADB09BF645D85A0818E01E40E332C4CB5E9E4D4B1975818D82EF03387AC` |
| `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts`   | `F2107D8085D489829D83C6B3FD73C813B660A3FA0DE0868425F63952DD95191E` |
| `apps/api/src/modules/crm/subscribers/subscriber-lifecycle.service.ts`              | `AEDEF9BF6E312443E264EC5F87F6BA8D86B222B1471F3702D6DDA1E842CFCB20` |
| `apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts`            | `0DC49E3CA0355A5BF2169E32A43A6C45FA3207705896367537A697274A3C7829` |
| `apps/api/src/modules/crm/subscribers/subscriber-tax.controller.ts`                 | `5C21832A5C1B72C0356F415AA206ACF1A8A2FA1F7A7953E386C444C47F8D92E8` |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts`                       | `CD2D946637125919D657185002A167B4903D22E95E37F369AA0D000BFAC09167` |
| `packages/database/src/migrations/tenant/runner.ts`                                 | `175853E214DB32CD5BDC45D8560859E2D3DDD1534A966457BB4B058BA2D882E6` |
| `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts`                | `4B4309441E699216B7AF576CD4D3D4630D0E951739D77C374DCFAEFC7EA920B9` |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax.controller.http.spec.ts` | `D5C26895D14A0F12FA7446BC3B40B86C6B3004ABF106A73DB9BD94E67F523146` |

**Prettier:** `pnpm exec prettier --check` sobre los nueve archivos: `All matched files use Prettier code style!`

**Typecheck:** `pnpm exec turbo run typecheck --force --filter=@iwana/api --filter=@iwana/db --filter=@iwana/shared`: 4 tareas exitosas/4, 0 cacheadas (incluye `@iwana/storage` como dependencia). API, DB y shared terminaron sin errores.

**Suites unitarias sin caché de Jest:**

| Paquete | Comando                                         | Suites                               | Tests                                   |
| ------- | ----------------------------------------------- | ------------------------------------ | --------------------------------------- |
| API     | `pnpm --filter @iwana/api exec jest --no-cache` | 443 aprobadas, 4 omitidas, 447 total | 5955 aprobados, 15 omitidos, 5970 total |
| DB      | `pnpm --filter @iwana/db exec jest --no-cache`  | 77 aprobadas, 77 total               | 423 aprobados, 423 total                |

Las cuatro suites API omitidas tienen guardas explícitas para bases reales: `tenant-migrations-second-schema.spec.ts` requiere `TENANT_MIGRATIONS_REAL_DB=1`; `asset-loan.transactional.ev1.spec.ts`, `stock-reservations.transactional.ev1.spec.ts` y `useful-life-alerts.parity.ev1.spec.ts` requieren `EV1_REAL_DB=1`. No son fallos de estas suites unitarias. Ambos comandos Jest terminaron con exit 0. Logs completos: `%TEMP%\mod05-c4ar-api-unit-2026-11-01.log` y `%TEMP%\mod05-c4ar-db-unit-2026-11-01.log`.

Sin stash, `git add` ni commit; índice final vacío.

## Causa raíz del bloqueo de C4a y verificación de la fusión (AI-EM-ARCH, 2026-11-01)

**Causa raíz.** El snapshot limpio de `subscribers.service.ts` que generó C1a no estaba normalizado con Prettier: su hash es `1DA18E…` y, una vez formateado, `B18721…`. El cierre del boundary en C1b reformateó el archivo, y la asignación de `birthDate` pasó de dos líneas a una. Con eso, el contexto del patch B1 dejó de coincidir. Los otros 8 archivos del árbol siguen idénticos a su snapshot limpio (hashes del manifest) y sus originales `mixed/` pasan Prettier.

**Corrección.** Se normalizaron con Prettier las tres versiones (base, B1 y árbol) y se hizo una fusión a tres bandas con `git merge-file`. Hubo un solo conflicto, en los imports: queda `CrmQuoteReadPort`, se añade `titularAnonymizedConflict` y sale `Quote`. El resultado está en `%TEMP%\iwana-mod05-separate-snapshots-2026-11-01\resolved-c4a\`, con SHA-256 `cd2d9466…`.

**Verificación independiente** (`sr-backend`, solo lectura): **CORRECTO**.

- `diff mixed → resuelto` contiene solo los 4 hunks del boundary.
- `diff árbol → resuelto` coincide byte a byte con `diff base → mixed`: 22 hunks y 363 líneas.
- Ningún hunk B1 usa `Quote` ni `FindOptionsWhere`, y todos los símbolos existen.
- En las 4 escrituras de B1, el bloqueo `pessimistic_write` y el chequeo de `anonymizedAt` quedan en la misma transacción que la escritura.
- Typecheck aislado de la API con el resuelto: 0 errores.

C4a se sustituye por **C4a-R**: restauración por archivo completo, verificada por hash, sin patches.

B1-F (2026-11-01): para C4d y C4e, el hash de referencia de `apps/api/src/modules/crm/contracts/contracts.service.ts` es `21D44C5467AEC76D3ED9DDE32C5B4D356704F0B81DC733676B79993E71BD1205`, no el de `mixed/`.

B1-G (2026-11-01): sustituye la referencia B1-F de `apps/api/src/modules/crm/contracts/contracts.service.ts` para C4d/C4e; SHA-256 antes `21D44C5467AEC76D3ED9DDE32C5B4D356704F0B81DC733676B79993E71BD1205`, después `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`. Solo se movieron las dos validaciones de ciclo detrás del bloqueo y comprobación del suscriptor. Unitarias focales: 4 suites/117 tests aprobados/0 omitidos; API `--force`: 443 suites/5964 tests aprobados, 4 suites/15 tests omitidos por guardas. Condición PG de no regresión **[BLOQUEO]**: 2 suites, 12 tests fallidos/25 aprobados/0 omitidos; detalle en §B1-G del informe DT-3. Sin stash ni commit.

## §C4d · Gates conjuntos sobre el árbol completo (cierre 2026-11-02)

**Veredicto actualizado: GO (2026-11-02), tras recuperar cobertura solo con pruebas y revisión con 0 hallazgos C.** Las ejecuciones del 2026-11-01 terminaron; se recogieron y verificaron sus resultados al continuar el 2026-11-02. La primera medición incumplía dos líneas base de ramas; su resultado histórico se conserva en el punto 5 y queda sustituido por la repetición documentada al final de esta sección. Los fallos históricos de integración documentados en B1-G quedaron resueltos por los ajustes de pruebas posteriores: la corrida C4d de las 13 suites PG está completa y aprobada.

SHA-256 inicial y final de `apps/api/src/modules/crm/contracts/contracts.service.ts`: ambos **`33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`**. Coinciden con la referencia B1-G.

### 1. Typecheck y lint

Los cuatro paquetes (`@iwana/shared`, `@iwana/db`, `@iwana/api`, `@iwana/portal`) terminaron typecheck y lint con salida 0, sin errores. Avisos de lint: shared 0, DB 5, API 7, portal 42. Evidencia completa: `%TEMP%/c4d-{shared,db,api,portal}-{typecheck,lint}.log`.

### 2. Suites completas sin caché

Ejecución mediante Turbo `test --force --no-cache` por paquete; todos los resúmenes registran 0 tareas cacheadas.

| Paquete | Suites aprobadas | Suites omitidas | Tests aprobados | Tests omitidos | Resultado                  |
| ------- | ---------------: | --------------: | --------------: | -------------: | -------------------------- |
| shared  |               28 |               0 |             278 |              0 | PASS                       |
| DB      |               77 |               0 |             423 |              0 | PASS                       |
| API     |              443 |               4 |            5964 |             15 | PASS con guardas opt-in    |
| portal  |              340 |               0 |            3435 |              1 | PASS con omisión explícita |

API omite las cuatro suites opt-in `tenant-migrations-second-schema.spec.ts` (`TENANT_MIGRATIONS_REAL_DB=1`) y las tres EV1 (`EV1_REAL_DB=1`), como en la corrida anterior. Portal omite `InventoryClient.spec.tsx:2244`, declarado `it.skip`. `TaskIntakeClient.spec.tsx` pasó en la suite completa; no fue necesario repetirlo aislado. Logs: `%TEMP%/c4d-{shared,db,api,portal}-unit.log`; listas previas en los correspondientes `-unit-list.log`.

### 3. Integraciones PostgreSQL reales

`IWANA_DB_INTEGRATION_AVAILABLE=true`, `DB_NAME=dbiw`, sin caché, con lista previa y JSON de cada suite. Solo `privacy-erasure-api` usa `DB_NAME=iwana_it_privacy_dt3_b3r2`. Todas terminaron; ninguna omitida.

| Suite                          | Aprobados | Fallidos | Omitidos |
| ------------------------------ | --------: | -------: | -------: |
| contracts.service              |        28 |        0 |        0 |
| contract-plan-change           |        47 |        0 |        0 |
| subscriber-lifecycle           |        11 |        0 |        0 |
| subscriber-360-quotes          |         1 |        0 |        0 |
| subscriber-birth-date          |         1 |        0 |        0 |
| migración 167                  |         1 |        0 |        0 |
| migración 168                  |         1 |        0 |        0 |
| migración 169                  |         1 |        0 |        0 |
| titular-anonymized-concurrency |        10 |        0 |        0 |
| titular-erasure-sql            |         3 |        0 |        0 |
| anonymize-titular              |         9 |        0 |        0 |
| responsibilities               |         2 |        0 |        0 |
| privacy-erasure-api            |         1 |        0 |        0 |
| **13 suites completas**        |   **116** |    **0** |    **0** |

Evidencia: `%TEMP%/c4d-pg-<archivo-spec>.{list.log,log,json}`. Los JSON certifican los conteos de esta tabla.

### 4. E2E del clúster y CA-RER-12

Worker de desarrollo observado activo antes de ejecutar: launcher de `@iwana/worker dev` y runtime de `apps/worker/dist/main`; tras recompilaciones el runtime seguía presente. Se usaron tenants sintéticos de las fixtures, nunca `tenant_iwana`.

Comando: `pnpm exec playwright test --config=e2e/playwright.portal.local.config.ts e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts e2e/tests/portal-contract-plan-change.spec.ts e2e/tests/portal-privacy-fase-1b-live.spec.ts --workers=1 --reporter=list`.

Primera corrida: 4 aprobados, 4 fallidos, 0 omitidos. Coincidió con recompilaciones Turbo de dependencias observadas por el servidor de desarrollo: respuestas 500 y `ECONNREFUSED 127.0.0.1:3000`. Se conserva el rojo inicial en `%TEMP%/c4d-e2e.log`. Tras terminar los builds, recuperar health 200 y comprobar worker, se repitió sin editar producto ni pruebas: **8/8 aprobados, 0 omitidos** en `%TEMP%/c4d-e2e-stable.log`: cambio de plan 3, Privacy fase 1b 4, ciclo de facturación 1. La prueba de cambio de plan usa API simulada; las otras suites usan API real.

### 5. Cobertura por servicio: NO-GO por regresión de ramas

Corrida sin caché de seis suites: unitarias de los tres servicios y PG de contratos, cambio de plan y ciclo de vida, con `collectCoverageFrom` de los tres servicios. **6 suites/306 tests aprobados, 0 omitidos**. Resumen total: statements 91,84 %, branches 83,81 %, functions 92,02 %, lines 93,58 %. Evidencia `%TEMP%/c4d-coverage.log` y `%TEMP%/c4d-coverage/coverage-summary.json`.

| Servicio                          | Statements |  Líneas | Funciones | Ramas actual | Base ramas | Veredicto          |
| --------------------------------- | ---------: | ------: | --------: | -----------: | ---------: | ------------------ |
| contracts.service.ts              |    90,25 % | 91,96 % |   95,65 % |      82,87 % |    82,82 % | PASS               |
| subscribers.service.ts            |    92,39 % | 94,02 % |   85,33 % |      84,88 % |    86,20 % | FAIL: -1,32 puntos |
| subscriber-tax-profile.service.ts |    96,20 % | 98,61 % |     100 % |      81,57 % |    82,89 % | FAIL: -1,32 puntos |

Todos superan 80 %, pero dos servicios incumplen la condición adicional de no bajar su línea base de ramas. Se reporta el gate rojo sin añadir pruebas ni cambiar umbrales.

### 6 y 7. Dependencias y auditorías documentales

- `pnpm audit --prod --audit-level critical`: salida 0; 0 críticas, 3 altas, 7 moderadas y 1 baja. PASS para el umbral solicitado; las 11 vulnerabilidades no críticas siguen presentes.
- `pnpm audit:adr-citations`: salida 0; 0 bloqueantes, 153 avisos, 88 ADR indexados.
- `pnpm audit:doc-locations`: salida 0; 0 bloqueantes, 3 avisos, 2186 archivos Markdown escaneados. Los avisos corresponden a informes históricos en `.playwright-mcp/`.

**Resultado inicial: NO-GO exclusivamente por la regresión de cobertura de ramas indicada en el punto 5; sustituido por el GO de la repetición siguiente.** Las omisiones explícitas de las suites completas se registran arriba; las 13 integraciones PG y los 8 E2E finales tienen 0 omisiones. Sin stash, staging ni commit. No se ejecutó C4e ni limpieza manual de esquemas.

### Repetición de cobertura autorizada, solo pruebas (2026-11-02)

Se añadieron nueve casos en dos specs existentes: cinco en `subscribers.service.spec.ts` (conteos vacíos, expediente ausente, identificadores inválidos y eliminación de titular inexistente o anonimizado) y cuatro en `subscriber-tax-profile.service.spec.ts` (titular anonimizado y tres tratamientos no IVA sin tasa de regla). Comprueban respuestas, errores y ausencia de efectos o valores persistidos; no cambian expectativas previas ni añaden omisiones. `test-change-reviewer` comparó los diffs incrementales con `%TEMP%/c4d-coverage-tests-before`: **0 hallazgos C**.

Se repitieron las mismas seis suites y los mismos tres servicios de la medición inicial, sin caché, con `IWANA_DB_INTEGRATION_AVAILABLE=true` y PostgreSQL real en `dbiw`: **6 suites y 315 tests aprobados, 0 fallidos, 0 omitidos**. Docker estaba detenido al retomar: se inició Docker Desktop y se comprobó PostgreSQL healthy antes de la medición final. La ejecución diagnóstica sin PostgreSQL no se usa como evidencia de cobertura.

| Servicio                          | Statements |  Líneas | Funciones |             Ramas | Base ramas | Veredicto |
| --------------------------------- | ---------: | ------: | --------: | ----------------: | ---------: | --------- |
| contracts.service.ts              |    90,25 % | 91,96 % |   95,65 % | 82,87 % (392/473) |    82,82 % | PASS      |
| subscribers.service.ts            |    93,94 % | 95,02 % |      92 % | 86,64 % (493/569) |    86,20 % | PASS      |
| subscriber-tax-profile.service.ts |    98,73 % | 98,61 % |     100 % |   89,47 % (68/76) |    82,89 % | PASS      |

Los denominadores de ramas son idénticos a los iniciales; se cubrieron 10 ramas adicionales de subscribers y 6 del perfil tributario. Total: statements 92,80 %, líneas 94,03 %, funciones 94,68 %, ramas 85,24 % (953/1118).

Evidencia: `%TEMP%/c4d-coverage-tests-final.log`, `%TEMP%/c4d-coverage-tests-final-list.log` y `%TEMP%/c4d-coverage-tests-final/{coverage-summary,coverage-final}.json`; diffs incrementales `%TEMP%/c4d-coverage-tests-{subscribers,tax}.diff`. No se repitieron los otros gates ya completados: el único cambio posterior fue añadir estas nueve pruebas, todas ejecutadas en la medición final.

Hashes productivos antes y después, idénticos:

- contracts: `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`.
- subscribers: `CD2D946637125919D657185002A167B4903D22E95E37F369AA0D000BFAC09167`.
- perfil tributario: `0DC49E3CA0355A5BF2169E32A43A6C45FA3207705896367537A697274A3C7829`.

**C4d actualizado a GO:** cobertura por servicio ≥80 %, ninguna regresión de ramas frente a las tres bases y revisión de pruebas con 0 C. Se conservan los avisos, vulnerabilidades no críticas y omisiones explícitas de los otros gates ya registrados. Sin cambios productivos, stash, staging ni commit; C4e no ejecutado.

## §C4e · Commits conjuntos (2026-11-02)

Estado inicial: C4d en GO y G0 del CTO aprobado en el plan DT-3 (2026-11-02). Rama main, índice inicialmente vacío. Sin stash, staging parcial ni push.

### 0. Limpieza autorizada

En dbiw se verificó el nombre exacto `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800`, distinto de `tenant_iwana`, y 0 referencias desde `public.tenants.schema_name`. Se repitió la guarda dentro de una transacción con bloqueo SHARE de public.tenants y se ejecutó DROP SCHEMA únicamente del nombre autorizado. Se eliminaron sus tres tablas (subscribers, contracts, audit_logs); comprobación posterior: 0 esquemas con ese nombre. Ningún otro esquema se incluyó en la limpieza.

### 1. Re-inventario completo antes del staging

Fuente: `git status --short --untracked-files=all`, 254 rutas individuales; los directorios sin seguimiento se expanden para permitir staging explícito por archivo. C1a se reutiliza como evidencia histórica, sustituyendo la antigua separación E7 por la consolidación conjunta. DT-3 de API entra en commit 2 y su migración 169 en commit 1. Gobernanza, checkpoint y otras iniciativas quedan fuera.

| Categoría |   Rutas |
| --------- | ------: |
| Commit 1  |      17 |
| Commit 2  |      82 |
| Commit 3  |      55 |
| Commit 4  |      33 |
| Commit 5  |      16 |
| D-CK-2    |      20 |
| Ajena     |      31 |
| Dudosa    |       0 |
| **Total** | **254** |

La spec de ciclo y el addendum U son v1.1. Commit 4 incluye los nueve launchers de consolidación v1.0–v1.8; commit 5 incluye los diez launchers DT-3 v1.0–v1.9 y sus tres informes. Se reclasifica la adaptación de privacy-channel-capture.portal.spec.tsx a commit 3: importa SubscriberForm y su único hunk abre el grupo RUT que U pliega; no añade un alcance de Privacy. Los cinco cambios de settings-priority siguen ajenos: el clúster usa su port propio ContractsTenantSettingsReadPort.

Dos specs requerían Prettier antes del staging: tenant-context-missing.filter.spec.ts y contracts-tenant-settings-read.adapter.spec.ts. Se normalizaron y se compararon sus AST TypeScript con las copias previas: idénticos, sin cambio semántico. Hash de contracts.service.ts intacto.

Para respetar la prohibición de stash, cada commit ejecuta hooks temporales fuera del repo mediante configuración solo de esa invocación: el mismo lint-staged con `--no-stash` y el mismo commitlint de Husky. No se omiten verificaciones ni se modifica la configuración del repositorio. Antes y después de cada commit se comparan hashes completos de sus archivos; toda modificación del hook bloquearía la secuencia.

| Estado inicial y ruta                                                                                                                                            | Destino  | Evidencia                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ` M .agents/skills/INDEX.md`                                                                                                                                     | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M .agents/skills/MANIFEST.json`                                                                                                                                | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M .claude/agents/gate-verifier.md`                                                                                                                             | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M .claude/hooks/guard-paths.mjs`                                                                                                                               | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M .claude/hooks/session-context.mjs`                                                                                                                           | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M .claude/settings.json`                                                                                                                                       | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M .codex/agents/gate-verifier.toml`                                                                                                                            | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M .opencode/agents/gate-verifier.md`                                                                                                                           | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M AGENTS.md`                                                                                                                                                   | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts`                                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/cli/anonymize-titular.spec.ts`                                                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/cli/anonymize-titular.ts`                                                                                                                       | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/common/filters/tenant-context-missing.filter.spec.ts`                                                                                           | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/common/filters/tenant-context-missing.filter.ts`                                                                                                | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/access-control/access-permission-catalog.invariant.spec.ts`                                                                             | Commit 2 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/api/src/modules/configuration/services/settings-priority-evaluator.spec.ts`                                                                             | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/api/src/modules/configuration/services/settings-priority.service.spec.ts`                                                                               | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/api/src/modules/crm/contracts/contracts.controller.ts`                                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/contracts.module.ts`                                                                                                      | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/contracts.service.ts`                                                                                                     | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/dto/contract-response.dto.ts`                                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/dto/create-contract-from-expediente.dto.ts`                                                                               | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/dto/create-contract.dto.ts`                                                                                               | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/dto/update-contract.dto.ts`                                                                                               | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/entities/contract.entity.ts`                                                                                              | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/guards/contracts-blocked-titular.guard.ts`                                                                                | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/guards/guard-blocked-titular.decorator.ts`                                                                                | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.controller.http.spec.ts`                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.controller.spec.ts`                                                                                       | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`                                                                     | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts`                                                                                          | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` D apps/api/src/modules/crm/expedientes/crm-quote-read.adapter.ts`                                                                                              | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/expedientes/expediente.service.ts`                                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/expedientes/expedientes.module.ts`                                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/expedientes/guards/expedientes-blocked-titular.guard.ts`                                                                            | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` D apps/api/src/modules/crm/expedientes/tests/crm-quote-read.adapter.spec.ts`                                                                                   | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`                                                                                       | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/ports/crm-quote-read.port.ts`                                                                                                       | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts`                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/privacy-adapters/crm-contract-standing-read.adapter.ts`                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts`                                                                              | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts`                                                                | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.ts`                                                                            | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/provisioning-readiness.ts`                                                                                                          | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/quotes/quotes.module.ts`                                                                                                            | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/responsibilities/responsibilities.service.ts`                                                                                       | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts`                                                                            | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts`                                                                    | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts`                                                                                          | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/guards/guard-blocked-titular.decorator.ts`                                                                              | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/guards/subscribers-blocked-titular.guard.ts`                                                                            | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscriber-enum-parity.postgres.integration.spec.ts`                                                                    | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscriber-lifecycle.service.ts`                                                                                        | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts`                                                                                | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts`                                                                                      | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscriber-tax.controller.ts`                                                                                           | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts`                                                                              | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscribers.controller.ts`                                                                                              | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscribers.module.ts`                                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/subscribers.service.ts`                                                                                                 | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-lifecycle.service.postgres.integration.spec.ts`                                                        | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-projection.spec.ts`                                                                                    | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts`                                                                     | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts`                                                                           | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/tests/subscriber-tax.controller.http.spec.ts`                                                                           | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/tests/subscribers.controller.spec.ts`                                                                                   | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`                                                                                      | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/tests/crm-blocked-mutations.arch.spec.ts`                                                                                           | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/crm/tests/crm-blocked-mutations.http.spec.ts`                                                                                           | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/privacy/requests/ports/contract-standing-read.port.ts`                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/privacy/requests/requests.service.ts`                                                                                                   | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.spec.ts`                                                                             | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.ts`                                                                                  | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.port.ts`                                                                                     | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/next-env.d.ts`                                                                                                                                   | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx`                                                                                            | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/ContractCard.tsx`                                                                                                 | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`                                                                                         | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx`                                                                            | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx`                                                                                         | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/ServiciosTab.tsx`                                                                                                 | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx`                                                               | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`                                                                                       | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberFiscalFields.tsx`                                                                                       | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberForm.tsx`                                                                                               | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx`                                                                                             | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberLifecycleDialog.portal.spec.tsx`                                                                        | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberPeek.spec.tsx`                                                                                          | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberSections.spec.tsx`                                                                                      | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberSections.tsx`                                                                                           | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx`                                                                                      | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscriberTechnicalServiceSection.tsx`                                                                            | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`                                                                                        | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/TaxProfileBlock.tsx`                                                                                              | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/contracts-dialogs.behavior.spec.tsx`                                                                              | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx`                                                                             | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx`                                                                            | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx`                                                                             | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/stratum-evidence-upload.portal.spec.tsx`                                                                          | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/subscriber-contact-pending.portal.spec.tsx`                                                                       | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/subscriber-ficha-ux-qw.portal.spec.tsx`                                                                           | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/subscriber-fiscal.ts`                                                                                             | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/subscriber-ui.spec.ts`                                                                                            | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/crm/subscribers/subscriber-ui.ts`                                                                                                 | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/components/privacy/privacy-channel-capture.portal.spec.tsx`                                                                                  | Commit 3 | Importa SubscriberForm (línea 15); el único hunk abre responsabilidades RUT plegadas por U. Adaptación de fixture necesaria por UI del clúster, no nueva funcionalidad de Privacy. |
| ` M apps/portal/src/components/shared/portal-ui.tsx`                                                                                                             | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/portal/src/lib/api-client.ts`                                                                                                                           | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M apps/web/next-env.d.ts`                                                                                                                                      | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md`                                                                                                  | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.0.md`                                                                                                   | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M docs/informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md`                                                                                                  | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`                                                                                                      | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`                                                                                                | Ajena    | Checkpoint transversal expresamente excluido por C4e y usuario.                                                                                                                    |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-plans-desktop.png`                                                                         | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-plans-mobile.png`                                                                          | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-products-desktop.png`                                                                      | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-products-mobile.png`                                                                       | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-summary-desktop.png`                                                                       | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-summary-mobile.png`                                                                        | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-tax-simulator-desktop.png`                                                                 | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-tax-simulator-mobile.png`                                                                  | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| ` M docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`                                                                                                  | Ajena    | Checkpoint transversal expresamente excluido por C4e y usuario.                                                                                                                    |
| ` M docs/roles/Perfil_IA_Verificador_Gates_v1.md`                                                                                                                | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`                                                                                                         | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md`                                                                                                         | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M e2e/tests/portal-privacy-fase-1b-live.spec.ts`                                                                                                               | Commit 3 | Fixtures DT-3 y regresiÃƒÂ³n E2E del ÃƒÂ¡rbol conjunto.                                                                                                                            |
| ` M e2e/tests/portal-privacy-live.spec.ts`                                                                                                                       | Commit 3 | Fixtures DT-3 y regresiÃƒÂ³n E2E del ÃƒÂ¡rbol conjunto.                                                                                                                            |
| ` M packages/database/src/migrations/tenant/runner.ts`                                                                                                           | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M packages/shared/src/calendar/index.ts`                                                                                                                       | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M packages/shared/src/index.ts`                                                                                                                                | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M packages/shared/src/schemas/contract.schema.spec.ts`                                                                                                         | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M packages/shared/src/schemas/contract.schema.ts`                                                                                                              | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| ` M scripts/claude-hooks.test.mjs`                                                                                                                               | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? .agents/skills/iwana-checkpoint-commit/SKILL.md`                                                                                                             | Ajena    | Ruta bajo entrada explÃƒÂ­cita de C1a.                                                                                                                                             |
| `?? .claude/agents/test-change-reviewer.md`                                                                                                                      | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? .claude/hooks/post-push-ci.mjs`                                                                                                                              | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? .claude/launch.json`                                                                                                                                         | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? .claude/skills/iwana-checkpoint-commit/SKILL.md`                                                                                                             | Ajena    | Ruta bajo entrada explÃƒÂ­cita de C1a.                                                                                                                                             |
| `?? .codex/agents/test-change-reviewer.toml`                                                                                                                     | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? .opencode/agents/test-change-reviewer.md`                                                                                                                    | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? .tmp-plan-change-tests.json`                                                                                                                                 | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? apps/api/src/modules/crm/contracts/billing-cycle-date.util.spec.ts`                                                                                          | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/billing-cycle-date.util.ts`                                                                                               | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/billing-cycles.controller.spec.ts`                                                                                        | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/billing-cycles.controller.ts`                                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/billing-cycles.swagger.spec.ts`                                                                                           | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.adapter.spec.ts`                                                                     | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.adapter.ts`                                                                          | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.port.ts`                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/tests/billing-cycles.controller.http.spec.ts`                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/tests/contract-plan-change.postgres.integration.spec.ts`                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/contracts/tests/contract-plan-change.service.spec.ts`                                                                               | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.postgres.integration.spec.ts`                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/quotes/crm-quote-read.adapter.ts`                                                                                                   | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/quotes/tests/crm-quote-read.adapter.spec.ts`                                                                                        | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.postgres.integration.spec.ts`                                                       | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/subscribers/guards/titular-anonymized-conflict.ts`                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts`                                                                     | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/subscribers/subscriber-birth-date.postgres.integration.spec.ts`                                                                     | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/subscribers/tests/subscriber-360.contract.spec.ts`                                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/subscribers/tests/subscriber-tax-confirm.postgres.integration.spec.ts`                                                              | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/subscribers/tests/subscriber-tax.security.http.spec.ts`                                                                             | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts`                                                                  | Commit 2 | MOD05/DT-3 conjunto; escritores, puertos y pruebas incluidos por C4e.                                                                                                              |
| `?? apps/portal/src/app/dashboard/crm/subscribers/agenda-corte/page.tsx`                                                                                         | Commit 3 | Ruta bajo entrada explÃƒÂ­cita de C1a.                                                                                                                                             |
| `?? apps/portal/src/components/crm/subscribers/ActivateServiceDialog.tsx`                                                                                        | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/BillingCycleField.tsx`                                                                                            | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.spec.tsx`                                                                                | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.tsx`                                                                                     | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/CutoffAgendaClient.portal.spec.tsx`                                                                               | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/CutoffAgendaClient.tsx`                                                                                           | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/LocationPreviewMap.tsx`                                                                                           | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/ServiciosTab.filtros.spec.tsx`                                                                                    | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/ServiciosTab.interes-comercial.spec.tsx`                                                                          | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/SubscriberFiscalFields.spec.tsx`                                                                                  | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/SubscriberFiscalSection.tsx`                                                                                      | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.spec.tsx`                                                                                   | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.tsx`                                                                                        | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx`                                                                             | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/billing-cycle-ui.ts`                                                                                              | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/tributario-ux.portal.spec.tsx`                                                                                    | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/use-billing-cycles.ts`                                                                                            | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? apps/portal/src/components/crm/subscribers/use-contract-plan.ts`                                                                                             | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.0.md`                                                                                               | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.1.md`                                                                                               | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md`                                                                                               | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-MOD05-CAMBIO-PLAN-DISENO-v1.0.md`                                                                                                      | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-MOD05-CICLO-FACTURACION-GUARDADO-v1.0.md`                                                                                              | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-OLA1-v1.0.md`                                                                                              | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`                                                                                                   | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/informes/INFORME-PRIVACY-DT3-B1R-CONTRATOS-v1.0.md`                                                                                                     | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/informes/INFORME-PRIVACY-DT3-B1R-EXPEDIENTES-v1.0.md`                                                                                                   | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/informes/INFORME-PRIVACY-DT3-B1R-v1.0.md`                                                                                                               | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/error-context.md`       | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/test-failed-1.png`      | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run2/.last-run.json`                                                                                     | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run2/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/error-context.md`  | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run2/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/test-failed-1.png` | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run3/.last-run.json`                                                                                     | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run3/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/error-context.md`  | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run3/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/test-failed-1.png` | D-CK-2   | ExclusiÃƒÂ³n literal de Ola 3/C4e.                                                                                                                                                 |
| `?? docs/plans/2026-10-30-mod05-cambio-plan-contrato.md`                                                                                                         | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/plans/2026-10-30-mod05-ciclo-facturacion.md`                                                                                                            | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/plans/2026-10-31-mod05-consolidacion-cluster.md`                                                                                                        | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md`                                                                                                       | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.0.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.1.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.2.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.4.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.5.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.6.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.7.md`                                                                                                  | Commit 4 | Launchers D de ciclo, ampliaciÃƒÂ³n documental del mismo alcance.                                                                                                                  |
| `?? docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`                                                                                                         | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.0.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.1.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.2.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.3.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.4.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.5.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.6.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.7.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.8.md`                                                                                              | Commit 4 | Launchers de consolidaciÃƒÂ³n v1.0Ã¢â‚¬â€œv1.8 autorizados.                                                                                                                        |
| `?? docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`                                                                                                     | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/prompts/PROMPT-MOD05-SUBSCRIBERS-360-COTIZACIONES-REVISION-v1.0.md`                                                                                     | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.0.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.1.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.2.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.3.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.4.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.5.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.6.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.7.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.8.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.9.md`                                                                                                          | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md`                                                                                                                 | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-LAUNCH-v1.6.md`                                                                                           | Ajena    | Checkpoint transversal expresamente excluido por C4e y usuario.                                                                                                                    |
| `?? docs/roles/Perfil_IA_Revisor_Cambios_Pruebas_v1.md`                                                                                                          | Ajena    | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/specs/2026-10-30-mod05-cambio-plan-contrato-ux.md`                                                                                                      | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/specs/2026-10-31-mod05-ficha-suscriptor-addendum-u.md`                                                                                                  | Commit 4 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md`                                                                                    | Commit 5 | DocumentaciÃƒÂ³n DT-3 autorizada; spec v1.2, plan, prompt, launchers e informes.                                                                                                   |
| `?? e2e/tests/portal-contract-plan-change.spec.ts`                                                                                                               | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts`                                                                                                         | Commit 3 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/database/src/migrations/tenant/167_crm_billing_cycles.integration.spec.ts`                                                                          | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/database/src/migrations/tenant/167_crm_billing_cycles.ts`                                                                                           | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/database/src/migrations/tenant/168_crm_contract_alias_readable.integration.spec.ts`                                                                 | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/database/src/migrations/tenant/168_crm_contract_alias_readable.ts`                                                                                  | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations.integration.spec.ts`                                                            | Commit 1 | DT-3: migraciÃƒÂ³n 169 y prueba PG.                                                                                                                                                |
| `?? packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations.ts`                                                                             | Commit 1 | DT-3: migraciÃƒÂ³n 169 y prueba PG.                                                                                                                                                |
| `?? packages/shared/src/calendar/billing-cutoff.spec.ts`                                                                                                         | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/shared/src/calendar/billing-cutoff.ts`                                                                                                              | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/shared/src/contracts/crm/index.ts`                                                                                                                  | Commit 1 | Ruta bajo entrada explÃƒÂ­cita de C1a.                                                                                                                                             |
| `?? packages/shared/src/contracts/crm/subscriber-360.ts`                                                                                                         | Commit 1 | Ruta bajo entrada explÃƒÂ­cita de C1a.                                                                                                                                             |
| `?? packages/shared/src/schemas/billing-cycle.schema.spec.ts`                                                                                                    | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |
| `?? packages/shared/src/schemas/billing-cycle.schema.ts`                                                                                                         | Commit 1 | ClasificaciÃƒÂ³n C1a conservada.                                                                                                                                                   |

### 2. Ejecución y recibos de commits

Los recibos siguientes registran SHA, comprobación índice = árbol, ausencia de cambios por lint-staged y rutas completas. El informe se actualizará después del quinto commit; esa actualización final del ledger quedará local, porque un commit no puede incorporar su propio SHA.

#### Commit 1: `78d3e4fbdc96b89a9adc4918656fbdd7931ed853`

feat(db,shared): billing cycles, plan change, 360 contracts and anonymized-titular guard (169)

17 rutas completas; índice = árbol antes del commit; paths del commit iguales a la lista prevista. Lint-staged con --no-stash y commitlint ejecutados; SHA-256 de todos sus archivos idénticos antes/después. Contracts conserva `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`.

- `packages/database/src/migrations/tenant/167_crm_billing_cycles.integration.spec.ts`
- `packages/database/src/migrations/tenant/167_crm_billing_cycles.ts`
- `packages/database/src/migrations/tenant/168_crm_contract_alias_readable.integration.spec.ts`
- `packages/database/src/migrations/tenant/168_crm_contract_alias_readable.ts`
- `packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations.integration.spec.ts`
- `packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations.ts`
- `packages/database/src/migrations/tenant/runner.ts`
- `packages/shared/src/calendar/billing-cutoff.spec.ts`
- `packages/shared/src/calendar/billing-cutoff.ts`
- `packages/shared/src/calendar/index.ts`
- `packages/shared/src/contracts/crm/index.ts`
- `packages/shared/src/contracts/crm/subscriber-360.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas/billing-cycle.schema.spec.ts`
- `packages/shared/src/schemas/billing-cycle.schema.ts`
- `packages/shared/src/schemas/contract.schema.spec.ts`
- `packages/shared/src/schemas/contract.schema.ts`

#### Commit 2: `4cfeed5fc23c0fa34a05d8df034f3f4484035854`

feat(api): mod05 cluster and dt-3 anonymized-titular mutations

82 rutas completas; índice = árbol antes del commit; paths del commit iguales a la lista prevista. Lint-staged con --no-stash y commitlint ejecutados; SHA-256 de todos sus archivos idénticos antes/después. Contracts conserva `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`.

- `apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts`
- `apps/api/src/cli/anonymize-titular.spec.ts`
- `apps/api/src/cli/anonymize-titular.ts`
- `apps/api/src/common/filters/tenant-context-missing.filter.spec.ts`
- `apps/api/src/common/filters/tenant-context-missing.filter.ts`
- `apps/api/src/modules/access-control/access-permission-catalog.invariant.spec.ts`
- `apps/api/src/modules/crm/contracts/billing-cycle-date.util.spec.ts`
- `apps/api/src/modules/crm/contracts/billing-cycle-date.util.ts`
- `apps/api/src/modules/crm/contracts/billing-cycles.controller.spec.ts`
- `apps/api/src/modules/crm/contracts/billing-cycles.controller.ts`
- `apps/api/src/modules/crm/contracts/billing-cycles.swagger.spec.ts`
- `apps/api/src/modules/crm/contracts/contracts.controller.ts`
- `apps/api/src/modules/crm/contracts/contracts.module.ts`
- `apps/api/src/modules/crm/contracts/contracts.service.ts`
- `apps/api/src/modules/crm/contracts/dto/contract-response.dto.ts`
- `apps/api/src/modules/crm/contracts/dto/create-contract-from-expediente.dto.ts`
- `apps/api/src/modules/crm/contracts/dto/create-contract.dto.ts`
- `apps/api/src/modules/crm/contracts/dto/update-contract.dto.ts`
- `apps/api/src/modules/crm/contracts/entities/contract.entity.ts`
- `apps/api/src/modules/crm/contracts/guards/contracts-blocked-titular.guard.ts`
- `apps/api/src/modules/crm/contracts/guards/guard-blocked-titular.decorator.ts`
- `apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.adapter.spec.ts`
- `apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.adapter.ts`
- `apps/api/src/modules/crm/contracts/ports/contracts-tenant-settings-read.port.ts`
- `apps/api/src/modules/crm/contracts/tests/billing-cycles.controller.http.spec.ts`
- `apps/api/src/modules/crm/contracts/tests/contract-plan-change.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/contracts/tests/contract-plan-change.service.spec.ts`
- `apps/api/src/modules/crm/contracts/tests/contracts.controller.http.spec.ts`
- `apps/api/src/modules/crm/contracts/tests/contracts.controller.spec.ts`
- `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts`
- `apps/api/src/modules/crm/expedientes/crm-quote-read.adapter.ts`
- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- `apps/api/src/modules/crm/expedientes/expedientes.module.ts`
- `apps/api/src/modules/crm/expedientes/guards/expedientes-blocked-titular.guard.ts`
- `apps/api/src/modules/crm/expedientes/tests/crm-quote-read.adapter.spec.ts`
- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- `apps/api/src/modules/crm/ports/crm-quote-read.port.ts`
- `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts`
- `apps/api/src/modules/crm/privacy-adapters/crm-contract-standing-read.adapter.ts`
- `apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts`
- `apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts`
- `apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.ts`
- `apps/api/src/modules/crm/provisioning-readiness.ts`
- `apps/api/src/modules/crm/quotes/crm-quote-read.adapter.ts`
- `apps/api/src/modules/crm/quotes/quotes.module.ts`
- `apps/api/src/modules/crm/quotes/tests/crm-quote-read.adapter.spec.ts`
- `apps/api/src/modules/crm/responsibilities/responsibilities.service.ts`
- `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts`
- `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts`
- `apps/api/src/modules/crm/subscribers/guards/guard-blocked-titular.decorator.ts`
- `apps/api/src/modules/crm/subscribers/guards/subscribers-blocked-titular.guard.ts`
- `apps/api/src/modules/crm/subscribers/guards/titular-anonymized-conflict.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-birth-date.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-enum-parity.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-lifecycle.service.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-tax.controller.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.controller.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.module.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-360.contract.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-lifecycle.service.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-projection.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-confirm.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-tax.controller.http.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-tax.security.http.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscribers.controller.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`
- `apps/api/src/modules/crm/tests/crm-blocked-mutations.arch.spec.ts`
- `apps/api/src/modules/crm/tests/crm-blocked-mutations.http.spec.ts`
- `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts`
- `apps/api/src/modules/privacy/requests/ports/contract-standing-read.port.ts`
- `apps/api/src/modules/privacy/requests/requests.service.ts`

#### Commit 3: `0175aca22658317bf9875055b4d870d09448a932`

feat(portal): mod05 subscriber sheet, billing cycle and plan change

55 rutas completas; índice = árbol antes del commit; paths del commit iguales a la lista prevista. Lint-staged con --no-stash y commitlint ejecutados; SHA-256 de todos sus archivos idénticos antes/después. Contracts conserva `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`.

- `apps/portal/src/app/dashboard/crm/subscribers/agenda-corte/page.tsx`
- `apps/portal/src/components/crm/subscribers/ActivateServiceDialog.tsx`
- `apps/portal/src/components/crm/subscribers/BillingCycleField.tsx`
- `apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.spec.tsx`
- `apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.tsx`
- `apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx`
- `apps/portal/src/components/crm/subscribers/ContractCard.tsx`
- `apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`
- `apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/CutoffAgendaClient.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/CutoffAgendaClient.tsx`
- `apps/portal/src/components/crm/subscribers/LocationPreviewMap.tsx`
- `apps/portal/src/components/crm/subscribers/ServiciosTab.filtros.spec.tsx`
- `apps/portal/src/components/crm/subscribers/ServiciosTab.interes-comercial.spec.tsx`
- `apps/portal/src/components/crm/subscribers/ServiciosTab.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberFiscalFields.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberFiscalFields.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberFiscalSection.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberForm.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberLifecycleDialog.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberPeek.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberSections.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberSections.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberTechnicalServiceSection.tsx`
- `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`
- `apps/portal/src/components/crm/subscribers/TaxProfileBlock.tsx`
- `apps/portal/src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/billing-cycle-ui.ts`
- `apps/portal/src/components/crm/subscribers/contracts-dialogs.behavior.spec.tsx`
- `apps/portal/src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx`
- `apps/portal/src/components/crm/subscribers/stratum-evidence-upload.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/subscriber-contact-pending.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/subscriber-ficha-ux-qw.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/subscriber-fiscal.ts`
- `apps/portal/src/components/crm/subscribers/subscriber-ui.spec.ts`
- `apps/portal/src/components/crm/subscribers/subscriber-ui.ts`
- `apps/portal/src/components/crm/subscribers/tributario-ux.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/use-billing-cycles.ts`
- `apps/portal/src/components/crm/subscribers/use-contract-plan.ts`
- `apps/portal/src/components/privacy/privacy-channel-capture.portal.spec.tsx`
- `apps/portal/src/components/shared/portal-ui.tsx`
- `apps/portal/src/lib/api-client.ts`
- `e2e/tests/portal-contract-plan-change.spec.ts`
- `e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts`
- `e2e/tests/portal-privacy-fase-1b-live.spec.ts`
- `e2e/tests/portal-privacy-live.spec.ts`

#### Commit 4: `a8324a8491ca240749ece101414f29cd655573bc`

docs(mod05): consolidate D, E, F and U

33 rutas completas; índice = árbol antes del commit; paths del commit iguales a la lista prevista. Lint-staged con --no-stash y commitlint ejecutados; SHA-256 de todos sus archivos idénticos antes/después. Contracts conserva `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`.

- `docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.0.md`
- `docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.1.md`
- `docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md`
- `docs/informes/INFORME-MOD05-CAMBIO-PLAN-DISENO-v1.0.md`
- `docs/informes/INFORME-MOD05-CICLO-FACTURACION-GUARDADO-v1.0.md`
- `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-OLA1-v1.0.md`
- `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`
- `docs/plans/2026-10-30-mod05-cambio-plan-contrato.md`
- `docs/plans/2026-10-30-mod05-ciclo-facturacion.md`
- `docs/plans/2026-10-31-mod05-consolidacion-cluster.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.0.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.1.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.2.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.4.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.5.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.6.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.7.md`
- `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.0.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.1.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.2.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.3.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.4.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.5.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.6.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.7.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.8.md`
- `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`
- `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-360-COTIZACIONES-REVISION-v1.0.md`
- `docs/specs/2026-10-30-mod05-cambio-plan-contrato-ux.md`
- `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md`
- `docs/specs/2026-10-31-mod05-ficha-suscriptor-addendum-u.md`

#### Commit 5: `ee7f89f398d0105e038e4cb1ab2d9018927eb6db`

docs(privacy): dt-3 anonymized-titular mutations

16 rutas completas; índice = árbol antes del commit; paths del commit iguales a la lista prevista. Lint-staged con --no-stash y commitlint ejecutados; SHA-256 de todos sus archivos idénticos antes/después. Contracts conserva `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`.

- `docs/informes/INFORME-PRIVACY-DT3-B1R-CONTRATOS-v1.0.md`
- `docs/informes/INFORME-PRIVACY-DT3-B1R-EXPEDIENTES-v1.0.md`
- `docs/informes/INFORME-PRIVACY-DT3-B1R-v1.0.md`
- `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.0.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.1.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.2.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.3.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.4.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.5.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.6.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.7.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.8.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.9.md`
- `docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md`
- `docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md`

### 3. Cierre C4e y estado local final

**C4e completado: cinco commits locales verificados, sin push.** La limpieza autorizada quedó ejecutada y las 254 rutas iniciales clasificadas, sin dudosas. Los 203 destinos de commit se verificaron por archivo completo (las dos reubicaciones del adaptador Quotes cuentan como rutas de origen y destino).

| Commit | SHA                                        | Rutas previstas/verificadas |
| ------ | ------------------------------------------ | --------------------------: |
| 1      | `78d3e4fbdc96b89a9adc4918656fbdd7931ed853` |                          17 |
| 2      | `4cfeed5fc23c0fa34a05d8df034f3f4484035854` |                          82 |
| 3      | `0175aca22658317bf9875055b4d870d09448a932` |                          55 |
| 4      | `a8324a8491ca240749ece101414f29cd655573bc` |                          33 |
| 5      | `ee7f89f398d0105e038e4cb1ab2d9018927eb6db` |                          16 |

El commit 2 declara expresamente MOD05 D/E/F/U/K1–K4 y DT-3 B1–B3-H2 y lista los archivos mezclados. El primer intento de su mensaje fue rechazado por commitlint por capitalización y longitud; se corrigió solo el mensaje y se repitieron ambos hooks sin cambios de contenido. Los asuntos usan minúsculas para cumplir commitlint.

Antes de cada commit: lista del índice exacta, índice = árbol en sus rutas y SHA de contracts `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`. Después: rutas del commit iguales a las previstas y hashes completos idénticos antes/después del hook. Hooks de código: eslint --fix y prettier --write terminaron sin alterar contenido; los commits documentales no tenían tareas coincidentes de lint-staged, y commitlint sí se ejecutó. La validación adicional de whitespace de documentos conserva los saltos Markdown intencionales de dos espacios. Configuración permanente de hooks intacta: `.husky/_`. Stash list idéntica a la inicial. Índice final vacío.

Auditorías documentales repetidas antes del checkpoint: citas ADR 0 bloqueantes/153 avisos; ubicaciones 0 bloqueantes/3 avisos (2187 Markdown escaneados). Evidencia de todos los pasos, listas, mensajes y hashes: `%TEMP%/iwana-c4e/` (`inventory.json`, `commit-N-before.json`, `commit-N-paths.txt`, `commit-N-message.txt`, `commit-N.log`, `commit-N-receipt.json`).

**Sin commitear: 52 rutas = 20 D-CK-2 + 31 ajenas + esta actualización final del informe.** Los recibos de los commits 4 y 5 y este cierre permanecen locales en el informe; el commit 4 contiene el inventario y los recibos 1–3. No se añade un sexto commit.

| Estado final y ruta                                                                                                                                              | Motivo para permanecer local    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| ` M .agents/skills/INDEX.md`                                                                                                                                     | Ajena                           |
| ` M .agents/skills/MANIFEST.json`                                                                                                                                | Ajena                           |
| ` M .claude/agents/gate-verifier.md`                                                                                                                             | Ajena                           |
| ` M .claude/hooks/guard-paths.mjs`                                                                                                                               | Ajena                           |
| ` M .claude/hooks/session-context.mjs`                                                                                                                           | Ajena                           |
| ` M .claude/settings.json`                                                                                                                                       | Ajena                           |
| ` M .codex/agents/gate-verifier.toml`                                                                                                                            | Ajena                           |
| ` M .opencode/agents/gate-verifier.md`                                                                                                                           | Ajena                           |
| ` M AGENTS.md`                                                                                                                                                   | Ajena                           |
| ` M apps/api/src/modules/configuration/services/settings-priority-evaluator.spec.ts`                                                                             | Ajena                           |
| ` M apps/api/src/modules/configuration/services/settings-priority.service.spec.ts`                                                                               | Ajena                           |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.spec.ts`                                                                             | Ajena                           |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.ts`                                                                                  | Ajena                           |
| ` M apps/api/src/modules/tenant/ports/settings-priority-tenant-read.port.ts`                                                                                     | Ajena                           |
| ` M apps/portal/next-env.d.ts`                                                                                                                                   | D-CK-2                          |
| ` M apps/web/next-env.d.ts`                                                                                                                                      | D-CK-2                          |
| ` M docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md`                                                                                                  | Ajena                           |
| ` M docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`                                                                                                   | Actualización final del informe |
| ` M docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.0.md`                                                                                                   | Ajena                           |
| ` M docs/informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md`                                                                                                  | Ajena                           |
| ` M docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`                                                                                                      | Ajena                           |
| ` M docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`                                                                                                | Ajena                           |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-plans-desktop.png`                                                                         | D-CK-2                          |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-plans-mobile.png`                                                                          | D-CK-2                          |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-products-desktop.png`                                                                      | D-CK-2                          |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-products-mobile.png`                                                                       | D-CK-2                          |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-summary-desktop.png`                                                                       | D-CK-2                          |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-summary-mobile.png`                                                                        | D-CK-2                          |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-tax-simulator-desktop.png`                                                                 | D-CK-2                          |
| ` M docs/informes/evidence/portal-commercial-ui-2026-07-11/commercial-tax-simulator-mobile.png`                                                                  | D-CK-2                          |
| ` M docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`                                                                                                  | Ajena                           |
| ` M docs/roles/Perfil_IA_Verificador_Gates_v1.md`                                                                                                                | Ajena                           |
| ` M docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`                                                                                                         | Ajena                           |
| ` M scripts/claude-hooks.test.mjs`                                                                                                                               | Ajena                           |
| `?? .agents/skills/iwana-checkpoint-commit/SKILL.md`                                                                                                             | Ajena                           |
| `?? .claude/agents/test-change-reviewer.md`                                                                                                                      | Ajena                           |
| `?? .claude/hooks/post-push-ci.mjs`                                                                                                                              | Ajena                           |
| `?? .claude/launch.json`                                                                                                                                         | D-CK-2                          |
| `?? .claude/skills/iwana-checkpoint-commit/SKILL.md`                                                                                                             | Ajena                           |
| `?? .codex/agents/test-change-reviewer.toml`                                                                                                                     | Ajena                           |
| `?? .opencode/agents/test-change-reviewer.md`                                                                                                                    | Ajena                           |
| `?? .tmp-plan-change-tests.json`                                                                                                                                 | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/error-context.md`       | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/test-failed-1.png`      | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run2/.last-run.json`                                                                                     | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run2/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/error-context.md`  | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run2/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/test-failed-1.png` | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run3/.last-run.json`                                                                                     | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run3/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/error-context.md`  | D-CK-2                          |
| `?? docs/informes/evidence/mod05-plan-change-2026-10-30/run3/portal-contract-plan-chang-bb388-actualiza-detalle-y-tarjeta-google-chrome-local/test-failed-1.png` | D-CK-2                          |
| `?? docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-LAUNCH-v1.6.md`                                                                                           | Ajena                           |
| `?? docs/roles/Perfil_IA_Revisor_Cambios_Pruebas_v1.md`                                                                                                          | Ajena                           |

SHA-256 final de contracts.service.ts: `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`. Sin stash, staging parcial, push ni cambios de producción durante C4e.

### 4. C4f — Dependencia timezone y verificación de `HEAD` aislado (2026-11-02)

**Commit 6:** `5023128448abd9c25a72848d4949e59d6d126b1c` (`fix(api): expose tenant timezone through settings-priority port`). Antes del commit, el índice coincidió con el árbol de trabajo en las cinco rutas; el diff de esos archivos fue exclusivamente la propiedad `timezone` y sus fixtures. Se confirmaron las rutas del commit contra la lista aprobada. `lint-staged --no-stash` y `commitlint` terminaron correctamente y no cambiaron contenido.

Rutas completas de commit 6:

- `apps/api/src/modules/tenant/ports/settings-priority-tenant-read.port.ts`
- `apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.ts`
- `apps/api/src/modules/tenant/ports/settings-priority-tenant-read.adapter.spec.ts`
- `apps/api/src/modules/configuration/services/settings-priority-evaluator.spec.ts`
- `apps/api/src/modules/configuration/services/settings-priority.service.spec.ts`

El SHA-256 de `apps/api/src/modules/crm/contracts/contracts.service.ts` se mantuvo en `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`.

**Exportación limpia de `HEAD`:** `git archive HEAD` produjo `%TEMP%/iwana-c4f-head-20261102.tar` y se extrajo en `%TEMP%/iwana-c4f-head-20261102`. Los 5.994 archivos del archivo coinciden con los 5.994 destinos de `git ls-tree -r HEAD`; el directorio exportado no contiene `.git`. `pnpm install --frozen-lockfile --prefer-offline` terminó correctamente: 1.266 paquetes reutilizados, 0 descargados.

En la exportación se ejecutaron los gates con `--force` (Turbo sin caché):

| Gate                                         | Resultado real                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Typecheck y lint de shared, db, api y portal | 12 tareas aprobadas, 0 cacheadas, 0 errores. ESLint reportó 54 advertencias: shared 0, db 5, api 7 y portal 42. |
| Suites completas de shared, db, api y portal | 7 tareas aprobadas, 0 cacheadas, 0 fallidas. Conteos de Jest:                                                   |
| `@iwana/shared`                              | 28/28 suites y 278/278 tests aprobados; 0 omitidos.                                                             |
| `@iwana/db`                                  | 77/77 suites y 423/423 tests aprobados; 0 omitidos.                                                             |
| `@iwana/api`                                 | 443 suites aprobadas, 4 saltadas (447 total); 5.973 tests aprobados, 15 saltados (5.988 total).                 |
| `@iwana/portal`                              | 340/340 suites y 3.435 tests aprobados; 1 test saltado (3.436 total).                                           |

Jest terminó con código 0. Al final del portal informó que forzó la salida de un worker que no cerró con elegancia; no hubo suites fallidas. Evidencia local: `%TEMP%/iwana-c4f-head-20261102-type-lint.log` y `%TEMP%/iwana-c4f-head-20261102-tests.log`.

**Reclasificación de las 31 rutas que C4e había llamado ajenas:** `git grep` contra `HEAD` encontró la dependencia omitida de `SettingsPriorityTenantSnapshot` en el evaluador, el port/adaptador y sus consumidores. Las cinco rutas listadas arriba la completan y pasan a commit 6. Para las otras 26, las búsquedas en código y tooling no encontraron referencias a símbolos o rutas que existan solo en esos cambios. En particular, `post-push-ci.mjs`, `test-change-reviewer.md` e `iwana-checkpoint-commit` no aparecen referenciados por el código/configuración de tooling presentes en `HEAD`. Se confirman como ajenas estas 26 rutas:

- `.agents/skills/INDEX.md`, `.agents/skills/MANIFEST.json`, `.agents/skills/iwana-checkpoint-commit/SKILL.md`
- `.claude/agents/gate-verifier.md`, `.claude/agents/test-change-reviewer.md`
- `.claude/hooks/guard-paths.mjs`, `.claude/hooks/session-context.mjs`, `.claude/hooks/post-push-ci.mjs`
- `.claude/settings.json`, `.claude/skills/iwana-checkpoint-commit/SKILL.md`
- `.codex/agents/gate-verifier.toml`, `.codex/agents/test-change-reviewer.toml`
- `.opencode/agents/gate-verifier.md`, `.opencode/agents/test-change-reviewer.md`
- `AGENTS.md`, `scripts/claude-hooks.test.mjs`
- `docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md`
- `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.0.md`
- `docs/informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md`
- `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`
- `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`
- `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`
- `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-LAUNCH-v1.6.md`
- `docs/roles/Perfil_IA_Verificador_Gates_v1.md`
- `docs/roles/Perfil_IA_Revisor_Cambios_Pruebas_v1.md`
- `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`

El índice quedó vacío después de commit 6; rama `main`, sin `git worktree`, stash ni push. La exportación aislada demuestra que `HEAD` compila y las suites configuradas terminan sin fallos. Los saltos informados arriba son los declarados por Jest.

### 5. F3 — Push y G6.5 (2026-11-02)

**Commit 7:** `9e3956d7e7afbd494d1a0becad773568bc3a87cc` (`docs(mod05): record C4e and C4f`). Contiene las cinco rutas autorizadas: informe de consolidación, plan, prompt principal y launchers v1.9 y v1.10. El índice coincidió con el árbol en esas rutas; `lint-staged --no-stash` y `commitlint` pasaron sin cambiar su contenido.

**Push:** `git push origin main` terminó correctamente, sin `--force`; `main` avanzó de `6dbdda8a` a `9e3956d7`. `origin/main` y `HEAD` coinciden en ese SHA.

**Corrección H4 a la afirmación G6.5:** G6.5 **NO se cumplió**. El run [41439195628](https://github.com/Sleybc/iWana-neXt/actions/runs/41439195628) solo demuestra que `E2E Web Admin Smoke` terminó `success`; no demuestra que todos los workflows del SHA pasaran. El workflow `CI` del mismo SHA terminó `failure`, como se detalla en la auditoría que sigue. La fila de smoke de abajo es evidencia parcial, no el veredicto del gate.

| Job                     |           ID | Conclusión                                           | Duración |
| ----------------------- | -----------: | ---------------------------------------------------- | -------: |
| `Admin bootstrap smoke` | 125256512639 | `success`; todos sus pasos completaron correctamente |    1m10s |

GitHub añadió una anotación informativa: acciones que declaran Node.js 20 fueron forzadas a ejecutarse con Node.js 24. No afectó el resultado del job.

**Rutas que siguen locales:** antes de esta actualización, `git status --short --untracked-files=all` enumeraba 46 rutas: las 26 ajenas confirmadas y listadas en §C4f, más las 20 rutas D-CK-2 enumeradas en la tabla de cierre C4e. Ambas listas permanecen sin cambios. Esta §F3 añade solo el propio informe como una modificación local; no se añadió nada al índice. Rama `main`, índice vacío, sin stash ni staging parcial.

## Auditoría AI-EM-ARCH de F3 (2026-11-02): G6.5 NO cumplido

§F3 declaró G6.5 con el run 41439195628 (`E2E Web Admin Smoke`). El SHA `9e3956d7` también disparó el workflow `CI` (run 41439195912), que terminó en **`failure`**: Lint/Typecheck/Build/Unit (por el step de integración API), E2E portal y E2E R4.1. El diagnóstico y las correcciones están en §Ola 5 · H del prompt de consolidación. `main` queda en rojo hasta H4.

### H1 — Triage de fallas R4.1 (2026-11-02)

Se descargaron con `gh run download` los artefactos del run 41439195912 y del baseline 41249281896. El job R4.1 solo publicó `e2e-r41-summary`; no se adjuntaron trazas Playwright ni stack traces. El log descargable contiene conteos y nombres de las pruebas, pero no la aserción que falló. Por eso las clasificaciones de red y privacidad quedan provisionales.

Run actual: commit `9e3956d7e7afbd494d1a0becad773568bc3a87cc`, R4.1 con 327 aprobadas, 3 fallidas, 1 saltada, 0 sin ejecutar y 0 flaky; setup y limpieza terminaron en `OK`. Baseline verde: commit `6dbdda8afb8793966487bd05ab62e681c16d1f1f`, 326 aprobadas, 0 fallidas, 1 saltada, 0 sin ejecutar y 0 flaky.

| Falla                                          | Clasificación                            | Evidencia y commit/línea de producto                                                                                                                                                                                                                                                                                     | Contraste con baseline                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `portal-mod05-deuda-fiscal-live.spec.ts:883`   | Fixture/datos desactualizados            | El flujo activa un contrato sin enviar ni persistir `billingCycleDay`. `ContractsService` exige el ciclo y responde `BILLING_CYCLE_REQUIRED` en `apps/api/src/modules/crm/contracts/contracts.service.ts:1680-1684`, introducido por `4cfeed5f` (ciclo de facturación).                                                  | La prueba no cambió desde `6dbdda8`; el contrato de activación sí cambió después. La fixture debe suministrar el día requerido. No se identifica defecto de producción con esta evidencia. |
| `portal-network-provisioning-live.spec.ts:916` | Fixture/datos, provisional               | Setup, fixture operativa y cleanup de R4.1 reportaron `OK`. La prueba y los módulos de producto MOD13 no tienen cambios entre los dos commits; no se identifica commit ni línea de producto implicados. No hay traza para localizar qué dato o paso de la instalación falló.                                             | La misma prueba pasó en el baseline. La evidencia no permite llamarla regresión MOD13 ni flaky confirmado; se clasifica provisionalmente como dato de la fixture operativa.                |
| `portal-privacy.spec.ts:572`                   | Posible regresión MOD05 U, no confirmada | La E2E usa `page.route` y mocks de API, así que DT-3 backend no participa. El componente de la ficha cambió en `0175aca2`; `SubscriberDetailClient.tsx:229` añadió el control `privacyDetailsRestricted` para el panel Cumplimiento. La prueba no cambió; el mock no incluye ese campo y no permite atribuirle la falla. | Pasó en `6dbdda8`. Falta traza para confirmar una regresión. Escalar a AI-EM-ARCH antes de corregir cualquier comportamiento de producto.                                                  |

El run también falló en el job separado `E2E portal`: la instalación de Chromium detectó `ubuntu26.04-x64` y Playwright `1.58.2` informó que no soporta esa imagen. Esta falla de entorno no explica las tres pruebas ejecutadas por R4.1, que corre en otro job.

### H2 — Integraciones API herméticas (2026-11-02)

Cambios limitados a pruebas; no se modificaron aserciones. `contract-plan-change.postgres.integration.spec.ts` crea un tenant y un schema propios, aplica la cadena tenant con `applyTenantMigrationsInOrder` y limpia schema y tenant en `afterAll`; dejó de depender de `test-s2-live`. `subscriber-tax-confirm.postgres.integration.spec.ts` registra `Subscriber` en el DataSource y crea el suscriptor sintético que consulta `lockSubscriberForMutation`. `audit.service.transaction.postgres.integration.spec.ts` añade `subscribers.anonymized_at timestamptz`, el tipo definido por la migración 150 y leído por `CrmContractImpersonationAdapter`.

La reproducción usó la base nueva y vacía `iwana_it_ci_h_20261102_6d28e59e` en Postgres `127.0.0.1:5433`; nunca usó `dbiw`. Se aplicaron las migraciones públicas como en CI, se creó `tenant_test` y se aplicaron 164 migraciones tenant activas. Los tres specs modificados pasaron: 3/3 suites, 52/52 pruebas. La revisión `test-change-reviewer` de los tres diffs no encontró hallazgos.

Comando Jest de `.github/workflows/ci.yml` reproducido con `IWANA_DB_INTEGRATION_AVAILABLE=true` y `E2E_TENANT_SLUG=test`, más el gate literal de omisiones: **55 specs descubiertos; 51 suites aprobadas, 0 fallidas y 4 omitidas**, exactamente las cuatro rutas declaradas en `apps/api/integration-expected-skips.json`. Conteo de Jest: 351 pruebas, 331 aprobadas y 20 pendientes dentro de esas cuatro suites omitidas; 0 omitidas sin declarar. B5 pasó 17/17. El gate reportó `PASS (55 specs; 4 omisiones declaradas; B5 17/17)` y el comando terminó con código 0.

### H3 — Runner CI fijado (2026-11-02)

En `.github/workflows/ci.yml` se cambiaron únicamente los cuatro `runs-on: ubuntu-latest` solicitados (líneas actuales 30, 58, 199 y 1008) a `runs-on: ubuntu-24.04`. El job R4.1 ya estaba fijado en `ubuntu-24.04` (línea 717). `git diff --check` pasó y el diff del workflow contiene solo esos cuatro cambios.

Deuda para revisar cuando Playwright dé soporte a Ubuntu 26.04: `@playwright/test` / Playwright `1.58.2` en el lockfile; el run 41439195912 resolvió `ubuntu-latest` como `ubuntu26.04-x64` y falló al instalar Chromium con el mensaje de que esa combinación no está soportada. La fijación a `ubuntu-24.04` evita que los jobs afectados hereden esa imagen antes de resolver la deuda.

### H5 — Fixtures de ciclo y regresión E2E (2026-11-02)

**Cambios de pruebas.** En `portal-mod05-deuda-fiscal-live.spec.ts` y `portal-network-provisioning-live.spec.ts`, el fixture consulta `GET /crm/billing-cycles`, toma un ciclo con `active: true` y `cycleDay` entero, y envía ese `billingCycleDay` al activar el contrato. No se cambiaron otras aserciones. En `portal-privacy.spec.ts`, el mock `subscriber360()` ahora declara `Subscriber360Response` de `@iwana/shared`, publica `privacyDetailsRestricted: false` y completa el contrato con fechas válidas y los campos obligatorios del contrato compartido.

**Traza del caso de suplantación.** Comando inicial y repetición: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-privacy.spec.ts --trace on`. En la primera corrida: **4 aprobadas, 1 fallida**. La traza muestra `GET /crm/subscribers/:id/360` con HTTP 200, seguido de `RangeError: Invalid time value` antes de que apareciera el encabezado de la ficha. La causa era el mock anterior: su contrato no incluía las fechas requeridas por `ContractResponse`, que la ficha formatea. Con el mock tipado y fechas coherentes, la repetición terminó **5/5 aprobadas**; el caso de suplantación pasó. No se cambió el selector ni el producto.

**Ejecución real en tenant de prueba.** `--list` enumeró **22 tests en los seis specs** requeridos. El provisioner del repo (`scripts/e2e-provision-operational.mjs`) creó el entorno aislado `iwana-e2e-r41` en sus puertos E2E, un tenant de prueba no reservado, actores y sede MOD13 sintéticos; comprobó permisos NOC y site, `E2E_SETUP=OK`, worker healthy y terminó con `E2E_CLEANUP=OK`. El guard del provisioner rechaza `tenant_iwana`; ese tenant no se usó. El provisioner no admite seleccionar specs y ejecutó la suite completa de Portal. Su conteo real fue **309 aprobadas, 21 fallidas, 1 omitida, 0 sin ejecutar y 0 flaky**; código 1.

| Spec                                        | Conteo real                        | Resultado / causa observada                                                                                                                                                                                                                                         |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portal-crm-ciclo-facturacion-live.spec.ts` | 0 aprobadas, 1 fallida por timeout | El hook `beforeAll` excedió 30 s durante `createDisposableTenant` (`:317`); no alcanzó una aserción de producto. Se clasifica como timeout de setup E2E.                                                                                                            |
| `portal-mod05-deuda-fiscal-live.spec.ts`    | 7 aprobadas, 1 omitida             | La omisión está declarada en `:1361`: la base E2E recién migrada no tiene filas anteriores a la migración 153; esa condición la cubre la prueba de integración de migración.                                                                                        |
| `portal-network-provisioning-live.spec.ts`  | 1 aprobada                         | Activación con ciclo del catálogo y recorrido MOD13 pasaron en el tenant y site sintéticos del provisioner.                                                                                                                                                         |
| `portal-privacy-fase-1b-live.spec.ts`       | 1 aprobada, 3 fallidas             | Una prueba recibió HTTP 500 en `PATCH /crm/expedientes/:id/status` (`convertToParty`, helper `:500`); otras dos recibieron HTTP 500 en `login` (`:173`). El JSON no trae código de error; queda como bloqueo de API/fixture sin atribuirlo a una línea de producto. |
| `portal-privacy-live.spec.ts`               | 0 aprobadas, 3 fallidas            | Las tres terminaron en `/auth/login`; `toHaveURL(/\/dashboard$/)` falló en `:82` y el formulario seguía en estado «Ingresando…». Causa de autenticación en el entorno E2E sin atribución suficiente a producto o fixture.                                           |
| `portal-privacy.spec.ts`                    | 5 aprobadas                        | Incluye la repetición con `--trace on`; la ficha 360° y la radicación de suplantación pasan con el mock alineado al contrato.                                                                                                                                       |

**Hashes SHA-256 de los tres specs tocados:**

- `e2e/tests/portal-mod05-deuda-fiscal-live.spec.ts`: `398C90978FEBEC03871AD53E69578FE679BE6F61CEFDBCE52C773BE28780AFFB`
- `e2e/tests/portal-network-provisioning-live.spec.ts`: `29A2CE9B8E9457C92619739AA1499764ED26B9DD55B42CC4C85E4C093ED02402`
- `e2e/tests/portal-privacy.spec.ts`: `6A4631B4DC13D52B0C98FB004C0298BE41E5E81A0D746EB5DE22256217A174F8`

`pnpm exec prettier --check` pasó para los tres specs. **Veredicto H5: [BLOQUEO].** En conjunto, los seis specs dieron **14 aprobadas, 7 fallidas o con timeout y 1 omitida declarada**. La activación de MOD13 está corregida y pasa; la E2E local de suplantación también. El timeout de setup de ciclo, las respuestas HTTP 500 y el login E2E pendiente mantienen el gate abierto. Solo se modificaron los tres specs listados y esta sección; no se tocó producto, workflow, stash ni commits.

### Revisión test-change-reviewer de H2 y H5 (2026-11-02)

| Prueba (`archivo:línea`)                                    | Cambio                                                                                                                                                                                     | Hunk de producción que lo motiva                                                                                                                                                                                                                                                                                                                              | Regla que lo justifica                                                                                                                                               | Veredicto   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `contract-plan-change.postgres.integration.spec.ts:175`     | Sustituye la plantilla `test-s2-live` por tenant y schema propios, cadena tenant y limpieza. No altera expectativas.                                                                       | Sin cambio de producción en H2; la suite prueba el servicio de contratos en un schema aislado.                                                                                                                                                                                                                                                                | Prompt MOD05 §H2.1 exige schema propio, migraciones y limpieza.                                                                                                      | Justificado |
| `subscriber-tax-confirm.postgres.integration.spec.ts:37,77` | Registra `Subscriber` y crea la fila referenciada por el perfil antes de confirmarlo. No altera expectativas.                                                                              | `subscriber-tax-profile.service.ts:420-430` consulta y bloquea el suscriptor antes de mutar su perfil; el test debía registrar la entidad y preparar la relación.                                                                                                                                                                                             | Prompt MOD05 §H2.2 exige las entidades requeridas por B1 y prohíbe cambiar aserciones.                                                                               | Justificado |
| `audit.service.transaction.postgres.integration.spec.ts:59` | Añade `subscribers.anonymized_at timestamptz` al DDL sintético. No altera expectativas.                                                                                                    | `crm-contract-impersonation.adapter.ts:81` lee `anonymized_at`; el tipo real lo fija la migración `150_titular_anonymization_marker.ts:18` como `timestamptz`.                                                                                                                                                                                                | Prompt MOD05 §H2.3 permite completar el DDL con columnas y tipos de su migración, sin cambiar aserciones.                                                            | Justificado |
| `portal-mod05-deuda-fiscal-live.spec.ts:1046`               | Obtiene el ciclo activo del catálogo y lo envía en la activación. No cambia otras aserciones.                                                                                              | `contracts.service.ts:1682-1685` rechaza la activación sin ciclo válido.                                                                                                                                                                                                                                                                                      | ADR-102 §D3; prompt MOD05 §H5.1 identifica este fixture desalineado.                                                                                                 | Justificado |
| `portal-network-provisioning-live.spec.ts:569`              | Obtiene un ciclo activo y lo envía al activar el contrato MOD13. No cambia otras aserciones.                                                                                               | `contracts.service.ts:1682-1685` exige el ciclo en la activación.                                                                                                                                                                                                                                                                                             | ADR-102 §D3; prompt MOD05 §H5.1-2 corrige este fixture live.                                                                                                         | Justificado |
| `portal-privacy.spec.ts:134`                                | Tipifica `subscriber360()` como `Subscriber360Response`, añade `privacyDetailsRestricted: false` y completa campos requeridos con fechas coherentes. No cambia expectativas ni selectores. | La ficha consume el contrato 360° compartido; `Subscriber360Response` declara `privacyDetailsRestricted`, `contracts: ContractResponse[]` y `provisioningReadiness` en `packages/shared/src/contracts/crm/subscriber-360.ts:115-129`. `ContractResponseSchema` fija el contrato de serialización en `packages/shared/src/schemas/contract.schema.ts:154-212`. | Prompt MOD05 §H5.3 y §H5 encargo 2 permiten alinear el mock con `@iwana/shared`; la traza inicial confirmó `Invalid time value` al formatear el contrato incompleto. | Justificado |

Alcance revisado: los tres specs de integración H2 y los tres specs E2E cambiados en H5. No encontré cambios de aserciones, skips nuevos ni ajuste que oculte una regresión de producto; **cero hallazgos C**. Este veredicto de diff no convierte H5 en verde: su ejecución real conserva `[BLOQUEO]` por las fallas/timeout documentadas arriba.

### H4 — Commit, push y G6.5 (2026-11-02)

**Autorización confirmada (2026-11-02).** El dictamen AI-EM-ARCH de §«Dictamen AI-EM-ARCH sobre H5» clasifica las siete fallas locales como diferencias de entorno: los tres specs live afectados pasaron en R4.1 del run 41439195912 con el mismo código de producto; H2, H3 y H5 solo cambiaron pruebas o configuración CI. El dictamen recomienda aceptar la condición en su intención y solicita confirmación del CTO. El CTO confirmó que la condición está cumplida y ordenó el push el 2026-11-02. La revisión test-change-reviewer de H2/H5 registró **cero hallazgos C**.

El conteo local de H5 queda preservado como evidencia: 22 tests objetivo, **14 aprobados, 7 fallidos o con timeout y 1 omitido declarado**; el provisioner terminó con `E2E_CLEANUP=OK`. El veredicto de entorno del dictamen AI-EM-ARCH y la autorización explícita del CTO habilitan H4 pese a ese resultado local. El conteo no se presenta como 22/22 PASS.

**Commits H4:** índice vacío y coincidencia índice/árbol verificados para cada grupo; cada commit contiene solo archivos completos de su lista.

| Commit                                     | Mensaje                                    | Archivos                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0dbc9cef37e5bd8d9a47d9a24db1b13b309c41fd` | `test(mod05): stabilize contract fixtures` | `apps/api/src/modules/audit/audit.service.transaction.postgres.integration.spec.ts`; `apps/api/src/modules/crm/contracts/tests/contract-plan-change.postgres.integration.spec.ts`; `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-confirm.postgres.integration.spec.ts`; `e2e/tests/portal-mod05-deuda-fiscal-live.spec.ts`; `e2e/tests/portal-network-provisioning-live.spec.ts`; `e2e/tests/portal-privacy.spec.ts` |
| `a491605d29a9bfa5aec532de45a865fa99b76981` | `ci: pin runners to ubuntu-24.04`          | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `3200cf9a5e9f5ea726d51dcddba1c23e6390d9cd` | `docs(mod05): record H4 authorization`     | `docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`; `docs/plans/2026-10-31-mod05-consolidacion-cluster.md`; `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`; `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.11.md`; `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.12.md`                                                                                                              |

**Push:** `git push origin main` terminó sin `--force` el 2026-11-02. `main` avanzó de `9e3956d7e7afbd494d1a0becad773568bc3a87cc` a `3200cf9a5e9f5ea726d51dcddba1c23e6390d9cd`; `HEAD` y `origin/main` coinciden en el nuevo SHA.

**G6.5:** `gh run list --commit 3200cf9a5e9f5ea726d51dcddba1c23e6390d9cd --limit 100` enumeró dos workflows y ambos terminaron en `success`.

|                                                                          Run | Workflow              | Estado      | Conclusión |
| ---------------------------------------------------------------------------: | --------------------- | ----------- | ---------- |
| [41449913339](https://github.com/Sleybc/iWana-neXt/actions/runs/41449913339) | `E2E Web Admin Smoke` | `completed` | `success`  |
| [41449913367](https://github.com/Sleybc/iWana-neXt/actions/runs/41449913367) | `CI`                  | `completed` | `success`  |

Jobs terminales verificados con `gh run watch` y `gh run view`:

| Workflow              | Job                                                  |           ID | Conclusión |
| --------------------- | ---------------------------------------------------- | -----------: | ---------- |
| `E2E Web Admin Smoke` | `Admin bootstrap smoke`                              | 125292280634 | `success`  |
| `CI`                  | `Build y validación de imágenes production`          | 125292280742 | `success`  |
| `CI`                  | `Integridad de citas ADR`                            | 125292281040 | `success`  |
| `CI`                  | `E2E operativo R4.1 — API + storage + BullMQ reales` | 125292281115 | `success`  |
| `CI`                  | `Lint + Typecheck + Build + Unit tests`              | 125292281170 | `success`  |
| `CI`                  | `E2E portal`                                         | 125292281183 | `success`  |

La actualización de resultados G6.5 en esta sección se hizo después del commit 3 y queda local, sin staging. No se tocaron ni commitearon las rutas ajenas o D-CK-2, y no ejecuté comandos de stash ni staging parcial. En los commits 1 y 2, el hook `lint-staged` creó su respaldo temporal automático y completó su limpieza; `git stash list` quedó vacía después de cada commit y al cierre.

### Dictamen AI-EM-ARCH sobre H5 (2026-11-02)

**H5 cumple su objetivo: las 3 fallas de R4.1 en CI quedan corregidas.**

- `deuda-fiscal-live` da 7 aprobadas y 1 omitida declarada.
- `network-provisioning-live` da 1/1.
- `portal-privacy` da 5/5; la causa era el mock 360° (`Invalid time value`).
- `test-change-reviewer`: 0 hallazgos C.

**Las otras 7 fallas locales no son regresiones.** Las tres specs (`ciclo-facturacion-live`, `privacy-fase-1b-live` y `privacy-live`) fallan en local con timeout de setup, HTTP 500 en `login` y login colgado. Pasaron en el job R4.1 del CI (run 41439195912) con **el mismo código de producto**: allí la suite completa dio 327 aprobadas, 3 fallidas (las ya corregidas) y 1 omitida, sobre 331. La corrida local de esa misma suite dio 309, 21 y 1. Ningún archivo de producción cambió desde ese run: H2, H3 y H5 solo tocan pruebas y `ci.yml`. La diferencia es del entorno local, que corrió la suite completa con el provisioner en una sola máquina.

**Recomendación:** dar por cumplida la condición del CTO en su intención, que era no publicar pruebas que oculten fallos, y lanzar H4. El juez definitivo es G6.5: todos los workflows del nuevo SHA en `success`. Si R4.1 vuelve a fallar en CI en esas specs, se tratará como hallazgo nuevo. Requiere confirmación del CTO, porque la condición literal decía «H5 en verde».

## Cierre AI-EM-ARCH (2026-11-07)

**Dictamen: GO. El clúster MOD05 (D, E, F, U) y DT-3 quedan publicados en `main`, con G6.5 cumplido.** Se cierra el informe y el [plan](../plans/2026-10-31-mod05-consolidacion-cluster.md). El NO-GO de la cabecera original y de §Dictamen corresponde a la repetición de G1 de §C1b (2026-11-01) y se conserva como historia.

**Verificado por AI-EM-ARCH el 2026-11-07** con `gh run list --commit <sha>`:

| SHA | Contenido | Workflows |
| --- | --- | --- |
| `3200cf9a` | Último commit de H4 (registro de la autorización). Incluye por ancestro `0dbc9cef` (fixtures herméticos) y `a491605d` (runners `ubuntu-24.04`) | `CI` [41449913367](https://github.com/Sleybc/iWana-neXt/actions/runs/41449913367) y `E2E Web Admin Smoke` [41449913339](https://github.com/Sleybc/iWana-neXt/actions/runs/41449913339), ambos en `success` |
| `e7f8613a` | Registro de la publicación de H4 y del G6.5 | `CI` [41456557300](https://github.com/Sleybc/iWana-neXt/actions/runs/41456557300) y `E2E Web Admin Smoke` [41456557590](https://github.com/Sleybc/iWana-neXt/actions/runs/41456557590), ambos en `success` |

**Commits del clúster:** `78d3e4fb`, `4cfeed5f`, `0175aca2`, `a8324a84`, `ee7f89f3` (C4e); `50231284` (C4f); `9e3956d7` (registro de C4e y C4f, publicado en F3); `0dbc9cef`, `a491605d`, `3200cf9a` (H4); `e7f8613a` (registro).

**Lecciones que quedan como regla de proceso:**

1. G6.5 se verifica sobre **todos** los workflows del SHA, nunca solo sobre uno. F3 lo declaró mirando el smoke con el `CI` en rojo.
2. El G1 previo a un push usa el comando literal del CI sobre una base nueva, no listas enumeradas contra `dbiw`. El CI descubre todas las `*.postgres.integration.spec.ts`.
3. Antes de publicar, `HEAD` se verifica aislado (`git archive`), sin el resto del árbol. C4e dejó `HEAD` sin compilar por una dependencia clasificada como ajena.
4. Las restauraciones se hacen por archivo completo verificado por hash, no por patch con contexto. Prettier rompió el patch B1.

**Fuera de este cierre, sin dueño asignado (no bloquean):**

| Deuda | Origen | Riesgo |
| --- | --- | --- |
| DT-4: el aprovisionamiento reactivó un tenant en `MARKED_FOR_DELETION` | §K4f, observación de la línea 388 | El tenant escapa de la purga programada. Es de MOD13; necesita triage de `plat-ops` |
| P3-5: pruebas de ciclo de vida y fecha de nacimiento con DDL hecho a mano | §K4 | Deriva frente a la cadena migrada, la misma causa que puso el CI en rojo en F3 |
| Playwright 1.58.2 sin soporte en ubuntu 26.04 | §H3 | El CI queda fijado en `ubuntu-24.04` hasta que Playwright dé soporte |

**Respaldos:** su condición de conservación («hasta G6.5», plan §4 P5) se cumplió. Siguen en disco hasta que el CTO ordene borrarlos: `refs/checkpoint/stash-B-rerun` (`3fa18ca2`), `%TEMP%\iwana-mod05-separate-snapshots-2026-11-01\` y el respaldo R3-ter de `contracts.service.spec`.

**Sin commitear por decisión del CTO:** las PNG de evidencia modificadas en `docs/informes/evidence/`, que se dejan así.
