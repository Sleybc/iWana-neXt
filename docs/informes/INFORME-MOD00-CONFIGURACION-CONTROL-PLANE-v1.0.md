# INFORME - MOD00 Configuracion Control Plane - Aprobacion y Handoff Fase 01

**Version:** 1.16
**Estado:** Activo
**Fecha:** 2026-05-23
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuracion Control Plane  
**ADR aprobado:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md  
**PRD:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**HLD:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**Plan:** docs/plans/2026-05-19-mod00-configuracion-control-plane.md  
**Prompt:** docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md  
**Checklist:** docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md  
**Antecedente historico:** docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md

---

## 1. Resumen ejecutivo

CTO aprueba la decision arquitectonica de formalizar **MOD00 Configuracion Control Plane** como modulo rector transversal del tenant.

La decision corrige la ambiguedad previa donde el control plane habia sido documentado inicialmente como MOD03 v2 por continuidad historica. MOD03 Configuracion Empresarial v1.x queda como antecedente legacy de perfil empresarial, settings iniciales, cobertura comercial y planes historicos. Las nuevas capacidades transversales de configuracion, organizacion, sedes y perfiles de acceso se ejecutan bajo MOD00.

---

## 2. Decisiones aprobadas

1. MOD00 Configuracion sera la consola/control plane federado del tenant.
2. MOD00 centraliza la experiencia administrativa, no el ownership de todos los dominios.
3. Organizacion/Sedes nace como primera gran seccion de MOD00.
4. Usuarios y acceso nace como segunda capacidad transversal: perfiles configurables sobre `UserRole` base.
5. WFM conserva agenda, Work Orders, ventanas de despacho, overrides, evidencias y ejecucion de campo.
6. Inventory futuro conserva stock, seriales, MACs, bodegas y movimientos.
7. Billing futuro conserva recaudo, caja, cartera y facturacion.
8. No se crean roles backend dinamicos desde la UI.
9. No se renombra codigo fuente ni rutas OpenAPI por el cambio documental MOD03 -> MOD00.

---

## 3. Artefactos aprobados y en revision

| Artefacto                                                                 | Estado                  | Uso                                                            |
| ------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`    | Aprobado                | Decision arquitectonica CTO                                    |
| `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`                 | Aprobado                | Alcance funcional MOD00                                        |
| `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`                 | Aprobado                | Arquitectura tecnica                                           |
| `docs/plans/2026-05-19-mod00-configuracion-control-plane.md`              | Aprobado para ejecucion | Plan task-by-task                                              |
| `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md`                 | Aprobado para ejecucion | Prompt para Sr. Dev Fullstack                                  |
| `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md`              | Aprobado                | Gates por backend, frontend, database, E2E y cierre documental |
| `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-02-v1.0.md`                 | Aprobado                | Prompt operativo Fase 02 WFM integration                       |
| `docs/plans/2026-05-19-mod00-configuracion-fase-02-wfm-integration.md`    | Aprobado                | Plan ejecutable Fase 02                                        |
| `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-02-v1.0.md`              | Aprobado                | Gate de calidad Fase 02                                        |
| `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-03-v1.0.md`                 | Aprobado                | Prompt operativo Fase 03 settings federados                    |
| `docs/plans/2026-05-19-mod00-configuracion-fase-03-settings-federados.md` | Aprobado                | Plan ejecutable Fase 03                                        |
| `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-03-v1.0.md`              | Aprobado                | Gate de calidad Fase 03                                        |
| `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-04-v1.0.md`                 | Aprobado                | Prompt operativo Fase 04 gobierno avanzado                     |
| `docs/plans/2026-05-19-mod00-configuracion-fase-04-gobierno-avanzado.md`  | Aprobado                | Plan ejecutable Fase 04                                        |
| `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-04-v1.0.md`              | Aprobado                | Gate de calidad Fase 04                                        |
| `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-05-v1.0.md`                 | Aprobado                | Prompt operativo Fase 05 unificacion visible de sedes WFM      |
| `docs/plans/2026-05-21-mod00-configuracion-fase-05-unificacion-sedes.md`  | Aprobado                | Plan ejecutable Fase 05                                        |
| `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-05-v1.0.md`              | Aprobado                | Gate de calidad Fase 05                                        |
| `docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md`               | Actualizado             | Addendum de compatibilidad WFM -> MOD00                        |
| `docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md`                    | Actualizado             | Antecedente historico MOD03                                    |

Artefactos Fase 06 aprobados:

- `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md` - Aprobado.
- `docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md` - Actualizado.
- `docs/plans/2026-05-23-mod00-configuracion-fase-06-calendario-operativo-jornadas.md` - Ejecutado.
- `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-06-v1.0.md` - Ejecutado.
- `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md` - Cerrado.

---

## 4. Handoff para Fullstack

El Sr. Dev Fullstack debe ejecutar `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md` y seguir `docs/plans/2026-05-19-mod00-configuracion-control-plane.md`.

La ejecucion debe cerrar cada gate de `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md` o documentar el bloqueo con evidencia.

Orden recomendado:

1. Crear enums compartidos y labels.
2. Crear entidades y migracion tenant reversible.
3. Implementar backend Organizacion/Sedes.
4. Implementar backend Access Control.
5. Implementar portal Organizacion.
6. Implementar portal Usuarios y acceso.
7. Agregar E2E y actualizar este informe con evidencia final.

---

## 5. Gates de calidad

- No romper boundaries del modulith.
- No acceder directamente a tablas de otro modulo.
- No usar `tenant.settings` JSONB para sedes, horarios, perfiles o permisos.
- Mantener `@Roles(UserRole.*)` con enums.
- Validar entradas externas con Zod/DTOs.
- Auditar toda mutacion sensible.
- Mantener textos UI en espanol y sentence case.
- Validar migraciones up/down.

---

## 6. Estado actual

La Fase 01 fue ejecutada en el monorepo con alcance completo sobre contratos compartidos, persistencia tenant-aware, backend NestJS y portal tenant-aware para Organizacion y Usuarios y acceso.

Actualizacion v1.1: se explicito roadmap Fase 01-04 en PRD/HLD/plan y se creo checklist de calidad para eliminar ambiguedad de frontend, backend y base de datos.

Actualizacion v1.2: se crearon planes, prompts y checklists de Fase 02, Fase 03 y Fase 04 para ejecucion secuencial fullstack.

Actualizacion v1.3: se resolvio el bloqueo tecnico de Fase 01 sobre Access Control. Queda aprobado el catalogo seed versionado `MOD00_ACCESS_V1`, con permisos `ASSIGNABLE` y `RESERVED`, y la matriz de compatibilidad entre `UserRole` base y permisos configurables. La ejecucion puede reanudarse con validaciones obligatorias para CA-CFG2-03, CA-CFG2-04 y CA-CFG2-05.

Actualizacion v1.4: se implementaron `OrganizationModule` y `AccessControlModule` en API, se agregaron las entidades y migracion tenant de MOD00 en `@iwana/db`, se extendio el portal con accesos desde `/dashboard/settings` y se crearon las pantallas `/dashboard/settings/organization` y `/dashboard/settings/access` con pruebas focalizadas y flujo Playwright ADMIN.

Actualizacion v1.5: se cerro la Fase 02 de integracion WFM con Organizacion/Sedes mediante adapter por puerto aprobado, tabla de mapping reversible, compatibilidad de entrada `organizationSiteId` -> persistencia legacy `operatingSiteId`, nueva ruta portal `/dashboard/settings/field-operations` y validacion completa de API, portal y Playwright.

Actualizacion v1.6: se cerro la Fase 03 de settings federados con registry backend protegido, shell portal por metadata, estados reales para owners disponibles y no disponibles, E2E focalizado del shell y cierre documental de la fase.

Actualizacion v1.7: se cerro la Fase 04 de gobierno avanzado con permisos granulares sobre `UserRole` base, anti-lockout para el ultimo camino ADMIN efectivo, resumen backend de permisos efectivos, evidencia real desde auditoria en portal y Playwright focalizado para falta de permiso granular y bloqueo anti-lockout.

Actualizacion v1.8: se abrio la Fase 05 para unificar la nocion visible de sedes entre Organizacion y Operacion de campo. El primer corte ya expone `operatingSiteId` mapeado en `dispatch-sites`, usa sedes empresariales como fuente visible en portal WFM y deja documentado el cierre pendiente para llevar contratos administrativos WFM a soporte nativo de `organizationSiteId`.

## 7. Resolucion de bloqueo tecnico Access Control

**Bloqueo reportado:** faltaban definiciones criticas para implementar seguridad sin desalinear el boundary aprobado: catalogo inicial de permisos versionados por modulo y matriz de compatibilidad entre `UserRole` base y perfiles/permisos configurables.

**Decision EM-ARCH:** GO condicionado a implementar exactamente la politica documentada en ADR-040 v1.1, PRD MOD00 v1.1, HLD MOD00 v1.1 y plan actualizado:

- Catalogo seed: `MOD00_ACCESS_V1`.
- Permisos con estado `ASSIGNABLE` o `RESERVED`.
- Perfiles tenant-created con `baseRoleConstraint` obligatorio en Fase 01.
- Rechazo backend de permisos desconocidos, reservados o incompatibles.
- Roles de plataforma `SYSTEM_ADMIN` e `IWANA_SUPPORT` fuera de perfiles configurables tenant.
- `SUBSCRIBER`, `PARTNER` e `INVESTOR` fuera de perfiles administrativos MOD00 en Fase 01.

**Riesgos a vigilar al reanudar:**

- Alcance por sede de perfiles: usar `scope_site_id` solo como restriccion de perfil; no reemplaza permisos ni rol base.
- PII en auditoria: registrar IDs, claves y deltas minimos; no persistir documentos, telefonos, direcciones personales ni payloads completos.
- Transicion WFM: mantener estrategia aditiva `WfmOperatingSite` -> `OrganizationSite`; no eliminar referencias legacy en Fase 01.

**Resultado:** bloqueo levantado para continuar backend Access Control y pruebas focalizadas. Si el equipo necesita ampliar permisos fuera de `MOD00_ACCESS_V1`, debe documentar nueva decision antes de implementar.

## 8. Ejecucion tecnica Fase 01

### Alcance implementado Fase 01

- En `@iwana/shared` se agregaron enums de Organizacion y Access Control para contratos estables entre API, portal y persistencia.
- En `@iwana/db` se agregaron entidades tenant-aware para `organization_sites`, capacidades, horarios, asignaciones, responsables, catalogo de permisos, perfiles y asignaciones de perfiles, junto con la migracion tenant `037_create_configuration_control_plane` y su registro en el runner.
- En `apps/api` se implementaron los endpoints de Organizacion y Access Control definidos para Fase 01, con `TenantContext.getOrThrow()`, `runInTenantSchema()`, `@Roles(UserRole.*)`, auditoria en mutaciones y validaciones de compatibilidad `UserRole` -> permisos.
- En `apps/portal` se reorganizo el centro de configuracion para exponer accesos a Organizacion y Usuarios y acceso, con clientes tipados de API, copy empresarial en espanol y estados conservadores para acceso no ADMIN.
- En E2E se agrego el flujo ADMIN que navega desde settings, crea sede y crea perfil de acceso usando mocks de red explicitos.

### Validaciones ejecutadas Fase 01

- `pnpm --filter @iwana/shared typecheck` ✅
- `pnpm --filter @iwana/db typecheck` ✅
- `pnpm --filter @iwana/api typecheck` ✅
- `pnpm --filter @iwana/api test -- organization access-control` ✅
- `pnpm --filter @iwana/portal typecheck` ✅
- Jest focalizado portal sobre `SettingsClient`, `OrganizationSettingsClient` y `AccessControlSettingsClient` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-organization-access.spec.ts` ✅

### Criterios de aceptacion cubiertos Fase 01

- CA-CFG2-01: `ADMIN` puede crear una sede con capacidades y horario institucional por API y flujo portal validado.
- CA-CFG2-02: el backend deja lectura de sedes habilitada para roles base aprobados sin abrir mutaciones.
- CA-CFG2-03: `ADMIN` puede crear perfil configurable y asignarle permisos validos.
- CA-CFG2-04: el backend rechaza permisos desconocidos, reservados o incompatibles con `baseRoleConstraint`.
- CA-CFG2-05: las mutaciones siguen protegidas por `@Roles(UserRole.*)` y no dependen del ocultamiento de UI.
- CA-CFG2-06: queda preparado `OrganizationSiteReadPort` para consumo futuro de WFM sin lectura directa de tablas.
- CA-CFG2-07: no se implementaron ownership falsos de Inventory, Billing, HR, Commercial ni WFM dentro de MOD00.
- CA-CFG2-08: mutaciones sensibles de Organizacion y Access Control registran auditoria.
- CA-CFG2-09: typecheck y pruebas focalizadas ejecutadas en verde.

## 9. Decisiones conservadoras y deuda acotada

- El seed `MOD00_ACCESS_V1` actualiza o inserta claves aprobadas, pero no elimina entradas legacy del catalogo para evitar asumir ownership sobre datos no documentados.
- `OrganizationSiteReadPort` se limito al caso de lectura por capacidad aprobado para Fase 01; la integracion funcional con WFM queda diferida a Fase 02.
- En esta fase no se agrego validacion fuerte contra `users.id` en asignaciones y responsabilidades de sede para no acoplar MOD00 a internals de Users fuera de los puertos aprobados. Si negocio exige esa garantia en tiempo real, debe resolverse con puerto tipado en una iteracion posterior.

## 10. Ejecucion tecnica Fase 02

### Alcance implementado

- En `apps/api/src/modules/wfm` se incorporo `WfmOrganizationSitesReadPort` para consumir sedes de despacho activas desde MOD00 sin importar repositorios de Organizacion dentro de WFM.
- En `@iwana/db` se agregaron la entidad `WfmOperatingSiteOrganizationSiteMapping` y la migracion tenant `038_map_wfm_operating_sites_to_organization_sites`, con backfill conservador por coincidencia exacta de `code` y mensajes `NOTICE` para registros insertados, omitidos y preexistentes.
- En servicios y DTOs de WFM se habilito compatibilidad para aceptar `organizationSiteId` solo en boundaries aprobados, resolverlo a `operatingSiteId` mediante `WfmOperatingSiteMappingService` y mantener intacta la persistencia legacy de agenda, eventos y solicitudes.
- En `apps/portal` se agrego la ruta `/dashboard/settings/field-operations`, se preservo la UI legacy de horarios/sedes operativas y se mostro el contexto de despacho organizacional consumiendo el nuevo endpoint WFM.
- En E2E se agrego el flujo ADMIN que navega desde settings hacia Operacion de campo y valida tanto la UI legacy como el contexto informativo de sedes de despacho organizacionales con mocks tenant-aware.

### Validaciones ejecutadas

- `TERM=dumb CI=1 pnpm lint | cat` ✅
- `pnpm --filter @iwana/db typecheck` ✅
- `pnpm --filter @iwana/api typecheck` ✅
- `pnpm --filter @iwana/portal typecheck` ✅
- `pnpm --filter @iwana/api test -- wfm` ✅
- `pnpm --filter @iwana/portal test -- settings wfm` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-wfm-organization-sites.spec.ts` ✅

### Criterios de aceptacion cubiertos

- WFM consume lectura de sedes aprobada por puerto y no por acceso directo a tablas de Organizacion.
- El modelo legacy `WfmOperatingSite` permanece operativo y compatible para referencias historicas.
- La compatibilidad `organizationSiteId` habilita transicion incremental sin reescritura masiva de persistencia ni ruptura de contratos existentes.
- El portal expone una entrada explicita de Operacion de campo y conserva la experiencia existente de configuracion WFM.
- El flujo E2E demuestra navegacion ADMIN, tenancy visible en requests mockeados y contexto combinado MOD00 + WFM.

## 11. Incidencias de cierre

- Durante el barrido `pnpm --filter @iwana/api test -- wfm` se detecto una regresion local en `wfm.tenant-isolation.spec.ts`: el test no habia registrado el nuevo proveedor `WfmOperatingSiteMappingService` requerido por `ScheduleEventsService`.
- La incidencia se resolvio actualizando el wiring del spec con un mock conservador y reruneando la suite WFM completa en verde.
- No quedan bloqueos abiertos de Fase 02; la deuda funcional mayor sigue siendo la migracion gradual de consumidores WFM hacia `organizationSiteId` sin retirar el modelo legacy antes de una fase posterior aprobada.

## 12. Ejecucion tecnica Fase 03

### Alcance implementado Fase 03

- En `apps/api/src/modules/configuration` se consolidaron `ConfigurationModule`, `ConfigurationController` y `SettingsRegistryService` para exponer el endpoint protegido `/api/v1/configuration/settings-sections` con metadata pura del shell, sin lecturas a tablas ni servicios privados de otros bounded contexts.
- En `@iwana/shared` quedaron activos los enums estables `SettingsSectionKey` y `SettingsSectionStatus`, consumidos por API y portal para mantener contratos de shell federado sin strings ad hoc.
- En `apps/portal` el entrypoint `/dashboard/settings` consume `configurationApi.settingsSections.list()` y renderiza `SettingsSectionGrid` con secciones disponibles, proximamente y no configuradas, manteniendo rutas reales hacia Organización, Usuarios y acceso, Seguridad, Marca y Operación de campo.
- Los módulos futuros o aún no federados se representan con `SettingsUnavailableState`, sin formularios falsos, sin botones de escritura y con owner visible para evitar ambigüedad de ownership.
- En E2E se agregó el flujo `portal-settings-federated-shell.spec.ts`, aislado con mocks tenant-aware para auth, profile, settings, registry y superficies mínimas de rutas disponibles.

### Validaciones ejecutadas Fase 03

- `pnpm --filter @iwana/api test -- configuration` ✅
- `pnpm --filter @iwana/portal test -- SettingsSectionGrid.spec.tsx` ✅
- `pnpm --filter @iwana/portal test -- SettingsClient.spec.tsx` ✅
- `pnpm --filter @iwana/api typecheck` ✅
- `pnpm --filter @iwana/portal typecheck` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-federated-shell.spec.ts` ✅

### Criterios de aceptacion cubiertos Fase 03

- CA-CFG3-01: settings lista secciones con owner y estado desde backend y portal.
- CA-CFG3-02: Organización, Access y Field Operations abren rutas reales validadas en pruebas unitarias y E2E.
- CA-CFG3-03: Comercial y Billing se muestran como estados no disponibles sin formularios falsos ni submit actions dentro del shell.
- CA-CFG3-04: el registry backend devuelve metadata estática y no introduce lecturas cross-module ni ownership artificial en MOD00.
- CA-CFG3-05: la UI conserva textos visibles en español y sentence case para labels, estados y navegación.

## 13. Incidencias de cierre Fase 03

- El primer barrido Playwright de Fase 03 falló por un selector ambiguo en el spec, no por la implementación del shell. Se corrigió acotando las aserciones al panel `Secciones de configuración`.
- Durante la misma validación se detectó una llamada no mockeada al detalle de una sede organizacional al navegar a la ruta real de Organización. Se agregó el mock faltante para dejar el E2E aislado del API real y evitar flakiness.
- No quedan bloqueos abiertos de Fase 03. La siguiente fase natural sigue siendo ampliar settings federados solo cuando cada módulo owner publique contratos reales aprobados.

## 14. Ejecucion tecnica Fase 04

### Alcance implementado Fase 04

- En `apps/api/src/modules/access-control` se agregaron `@Permissions()`, `PermissionsGuard`, `EffectivePermissionsService` y `AccessGovernanceService` para refinar autorizacion despues de JWT + roles sin reemplazar `UserRole` como base.
- Los endpoints de `AccessControlController` y `OrganizationController` ahora exigen permisos granulares para lectura y mutacion, con 403 observable cuando el rol base no alcanza el permiso efectivo requerido.
- `AccessControlService` protege mutaciones sensibles con anti-lockout antes de desactivar perfiles ADMIN, reemplazar permisos que otorgan `access.profiles.manage` o sustituir perfiles de usuarios ADMIN.
- La API expone `GET /api/v1/access-control/users/:userId/effective-permissions` para resumir permisos vigentes, permisos de recuperacion ADMIN y perfiles activos que conceden acceso.
- En `apps/portal` la vista `/dashboard/settings/access` reutiliza el layout existente para mostrar `Permisos efectivos` y `Cambios sensibles recientes`, consumiendo el resumen backend y el audit log real sin crear una pantalla paralela.
- La auditoria de Access Control se enriquecio con deltas `permissionImpact` y `assignmentImpact` para hacer legible el cambio sin registrar secretos, tokens ni PII adicional.
- No fue necesaria migracion nueva ni cache adicional en Fase 04; la resolucion sigue siendo runtime sobre tenant schema y lecturas ya aprobadas.

### Validaciones ejecutadas Fase 04

- `runTests` focalizado sobre `apps/api/src/modules/access-control/access-control.controller.http.spec.ts` y `apps/api/src/modules/access-control/access-control.service.spec.ts` ✅
- `runTests` focalizado sobre `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx` ✅
- `runTests` focalizado sobre `apps/api/src/modules/access-control/access-control.service.spec.ts` y `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx` tras enriquecer auditoria ✅
- `pnpm exec playwright test e2e/tests/portal-settings-access-governance.spec.ts --config e2e/playwright.portal.local.config.ts` ✅

### Criterios de aceptacion cubiertos Fase 04

- CA-CFG4-01: `PermissionsGuard` corre despues de JWT y roles, y rechaza mutaciones sin permiso granular efectivo.
- CA-CFG4-02: los permisos efectivos consideran perfiles activos, vigencia, compatibilidad con rol base y baseline minimo de recuperacion ADMIN solo lectura.
- CA-CFG4-03: anti-lockout impide que el ultimo camino ADMIN efectivo pierda `access.profiles.manage`.
- CA-CFG4-04: el portal muestra permisos efectivos con labels de negocio y origen del acceso para el usuario seleccionado.
- CA-CFG4-05: el portal muestra evidencia real de cambios sensibles desde auditoria y hace visibles los 403 especificos devueltos por backend.
- CA-CFG4-06: Playwright cubre evidencia visible, bloqueo por falta de permiso granular y mensaje anti-lockout.

## 15. Incidencias de cierre Fase 04

- El barrido Playwright inicial falló por locators ambiguos y por contratos mockeados incompletos del audit log, no por la implementación productiva. Se corrigieron selectores al panel objetivo y el shape del mock para `auditApi.list()`.
- Durante la integración del portal se detectó que el mapeo de errores colapsaba todos los 403 a un texto genérico. Se ajustó para priorizar el mensaje específico del backend en bloqueos granulares y anti-lockout.
- No quedan bloqueos abiertos de Fase 04. La siguiente actividad natural es un regression slice de settings del portal para verificar que Organización, shell federado y Access Control siguen estables en conjunto.

## 16. Avance tecnico Fase 05

### Alcance implementado en el primer corte

- En `apps/api/src/modules/wfm/wfm.controller.ts` el endpoint `GET /api/v1/wfm/dispatch-sites` ahora enriquece cada sede organizacional con `operatingSiteId` mapeado mediante `WfmOperatingSiteMappingService`.
- En `apps/api/src/modules/wfm/services/wfm-operating-site-mapping.service.ts` se agregó resolucion batch de mappings por `organizationSiteId`, reutilizable para compatibilidad incremental sin lecturas ad hoc desde portal.
- En `apps/portal/src/lib/api-client.ts` se tipó `WfmDispatchSite` y el cliente WFM consume la lista enriquecida.
- En `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx` se retiró el CRUD visible de `Sedes operativas`; la pantalla ahora usa sedes empresariales/de despacho como única referencia visible para horario por sede, excepciones y cierres.
- Se mantuvo compatibilidad interna con `operatingSites.list()` solo como fallback técnico para etiquetas legacy y datos no migrados, sin volver a exponer un concepto paralelo al usuario.

### Validaciones ejecutadas en este corte

- `runTests` focalizado sobre `apps/api/src/modules/wfm/tests/wfm-organization-sites.controller.http.spec.ts` ✅
- `runTests` focalizado sobre `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx` ✅
- `get_errors` sobre archivos tocados en API y portal ✅

### Deuda remanente acotada

- Llevar horarios por sede, overrides y blackouts a contratos nativos basados en `organizationSiteId` para que portal deje de depender del fallback `operatingSites.list()`.
- Actualizar Playwright de Operacion de campo para validar la UX unificada end-to-end.
- Decidir y documentar el retiro final de `WfmOperatingSite` solo cuando la persistencia histórica quede cubierta.

## 17. Incidencias abiertas Fase 05

- La unificación visible ya está activa, pero la compatibilidad administrativa de WFM sigue apoyándose parcialmente en IDs legacy resueltos por mapping. Esto es aceptado en Fase 05 solo como paso intermedio y no debe consolidarse como estado final.
- No hay bloqueo abierto para continuar; el siguiente slice correcto es cerrar los contratos backend nativos sobre `organizationSiteId` y eliminar el fallback interno restante con pruebas E2E en verde.

## 18. Analisis post-ejecucion y agenda de refinamiento

### Aclaracion de negocio validada

Se valida como regla operativa de MOD00 que el usuario con rol base `ADMIN` es el gobernador del tenant para:

- crear usuarios internos;
- organizar perfiles configurables;
- dar acceso a modulos mediante perfiles y permisos compatibles.

La expresion "perfil administrador" no debe reinterpretarse como elevacion de un `UserRole` distinto a `ADMIN`. En MOD00, el perfil configurable refina y acota acceso dentro del rol base compatible; no reemplaza la barrera de `RolesGuard`.

### Hallazgos confirmados en la ejecucion revisada

### P1

- `scope_site_id` existe en modelo, DTOs y respuestas, pero sigue siendo una brecha hasta que participe en el enforcement real de permisos o policies de recurso.
- El shell federado publica `requiredPermissions`, pero portal y contrato de shell todavia deben alinearse para no invitar a rutas que terminen en `403` inesperado.
- La asignacion de perfiles a usuarios permanece acoplada al mismo permiso granular que administra el catalogo de perfiles.
- Los endpoints sensibles de Users todavia requieren hardening adicional con `users.manage` para que gobierno administrativo y permiso granular queden alineados.

### P2

- El contrato aprobado de soft-delete para sedes sigue abierto mientras no se exponga `DELETE /organization/sites/:id` con pruebas y accion portal coherentes.

### P3

- WFM sigue conviviendo con superficie legacy de `operating-sites`; la direccion aprobada no cambia, pero la convergencia con `OrganizationSite` sigue siendo deuda viva.

### Decision EM-ARCH para el siguiente ciclo

No se aprueba refactorizacion estructural amplia. Se aprueba refinamiento incremental sobre el estado actual con este orden:

1. endurecer gobierno administrativo del tenant y separar asignacion de acceso del CRUD de perfiles;
2. aplicar `scope_site_id` y alinear shell federado con permisos efectivos;
3. cerrar el contrato de delete de sedes;
4. reducir gradualmente la superficie legacy de WFM sin perder historial ni compatibilidad.

### Handoff documental

- ADR rector actualizado: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- PRD actualizado: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD actualizado: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Plan nuevo de refinamiento: `docs/plans/2026-05-22-mod00-refinamiento-post-ejecucion.md`

### Ejecucion del refinamiento 2026-05-22

- Se endurecio el gobierno administrativo de tenant en Users: las mutaciones sensibles ahora requieren `users.manage`, y `SYSTEM_ADMIN` conserva bypass de plataforma en `PermissionsGuard`.
- Se separo la asignacion de perfiles de acceso del CRUD del catalogo con el permiso dedicado `access.assignments.manage`, incluyendo ajuste del anti-lockout administrativo.
- `scope_site_id` dejo de ser metadata pasiva: `PermissionsGuard` propaga `siteId` o `organizationSiteId`, `EffectivePermissionsService` filtra perfiles acotados por sede y Organization expone rutas site-scoped compatibles con ese enforcement.
- El shell federado del portal ya no presenta tarjetas operables cuando faltan permisos requeridos: consume permisos efectivos self-service y degrada la seccion como `Acceso restringido` en lugar de invitar a un `403` posterior.
- Se cerro el contrato de baja logica de sedes con `DELETE /organization/sites/:siteId`, auditoria backend y accion portal para `Dar de baja sede`.
- `OrganizationSettingsClient` dejo de resolver permisos del usuario actual por el endpoint administrativo de terceros y migro al resumen self-service, alineando la ruta de Organizacion con el shell federado y evitando falsos negativos en permisos del propio administrador.
- La superficie WFM de settings dejo de depender de `operatingSiteId` para operar horarios: el selector y las mutaciones ya trabajan directamente con `organizationSiteId`, por lo que una sede empresarial sigue siendo operable aun sin mapping legacy visible.
- Se cerro el riesgo residual acotado en scheduling/visit requests: las respuestas WFM de solicitudes de visita ahora exponen `organizationSiteId` derivado, y la bandeja de despacho del portal prioriza ese contrato para recomendar y agendar, dejando `operatingSiteId` encapsulado como compatibilidad interna de persistencia.
- Evidencia focalizada ejecutada en verde: `access-control.controller.http.spec.ts`, `permissions.guard.spec.ts`, `effective-permissions.service.spec.ts`, `organization.controller.http.spec.ts`, `SettingsClient.spec.tsx`, `SettingsSectionGrid.spec.tsx` y `OrganizationSettingsClient.spec.tsx`.
- Evidencia integrada de cierre en verde: `WfmOperatingHoursManager.spec.tsx`, `visit-requests.service.spec.ts`, `PendingVisitRequestsView.spec.tsx`, `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-organization-access.spec.ts`, `pnpm --filter @iwana/api typecheck` y `pnpm --filter @iwana/portal typecheck`.

## 20. Cierre Fase 06 - Calendario operativo y jornadas

### Fecha

2026-05-23

### Alcance ejecutado

- **Shell federado**: `SettingsSectionKey.CALENDAR` agregado a contratos. `SettingsRegistryService` publica la sección con ruta `/dashboard/settings/calendar`, owner `MOD00 / MOD09` y permisos `settings.read`. `SettingsSectionGrid` la muestra en el centro de settings.
- **Ruta base**: `apps/portal/src/app/dashboard/settings/calendar/page.tsx` + `CalendarSettingsClient.tsx` + spec con 8 tests en verde.
- **Horarios de empresa y sede**: `CalendarOrganizationHoursPanel` y `CalendarSiteHoursPanel` centralizados en la nueva ruta.
- **Excepciones**: `CalendarExceptionsPanel` centralizado en la nueva ruta.
- **Ventana técnica WFM**: `CalendarWfmPanel.tsx` creado; muestra `WfmOperatingHoursManager` con `canEdit` según rol. 3 tests en verde.
- **Deduplicación Organización**: `OrganizationSettingsClient` eliminó 4 paneles de calendario duplicados y código muerto. Link banner hacia `/dashboard/settings/calendar` agregado.
- **Deduplicación Field Operations**: `FieldOperationsSettingsClient` eliminó `WfmOperatingHoursManager` duplicado. Link banner hacia calendario agregado.
- **Eventualidades operativas**: entidad `wfm_operational_eventualities` (migration 042), service `OperationalEvenualitiesService`, 4 endpoints CRUD en `wfm.controller.ts`, tipos e interface en `api-client.ts`, `OperationalEventualitiesPanel.tsx` con 11 tests en verde.
- **E2E**: `e2e/tests/portal-settings-calendar.spec.ts` con 6 escenarios: navegación, paneles visibles, tabla de eventualidades, creación, confirmación de estado, y ausencia de términos laborales prohibidos.

### Evidencia de calidad

- Portal unit tests: 19/19 en verde (`OperationalEventualitiesPanel` + `CalendarSettingsClient`).
- `pnpm --filter @iwana/portal typecheck` sin errores en archivos modificados.
- Checklist `CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md` cerrado.

### Deuda residual documentada

- **Task 4 diferida**: `BusinessHoursWeekEditor` reutilizable no fue necesario para el alcance del sprint; cada panel maneja su editor inline. Se puede extraer en Fase 07 si se requiere.
- **Playwright E2E**: requiere servidor de desarrollo activo para ejecutar (`pnpm dev`). No se incluye en CI sin backend mock dedicado.
- **Jornada 42h**: no automatizada. Queda como futura con verificación oficial antes de implementar cumplimiento.
- **HcmAbsenceReadPort**: no implementado. Owner futuro de ausencias personales sigue siendo RR. HH.

### Estado de ADR-042

Aprobado. Decisión: tabla nueva `wfm_operational_eventualities` (Option A). No se usan licencias, incapacidades, vacaciones ni permisos en WFM.

### Contexto de negocio validado

Se valida la necesidad de crear una seccion visible **Calendario operativo y jornadas** para que el tenant administre horarios de empresa, horarios por sede, cierres, aperturas, ventana tecnica y eventualidades operativas desde un punto coherente.

La aclaracion funcional distingue tres conceptos que no deben mezclarse:

- **Horario operativo**: ventana base de empresa o sede.
- **Eventualidad operativa puntual**: variacion operacional causada por visita, falla, entrada anticipada, extension de jornada, bloqueo o emergencia.
- **Ausencia laboral**: licencia, incapacidad, vacaciones o permiso, cuyo owner futuro sera RR. HH.

### Decision EM-ARCH

Se abre Fase 06 en estado **En revision** con los siguientes artefactos:

- ADR propuesto: `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md`
- Spec: `docs/specs/2026-05-23-mod00-calendario-operativo-jornadas-design.md`
- Plan: `docs/plans/2026-05-23-mod00-configuracion-fase-06-calendario-operativo-jornadas.md`
- Prompt: `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-06-v1.0.md`
- Checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-06-v1.0.md`

La fase queda condicionada a decision stop/go antes de codigo productivo:

1. aprobar o ajustar ADR-042;
2. decidir si eventualidades usan tabla nueva `wfm_operational_eventualities` o una transicion acotada sobre `technician_availability`;
3. confirmar que no se modelaran licencias, incapacidades, vacaciones ni permisos en WFM;
4. mantener RR. HH. futuro como owner de ausencias personales y control formal de jornada.

### Alcance propuesto

- Agregar seccion federada `calendar` al shell de settings.
- Crear ruta `/dashboard/settings/calendar`.
- Extraer editores principales de horarios desde Organizacion.
- Evitar duplicidad de horarios en Field Operations.
- Incorporar primera UI/API de eventualidades operativas puntuales segun decision stop/go.
- Documentar futuro puerto `HcmAbsenceReadPort` para consumo de ausencias aprobadas por RR. HH.

### Riesgos a vigilar

- No reintroducir por otro nombre las Excepciones por tecnico retiradas por ADR-041.
- No presentar eventualidades operativas como horas extra liquidables o ausencias laborales.
- No automatizar cumplimiento de jornada 42h sin verificacion oficial y sin modulo RR. HH. aprobado.
- No crear un calendario transversal comun sin ADR nuevo y aprobacion CTO.

### Criterio de salida esperado

- ADR-042 aprobado o ajustado.
- Checklist Fase 06 con gates cerrados o bloqueos explicitos.
- Pruebas backend/frontend/E2E en verde segun alcance implementado.
- Informe vivo actualizado con evidencia real y deuda residual.

## 21. Refinamiento arquitectonico Organization - modal unificado de sede y servicios

### Fecha del refinamiento

2026-05-23

### Estado

Implementado y validado en backend y portal.

### Decision EM-ARCH del refinamiento

Se documenta el siguiente refinamiento para la siguiente iteracion de MOD00:

1. retirar la edicion permanente de `Servicios de la sede` desde el panel lateral de Organizacion;
2. mover servicios al mismo modal de crear/editar sede;
3. estructurar el modal con tabs `Informacion de la sede` y `Servicios`;
4. extender create/update de sedes con `capabilities` opcional;
5. persistir sede y servicios en una sola transaccion cuando el payload incluya capacidades.

La decision no cambia ownership ni boundaries fuera de MOD00. Su objetivo es reducir saturacion visual y eliminar el doble guardado actual entre modal y panel lateral.

### Artefactos creados

- `docs/specs/2026-05-23-mod00-organization-site-modal-unificado-design.md`
- `docs/adrs/ADR-043-Edicion-Atomica-Sede-Capacidades.md`
- `docs/plans/2026-05-23-mod00-organization-site-modal-unificado.md`

### Guardrails aprobados

- `capabilities` omitido en `PATCH` conserva compatibilidad hacia atras.
- `capabilities: []` en `PATCH` limpia el set activo de servicios.
- el endpoint `PUT /organization/sites/:siteId/capabilities` se retira una vez validado el flujo unificado sin callers activos.
- la auditoria de create/update debe reflejar snapshot consolidado de sede y capacidades.
- la UI nueva no debe depender de un segundo modal ni de un guardado lateral separado.

### Estado del handoff

Spec aprobado por usuario. Plan de implementación ejecutado para backend, portal y pruebas focalizadas.

### Implementacion ejecutada

- `apps/api/src/modules/organization/dto/organization-site.dto.ts` ahora acepta `capabilities` opcional en create/update con validaciones de array, enum y unicidad.
- `apps/api/src/modules/organization/organization.controller.ts` retira `PUT /organization/sites/:siteId/capabilities` y mantiene create/update como unicas mutaciones publicas para datos base + servicios.
- `apps/api/src/modules/organization/organization.service.ts` absorbio la persistencia de capacidades dentro de `create()` y `update()` usando la misma transaccion tenant-aware.
- `apps/portal/src/lib/api-client.ts` expone `capabilities` en los DTOs de creacion y edicion de sede, y elimina el cliente tipado del endpoint legacy.
- `apps/portal/src/components/settings/OrganizationSettingsClient.tsx` mueve servicios al mismo modal con tabs `Información de la sede` y `Servicios`, elimina el guardado lateral como flujo primario y mantiene una vista principal mas compacta.

### Evidencia de validacion

- `apps/api/src/modules/organization/organization.controller.http.spec.ts` y `apps/api/src/modules/organization/organization.service.spec.ts`: 17 pruebas en verde.
- `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`: 7 pruebas en verde.
- Validacion integrada: 24 pruebas focalizadas en verde entre backend y portal.
- Cierre de deuda legacy: 18 pruebas focalizadas en verde tras retirar controller, service entrypoint y cliente tipado del endpoint separado.
- `pnpm --filter @iwana/api typecheck` en verde.
- `pnpm --filter @iwana/portal typecheck` en verde.
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-organization-access.spec.ts` en verde.
- `get_errors` sin diagnosticos en todos los archivos modificados del slice.

### Cierre de deuda residual

- No quedan callers activos ni contrato expuesto para `PUT /organization/sites/:siteId/capabilities` dentro del slice de MOD00 validado en portal, API y E2E.
