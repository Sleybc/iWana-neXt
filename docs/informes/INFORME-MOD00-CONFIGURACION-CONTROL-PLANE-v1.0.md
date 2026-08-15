# INFORME - MOD00 Configuracion Control Plane - Aprobacion y Handoff Fase 01

**Version:** 1.60
**Estado:** Activo
**Fecha:** 2026-08-15
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
10. La semantica visible de acceso queda fijada como `categoria base + perfil de acceso + accesos`; `AccessProfile` se expone como perfil de acceso y `UserRole` como categoria base.

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
| `docs/adrs/ADR-044-Separacion-OrganizationSite-NmsNode.md`                | Aprobado                | Boundary futuro entre sedes MOD00 y nodos tecnicos NMS         |
| `docs/specs/2026-05-23-mod00-sedes-nodos-nms-design.md`                   | Aprobado                | Soporte funcional y tecnico para el refinamiento Site -> NMS   |
| `docs/specs/2026-05-23-mod00-organization-site-modal-unificado-design.md` | Aprobado                | Refinamiento UX de tabla compacta y modal unificado de sedes   |
| `docs/specs/2026-05-25-mod00-roles-de-empresa-design.md`                  | Aprobado para ejecucion | Refinamiento de categoria base + rol de empresa para fullstack |
| `docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md`               | Actualizado             | Addendum de compatibilidad WFM -> MOD00                        |
| `docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md`                    | Actualizado             | Antecedente historico MOD03                                    |

Plan reciente ejecutado:

- `docs/plans/2026-05-23-mod00-sedes-coordenadas-contacto-implementation.md` - refinamiento ejecutado para contrato, persistencia tenant y formulario portal de sedes en MOD00.

Artefactos Fase 06 aprobados:

- `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md` - **Propuesto** (corregido 2026-07-19 vía ADR-056: este informe lo declaraba "Aprobado" aquí y "pendiente" en las líneas 432, 458 y 481; el archivo dice Propuesto).
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

Actualizacion v1.17: se redacto el boundary propuesto entre `OrganizationSite` y futuro `NmsNode`. La direccion documentada mantiene sedes como maestro transversal de MOD00, reserva los nodos tecnicos para NMS y deja trazado que coordenadas y contacto operativo local pertenecen al dato maestro de sede. La propuesta queda en revision mediante `ADR-044` y la spec `2026-05-23-mod00-sedes-nodos-nms-design.md`.

Actualizacion v1.18: CTO aprueba `ADR-044` y la spec asociada. Queda formalizado que MOD00 conserva sedes como maestro fisico/administrativo, NMS sera owner de nodos tecnicos propios y el siguiente refinamiento implementable de MOD00 debe agregar coordenadas y contacto operativo local al contrato y al formulario de sedes. Se crea el plan `docs/plans/2026-05-23-mod00-sedes-coordenadas-contacto-implementation.md` como handoff para ejecucion.

Actualizacion v1.20: se alinea documentalmente el dominio de acceso a la lectura operativa validada con negocio: `UserRole` se presenta como categoria base, `AccessProfile` se expone como rol de empresa y el sistema debe ofrecer plantillas iniciales de roles de empresa para acelerar la adopcion. Se publica la spec `docs/specs/2026-05-25-mod00-roles-de-empresa-design.md` como handoff de ejecucion fullstack sin cambiar el boundary aprobado por ADR-040.

Actualizacion v1.21: se ejecuta el refinamiento fullstack de roles de empresa sin alterar el boundary aprobado. El backend ahora siembra plantillas iniciales tenant-aware al listar perfiles, el portal expone la semantica visible `categoria base + rol de empresa + permisos`, la pantalla de usuarios permite asignar roles de empresa compatibles durante create/edit y la validacion queda cerrada con Jest focalizado y Playwright portal sobre settings access y users.

Actualizacion v1.22: se corrige un drift de UX y handoff detectado al inspeccionar la pantalla real `/dashboard/settings/access` junto con producto. El PRD ya separaba ownership entre Access y Users, pero el spec y el plan vigentes todavia dejaban dentro de Access la asignacion de usuarios y los permisos efectivos por usuario. Queda aprobado que `/dashboard/settings/access` sea exclusivamente la superficie de plantillas iniciales, roles de empresa y permisos; la asignacion de roles a usuarios permanece en `/dashboard/users`. Se actualizan la spec `docs/specs/2026-05-25-mod00-roles-de-empresa-design.md` a v1.1 y el plan `docs/plans/2026-05-25-mod00-roles-de-empresa-implementation.md` como nuevo handoff ejecutable para fullstack.

Actualizacion v1.40: se completa un nuevo refinamiento de lenguaje visible en `/dashboard/settings/access` para reducir nombres internos o poco claros en plantillas y categorias base. El portal ahora presenta etiquetas de negocio mas directas dentro de Access, mientras que el backend renombra las plantillas canonicas del sistema a `Monitoreo operativo`, `Soporte inicial`, `Técnico de campo`, `Contratista` y `Auditor`. Para evitar duplicados durante el cambio, el seed de plantillas deja de depender solo del nombre y tambien reconoce plantillas existentes por `baseRoleConstraint` del sistema antes de sincronizar el nombre canonico. La validacion queda cerrada con Jest focalizado en servicio y controlador HTTP, Jest del cliente portal y Playwright del flujo `portal-settings-access-governance`.

Actualizacion v1.41: se formaliza la regla transversal de vocabulario del sistema mediante `.github/instructions/system-vocabulary.instructions.md` y la skill `.agents/skills/system-vocabulary-review/SKILL.md`. El portal centraliza labels compartidos en `apps/portal/src/lib/system-vocabulary.ts` y la pantalla `/dashboard/users` queda alineada con Access usando `Perfiles de acceso`, `categoria base`, `Monitoreo operativo`, `Soporte inicial` y `Técnico de campo` en lugar de nombres legacy o siglas internas. Esta regla aplica a nuevas auditorias, secciones, modulos, seeds, docs, tests y E2E con texto visible o semivisible.

Actualizacion v1.42: se amplia la regla transversal de vocabulario para exigir no solo consistencia terminologica, sino lenguaje amigable y operable para usuario final no tecnico. La instruccion y la skill ahora obligan a escribir frases cortas, orientadas a accion, con explicacion simple cuando un termino tecnico sea inevitable. El criterio queda aplicable a UI, estados vacios, errores, seeds, auditorias, documentos, tests y E2E.

Actualizacion v1.43: se formaliza la identidad operativa iWana como regla transversal para nuevas interfaces, se crea la skill `.agents/skills/iwana-identity-ui-review/SKILL.md` y se actualizan las instrucciones frontend/portal y `AGENTS.md`. La pantalla `/dashboard/settings/access` queda como referencia incremental: usa eyebrow compartido, search surface iWana, toolbar responsive, drawer con mejor jerarquia y vocabulario final basado en `perfiles de acceso`, `categoria base` y `accesos`.

Actualizacion v1.44: se integra `ui-ux-pro-max` como apoyo consultivo para heuristicas UI/UX, tipografia, color, responsive, interaccion, accesibilidad y performance visual. La skill queda subordinada a `iwana-identity-ui-review`, al manual de identidad, a los tokens reales y a las primitives del repo; su uso recomendado es ampliar criterio sin desplazar la gobernanza visual iWana.

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
- CA-CFG3-03: Billing se mantiene como estado no disponible y Comercial deja de publicarse dentro del shell, sin formularios falsos ni rutas ambiguas en Configuración.
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

### Fecha del refinamiento - tabla compacta unificada

2026-05-23

### Estado - tabla compacta unificada

Implementado y validado en backend y portal.

### Decision EM-ARCH del refinamiento - tabla compacta unificada

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

### Guardrails aprobados - tabla compacta unificada

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

## 22. Refinamiento arquitectonico Organization - tabla compacta unificada de sedes

### Fecha de ejecucion

2026-05-25

### Estado del cierre

Aprobado como direccion arquitectonica/UI. No requiere ADR nuevo.

### Decision EM-ARCH del refinamiento

Se aprueba acotar la superficie `Sedes registradas` a una sola tabla compacta de administracion, manteniendo el modal unificado como flujo de creacion y edicion.

La decision fija estas reglas:

1. `Sedes registradas` no debe usar un panel persistente separado de `Detalle de sede`.
2. La vista principal debe mostrar solo columnas utiles para administracion base: `Sede`, `Tipo`, `Ubicacion`, `Servicios`, `Estado` y `Acciones`.
3. Las acciones `Editar` y `Dar de baja` deben vivir por fila y no depender de seleccionar previamente una sede.
4. Coordenadas, contacto operativo local y otros datos ampliados siguen existiendo en el formulario, pero no se promueven a columnas permanentes de la tabla.
5. Horarios, recaudo, seguimiento de clientes y otros detalles operativos deben resolverse en modulos consumidores posteriores, no sobrecargando esta pantalla de MOD00.

### Justificacion arquitectonica

La sede sigue siendo el maestro transversal que despues alimentara otros modulos, pero esta pantalla no es el lugar correcto para visualizar toda su proyeccion operativa futura. En MOD00 la responsabilidad principal de esta superficie es crear, identificar y administrar sedes con baja friccion visual, manteniendo consistencia con ADR-040, ADR-043 y ADR-044.

### Impacto documental

- Se actualiza `docs/specs/2026-05-23-mod00-organization-site-modal-unificado-design.md` a version 1.1 y estado `Aprobado`.
- Se actualiza `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` para reflejar una tabla compacta unica sin panel persistente de detalle.
- Este informe vivo incorpora la trazabilidad del refinamiento.
- No se requiere actualizar PRD ni crear ADR nuevo.

### Guardrails aprobados

- La tabla principal de sedes se mantiene como superficie administrativa, no como tablero operativo profundo.
- El modal unificado sigue siendo obligatorio para crear/editar sede y servicios en una sola intencion de usuario.
- El refinamiento no cambia ownership, boundaries, permisos ni contratos cross-module.
- Cualquier modulo futuro que consuma `OrganizationSite` debe proyectar su propio detalle operativo en su contexto y no reabrir un panel persistente en MOD00 por inercia.

## 23. Ejecucion refinamiento roles de empresa

### Fecha del refinamiento

2026-05-25

### Estado

Ejecutado y validado.

### Implementacion del refinamiento

- En `apps/api/src/modules/access-control` se agregaron plantillas iniciales de roles de empresa (`MOD00_ACCESS_V1_SYSTEM_ROLE_TEMPLATES`) y se garantiza su seed idempotente al consultar perfiles, manteniendo `UserRole` como categoria base fija y `AccessProfile` como rol de empresa configurable.
- En `apps/portal/src/components/settings` se renombro la experiencia visible de access governance a `Roles de empresa`, se separaron plantillas iniciales de roles personalizados y se alinearon textos de permisos efectivos y shortcuts con la semantica aprobada.
- En `apps/portal/src/components/users` se incorporo seleccion de roles de empresa compatibles en los modales de crear y editar usuario, con preview de permisos efectivos y coordinacion segura de create/update + asignacion de perfiles desde `UsersClient`.
- En `e2e/tests` se ajustaron mocks y expectativas para reflejar la nueva dependencia de Users respecto a Access Control y la nueva terminologia visible del portal.

### Validacion ejecutada

- Backend Jest focalizado en verde: `apps/api/src/modules/access-control/access-control.service.spec.ts` y `apps/api/src/modules/access-control/access-control.controller.http.spec.ts`.
- Portal Jest focalizado en verde: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`, `apps/portal/src/components/settings/SettingsClient.spec.tsx`, `apps/portal/src/components/users/company-role-preview.spec.ts`, `apps/portal/src/components/users/CreateUserModal.spec.tsx` y `apps/portal/src/components/users/EditUserModal.spec.tsx`.
- Playwright portal en verde: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-governance.spec.ts`.
- Corrida Playwright combinada validada para el slice: `e2e/tests/portal-users.spec.ts` paso en la corrida conjunta junto con access governance despues de completar los mocks requeridos por Users.
- `get_errors` sin diagnosticos en los archivos E2E ajustados al cierre del refinamiento.

### Observaciones de seguimiento no bloqueantes

- Revisar en iteracion posterior si `ensurePermissionCatalogSeeded()` debe seguir reactivando permisos existentes con `isActive = true` de forma incondicional.
- Evaluar si `listProfiles()` debe excluir perfiles inactivos por defecto o mantenerlos visibles segun la politica operativa final.

---

## 24. Ejecucion completada: pantalla Access rediseñada

### v1.23 — 2026-05-25 — Ejecucion completada: pantalla Access rediseñada

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Implementacion frontend

Se ejecuto el plan `docs/plans/2026-05-25-mod00-roles-de-empresa-implementation.md` en 5 tareas usando subagent-driven-development.

**Cambios realizados en `apps/portal/src/components/settings/`:**

- `AccessControlSettingsClient.tsx`: eliminados bloques `Asignacion de roles` y `EffectivePermissionsPanel`; plantillas convertidas en cards accionables con `Ver accesos` y `Usar como base`; `Crear rol` abre selector de dos opciones (`Usar una plantilla` / `Empezar desde cero`); editor de permisos agrupado por modulo con `Limpiar permisos` y `Restablecer cambios`; `ProfileChangeEvidence` movido fuera del grid como bloque standalone.
- `mod00-settings-labels.ts`: `pageSubtitle` y `loadingSubtitle` alineados al nuevo scope.
- `AccessControlSettingsClient.spec.tsx`: 5 tests nuevos, 3 tests actualizados; 11 tests pasan.

**Correccion de tipo:** `draftPermissionKeys` cambiado de `string[]` a `AccessPermissionKey[]`; eliminado cast `never[]`.

**E2E:**

- `portal-settings-access-governance.spec.ts`: primer test renombrado a `muestra plantillas, roles y evidencia auditada sin asignacion de usuarios`; eliminadas aserciones de `EffectivePermissionsPanel`; validaciones actualizadas para reflejar cards con `Usar como base` e inexistencia de selector `Usuario`.
- `portal-users.spec.ts`: test de regresion de ownership añadido — confirma que `/dashboard/users` expone tabla editable y selector de categoria base, documentando que la asignacion de roles vive en Users y no en Settings/Access.

**Estado:** Definition of Done alcanzada. Tests Jest: 11/11. Boundary ADR-040 respetado.

## 25. Refinamiento visual posterior: editor por modulo y retiro del catalogo

### v1.24 — 2026-05-25 — Access centrado en permisos elegibles por modulo

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento UX frontend

Se refino la pantalla `/dashboard/settings/access` para reducir saturacion visual y mejorar escalabilidad futura del editor de permisos.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: se retiro por completo la seccion `Catalogo de permisos`; el panel `Permisos del rol` dejo de renderizar una lista vertical interminable y ahora usa tabs por modulo con contador `activos/total`, navegacion por teclado y foco en un solo dominio a la vez.
- `AccessControlSettingsClient.spec.tsx`: el test del editor paso de validar agrupacion vertical a validar tabs por modulo y ausencia del catalogo completo.
- `mod00-settings-labels.ts`: se retiraron labels huérfanos del catalogo ya eliminado.
- `SettingsAccessShortcuts.tsx`: el copy del acceso rapido a Roles de empresa ya no menciona asignaciones por usuario y ahora describe permisos elegibles por modulo.
- `portal-settings-access-governance.spec.ts`: se añadió validacion E2E para confirmar que la ruta ya no expone el heading `Catalogo de permisos`.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 11/11 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** la pantalla queda centrada en la tarea real del administrador tenant: diseñar roles usando solo permisos elegibles y navegables por modulo, sin referencia redundante al catalogo completo.

### v1.25 — 2026-05-25 — Afinado del editor por modulo

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento UX frontend

Se aplico un segundo ajuste de densidad sobre el editor de permisos para mejorar foco operativo dentro del modulo activo.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: el modulo activo inicial ahora se elige segun el bloque con mas permisos ya asignados al rol, en lugar de caer siempre en el primer modulo elegible.
- `AccessControlSettingsClient.tsx`: se agrego busqueda local dentro del modulo activo para filtrar rapidamente permisos por descripcion, con estado vacio explicito cuando no hay coincidencias.
- `AccessControlSettingsClient.spec.tsx`: el test del editor ahora valida seleccion inicial inteligente del tab y filtro dentro del modulo visible.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 11/11 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** el administrador entra directamente al modulo mas relevante del rol seleccionado y ya no necesita escanear manualmente listas completas dentro del tab activo.

### v1.26 — 2026-05-25 — Compactacion visual de plantillas iniciales

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento UX frontend

Se ajusto la composicion del bloque `Plantillas iniciales` para reducir altura visual y mejorar densidad de escaneo en el primer viewport.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: las cards de plantillas se compactaron con acciones `Ver accesos` y `Usar como base` alineadas en la franja superior de cada tarjeta.
- `AccessControlSettingsClient.tsx`: la grilla paso a un comportamiento mas denso en desktop grande, con hasta 4 columnas cuando existe volumen suficiente de plantillas, pero degradando dinamicamente cuando hay menos tarjetas para no comprimir el contenido.
- `AccessControlSettingsClient.tsx`: se redujo el footprint visual de los botones superiores y se estabilizo la altura de la descripcion para mantener ritmo uniforme entre tarjetas.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 11/11 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** el bloque de plantillas ocupa menos altura, mejora el escaneo operativo y conserva la accion primaria visible sin degradar responsive ni accesibilidad.

### v1.27 — 2026-05-25 — Vista previa de plantilla desacoplada de la card

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento UX frontend

Se retiro la expansion inline de `Ver accesos` dentro de cada card de plantilla para evitar saltos de altura y mantener la grilla estable.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: la accion `Ver accesos` ya no expande contenido dentro de la tarjeta. Ahora abre un panel unico de vista previa debajo de la grilla de plantillas.
- `AccessControlSettingsClient.tsx`: el panel de vista previa muestra nombre de la plantilla, descripcion, metadata compacta y lista de permisos en una superficie separada con accion `Cerrar vista previa`.
- `AccessControlSettingsClient.tsx`: las cards conservan altura uniforme aun cuando se consulta una plantilla, mejorando el ritmo visual del bloque completo.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 11/11 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** las plantillas quedan mas estables visualmente, el escaneo del grid ya no se rompe al abrir detalles y la vista previa sigue disponible sin sacrificar densidad.

---

### v1.28 — 2026-05-25 — Cierre de 4 gaps de audit visual (mini-spec AI-SR-UI-SYS)

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Cierre de deuda UX — 4 items del audit visual

Conversion del mini-spec de cierre en plan de implementacion y ejecucion directa sobre `AccessControlSettingsClient.tsx`.

**Cambios realizados:**

- `mod00-settings-labels.ts`: agregada entrada `'access-control': 'Control de acceso'` al mapper `getAccessModuleLabel`. El modulo ya no aparece como clave tecnica cruda en las pestanas de permisos.
- `AccessControlSettingsClient.tsx`: botones de plantilla con nombres accesibles contextuales — `aria-label={\`Ver accesos de ${profile.name}\`}` y `aria-label={\`Usar ${profile.name} como base\`}`. Texto visible sin cambio para mantener densidad de la card.
- `AccessControlSettingsClient.tsx`: badge `Sistema` rebajado visualmente — eliminado fondo `bg-gray-100`, reducido a `text-[10px] font-normal uppercase tracking-wide text-gray-400`. Jerarquia visual ahora subordinada al nombre de la plantilla.
- `AccessControlSettingsClient.tsx`: el panel de vista previa debajo de la grilla reemplazado por un **drawer lateral derecho** — patron identico a `AssuranceTicketDrawer.tsx`. Overlay `fixed inset-0 z-[1200] bg-black/45`, `aside` con `max-w-lg` posicionado `inset-y-0 right-0`. Escape cierra el drawer y restaura `overflow-hidden` del body. El drawer tiene header con nombre/descripcion/metadata, listado scrollable de permisos y footer con accion `Usar [nombre] como base` que abre el dialogo de creacion pre-relleno.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 11/11 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** los 4 gaps del audit visual quedan cerrados. La pantalla cumple ahora con los criterios de cierre del mini-spec de AI-SR-UI-SYS.

---

### v1.29 — 2026-05-26 — Tablist de módulos escalable con señales de overflow

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento UX frontend guiado por criterio AI-SR-UI-SYS

Se evoluciono el tablist horizontal del editor de permisos para soportar crecimiento de módulos sin cambiar el modelo mental de la pantalla. La dirección elegida fue mantener scroll horizontal y mejorar descubribilidad/operabilidad.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: agregado contenedor de tabs con detección de overflow horizontal mediante `scrollWidth`, `clientWidth` y `scrollLeft`.
- `AccessControlSettingsClient.tsx`: añadidas señales visuales de continuidad con gradientes laterales y controles de desplazamiento izquierdo/derecho cuando existen módulos fuera de vista.
- `AccessControlSettingsClient.tsx`: el tab activo ahora ejecuta `scrollIntoView()` de forma segura para mantenerse visible al navegar por click o teclado.
- `AccessControlSettingsClient.tsx`: se mantuvo intacta la navegación accesible del tablist (`Arrow`, `Home`, `End`, roving focus, focus-visible`).
- `AccessControlSettingsClient.spec.tsx`: nuevo test unitario para cubrir aparición de controles de scroll en overflow horizontal del tablist.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** el editor de permisos ya escala mejor cuando aumente la cantidad de módulos. El usuario conserva continuidad visual, descubre con mayor claridad que existen más pestañas y no pierde de vista el módulo activo.

---

### v1.30 — 2026-05-26 — Pulido visual del tablist según identidad iWana

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento visual frontend guiado por manual de identidad

Se ajustó la presencia visual de las affordances del tablist de módulos para alinearlas mejor con la identidad corporativa iWana: minimalismo equilibrado, contraste suave, bordes redondeados y acentos de marca medidos.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: el contenedor horizontal de tabs ahora usa la utilidad `no-scrollbar` del design system en lugar de utilidades inline de ocultación de scrollbar.
- `AccessControlSettingsClient.tsx`: los gradientes laterales de overflow fueron suavizados para integrarse con las superficies del portal y con los acentos `iwana-primary` / `iwana-secondary` de forma sutil.
- `AccessControlSettingsClient.tsx`: los botones laterales de scroll fueron refinados con borde leve de marca, fondo translúcido, blur suave y texto `iwana-primary-700`, reduciendo el aspecto de control técnico superpuesto.
- `AccessControlSettingsClient.tsx`: se conservaron intactos el foco visible, el contraste accesible y la operabilidad por teclado previamente implementados.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `AccessControlSettingsClient.tsx` — sin errores.

**Resultado:** el patrón escalable del tablist ahora se percibe más coherente con la imagen visual del proyecto y menos como una capa técnica añadida, sin perder claridad operativa ni accesibilidad.

---

### v1.31 — 2026-05-26 — Cabecera de “Permisos del rol” más alineada a iWana

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento visual frontend guiado por AI-SR-UI-SYS

Se refinó la cabecera del panel `Permisos del rol` para reducir la sensación de bloque genérico y acercarla al lenguaje visual del portal: jerarquía más clara, copy más directo y toolbar de acciones con mejor integración formal.

**Cambios realizados:**

- `mod00-settings-labels.ts`: la descripción dinámica del panel se compactó a `Administra por módulo los permisos del rol de empresa [nombre]`, reduciendo carga verbal y mejorando escaneo.
- `AccessControlSettingsClient.tsx`: el panel ahora usa `eyebrow="Control de acceso"`, alineándolo con la gramática visual del portal usada en otros bloques con identidad más marcada.
- `AccessControlSettingsClient.tsx`: la barra de acciones (`Limpiar`, `Restablecer`, `Guardar`) se encapsuló en una superficie pill sutil con borde y fondo suave, en lugar de quedar flotando como grupo suelto.
- `AccessControlSettingsClient.tsx`: los botones secundarios se redondearon para integrarse con la morfología iWana; el CTA `Guardar permisos` ganó una presencia más premium mediante sombra suave sin alterar su jerarquía funcional.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `AccessControlSettingsClient.tsx` y `mod00-settings-labels.ts` — sin errores.

**Resultado:** la entrada al editor de permisos se percibe más coherente con el sistema visual iWana y con la identidad del portal, sin introducir más complejidad ni romper el flujo existente.

---

### v1.32 — 2026-05-26 — Tabla de roles personalizados con mejor jerarquía operativa

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento visual frontend guiado por AI-SR-UI-SYS + exploración de agentes

Se refinó la tabla `Roles personalizados` para acercarla al nivel visual del panel de permisos: mejor lectura de selección, metadata más escaneable y acciones más compactas sin cambiar el comportamiento funcional.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: las filas ahora muestran `hover` suave y transición de color, aportando feedback visual de interacción.
- `AccessControlSettingsClient.tsx`: el rol seleccionado ganó un indicador más claro mediante borde izquierdo con acento `iwana-secondary` y refuerzo de superficie en la primera celda.
- `AccessControlSettingsClient.tsx`: `Categoría base`, `Permisos` y `Estado` pasaron a presentarse como pills compactas para mejorar escaneo horizontal y consistencia con otros listados del portal.
- `AccessControlSettingsClient.tsx`: las acciones inline (`Configurar`, `Editar`, eliminar) se agruparon en una superficie pill sutil, reduciendo ruido visual y reforzando coherencia con el toolbar del panel derecho.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `AccessControlSettingsClient.tsx` — sin errores.

**Resultado:** la tabla se percibe menos plana, comunica mejor qué rol está activo y queda más alineada con el lenguaje visual operativo de iWana sin afectar el flujo ni la densidad útil.

---

### v1.33 — 2026-05-26 — Pase final de consistencia visual para cierre del portal

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Cierre visual final frontend guiado por AI-SR-UI-SYS + agentes Explore

Se ejecutó un pase final de consistencia para cerrar la tarea del portal en `Roles de empresa`, con foco en jerarquía de headers, gobernanza de tokens y alineación formal con la identidad iWana.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: la sección de plantillas ganó `eyebrow="Plantillas base"`, reforzando su lectura como bloque de entrada separado y no como listado genérico.
- `AccessControlSettingsClient.tsx`: el panel izquierdo de `Roles personalizados` ganó `eyebrow="Roles de empresa"`, alineando su jerarquía con el panel derecho `Control de acceso`.
- `AccessControlSettingsClient.tsx`: se sustituyeron varios hardcodes de `#f8faf5` por tokens/clases semánticas basadas en `iwana-secondary-50`, mejorando consistencia con el manual de identidad.
- `AccessControlSettingsClient.tsx`: las superficies tipo toolbar que habían quedado demasiado `pill` se normalizaron hacia `rounded-2xl`, más coherente con la gramática visual predominante del portal.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `AccessControlSettingsClient.tsx` — sin errores.

**Resultado:** la pantalla `Roles de empresa` queda cerrada con una gramática visual más uniforme entre plantillas, tabla y panel de permisos, y con mejor adhesión al sistema visual iWana del portal.

---

### v1.34 — 2026-05-26 — Extracción de toolbar compartido para acciones del portal

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Consolidación UI compartida del portal

Como cierre técnico del refinamiento visual de `Roles de empresa`, se extrajo el patrón de toolbar de acciones a una primitiva compartida del portal para evitar duplicación local y estabilizar la gramática visual del módulo.

**Cambios realizados:**

- `portal-ui.tsx`: agregado `PortalActionToolbar`, una primitiva compartida para agrupar acciones operativas en una superficie `rounded-2xl` con borde y fondo suave alineados al sistema visual iWana.
- `AccessControlSettingsClient.tsx`: el toolbar de acciones del panel `Permisos del rol` ahora consume `PortalActionToolbar` en lugar de markup inline.
- `AccessControlSettingsClient.tsx`: el grupo de acciones de la tabla `Roles personalizados` también consume `PortalActionToolbar`, eliminando duplicación del patrón visual dentro del mismo módulo.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `portal-ui.tsx` y `AccessControlSettingsClient.tsx` — sin errores.

**Resultado:** el módulo Access queda cerrado no solo a nivel visual, sino también con una mejora concreta de mantenibilidad dentro del portal: el patrón de toolbar ya vive en una primitiva reutilizable y coherente con la identidad iWana.

---

### v1.35 — 2026-05-26 — Overlay de modales corregido para todo el portal

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Corrección visual transversal guiada por AI-SR-UI-SYS

Tras revisar las capturas del portal, se corrigió la inconsistencia de los modales que no oscurecían o difuminaban correctamente el shell completo. La causa raíz estaba en el `Dialog` compartido de `@iwana/ui`: overlay sin portal a `document.body`, z-index insuficiente frente al sidebar del portal y tratamiento visual más débil que otros modales del producto.

**Cambios realizados:**

- `packages/ui/src/components/Dialog.tsx`: `DialogContent` ahora se renderiza vía `createPortal(..., document.body)`, evitando quedar atrapado en el stacking context del layout del portal.
- `packages/ui/src/components/Dialog.tsx`: el overlay subió por encima del shell del portal con `z-10000` y el contenido con `z-10001`, superando el `Sidebar` (`z-[9999]`).
- `packages/ui/src/components/Dialog.tsx`: el fondo del overlay se reforzó a `bg-black/55` y se añadió `backdrop-blur-sm`, alineando el modal compartido con la densidad visual ya usada en otros modales del portal.
- `packages/ui/src/components/Dialog.tsx`: al abrir un diálogo se bloquea scroll del `body`, mejorando sensación modal y consistencia operativa.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `packages/ui/src/components/Dialog.tsx` — sin errores.

**Resultado:** los modales del portal ahora oscurecen y difuminan correctamente toda la pantalla, incluyendo el shell lateral, eliminando la inconsistencia visual observada en las capturas.

---

### v1.36 — 2026-05-26 — Overlay del drawer de plantillas alineado al shell del portal

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Corrección visual puntual guiada por AI-SR-UI-SYS

Tras la corrección del `Dialog` compartido, se detectó un segundo caso independiente en `Roles de empresa`: el drawer lateral de vista previa de plantilla seguía usando un overlay local con `z-index` inferior al sidebar del portal, por lo que el shell lateral permanecía demasiado visible.

**Cambios realizados:**

- `AccessControlSettingsClient.tsx`: el overlay del drawer lateral de plantillas subió a `z-10000`, por encima del sidebar del portal (`z-[9999]`).
- `AccessControlSettingsClient.tsx`: el panel lateral asociado subió a `z-10001` para mantener la relación overlay/contenido.
- `AccessControlSettingsClient.tsx`: el overlay del drawer se reforzó visualmente a `bg-black/55` con `backdrop-blur-sm`, igualando el lenguaje modal ya aplicado al `Dialog` compartido.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `AccessControlSettingsClient.tsx` — sin errores.

**Resultado:** la vista previa lateral de plantillas ahora oscurece correctamente todo el shell del portal y deja de verse “lavada” o por debajo de la navegación lateral.

---

### v1.37 — 2026-05-27 — Pasada integral de copy empresarial claro en Access

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento UX y lenguaje visible guiado por AI-SR-UI-SYS

Se ejecutó una pasada integral de lenguaje visible sobre `/dashboard/settings/access` para reducir tecnicismo y alinear la narrativa del módulo con un modelo mental más claro para negocio: perfiles sugeridos, perfiles personalizados y accesos por sección.

La dirección quedó documentada en `docs/specs/2026-05-27-mod00-access-copy-design.md` y se implementó sin cambiar contratos backend, estructura funcional ni boundaries aprobados.

**Cambios realizados:**

- `mod00-settings-labels.ts`: se reemplazó la semántica visible principal de `roles de empresa + permisos + plantillas` por `perfiles de acceso + accesos + perfiles sugeridos`.
- `AccessControlSettingsClient.tsx`: se actualizaron títulos, descripciones, estados vacíos, CTA, labels, placeholders, copy de drawer y copy de diálogos para hablar en términos de negocio y no en taxonomía interna de Access Control.
- `AccessControlSettingsClient.tsx`: el editor lateral ahora habla de `secciones` y `accesos`, manteniendo la misma lógica de tabs, filtros y guardado.
- `AccessControlSettingsClient.spec.tsx` y `portal-settings-access-governance.spec.ts`: se alinearon los asserts accesibles y visibles con el nuevo copy del módulo.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en `AccessControlSettingsClient.tsx`, `mod00-settings-labels.ts` y la nueva spec de diseño — sin errores.

**Resultado:** el módulo Access mantiene el mismo comportamiento, pero ahora comunica con más claridad qué hace cada superficie y reduce el lenguaje interno que antes exigía contexto técnico para comprender la pantalla.

---

### v1.38 — 2026-05-27 — Reversión local del copy de plantillas en Access

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Ajuste visual puntual guiado por inspección de UI

Tras revisar la pantalla real de `/dashboard/settings/access`, se detectó que el nuevo copy aplicado al bloque de plantillas alargaba demasiado las tarjetas y debilitaba la lectura compacta de esa superficie. Por decisión de UX, ese slice puntual volvió al lenguaje anterior, sin revertir el resto de la pasada de copy del módulo.

**Cambios realizados:**

- `mod00-settings-labels.ts`: el panel volvió a `Plantillas iniciales` con su descripción anterior.
- `AccessControlSettingsClient.tsx`: el bloque de tarjetas volvió a `Plantillas base`, badge `Sistema`, acciones `Ver accesos` y `Usar como base`, conteo en `permisos` y fallback textual anterior.
- `AccessControlSettingsClient.tsx`: el drawer y la opción de creación desde plantilla también recuperaron su copy previo para mantener coherencia interna.
- `AccessControlSettingsClient.spec.tsx` y `portal-settings-access-governance.spec.ts`: se realinearon los asserts del slice revertido.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** el módulo conserva el nuevo lenguaje empresarial en el resto de la pantalla, pero el bloque de plantillas recupera la compacidad y jerarquía visual que funcionaban mejor antes del cambio.

---

### v1.39 — 2026-05-27 — Limpieza final de términos técnicos visibles en Access

**Autor:** AI-SR-FULL (Senior Developer Fullstack)
**Tipo:** Refinamiento de lenguaje visible orientado a usuario final

Se ajustó el lenguaje técnico que todavía podía filtrarse en `/dashboard/settings/access` desde el catálogo canónico y las plantillas del sistema. El objetivo fue evitar términos internos como `tenant`, `WFM`, `MOD00`, `guard`, `work orders`, `Users` o `matriz` en superficies visibles para negocio.

**Cambios realizados:**

- `access-control.constants.ts`: se simplificaron descripciones visibles del catálogo de permisos para hablar en términos de empresa, agenda de visitas, órdenes de trabajo y accesos disponibles.
- `access-control.constants.ts`: las plantillas del sistema dejaron de usar descripciones con `tenant` y adoptaron copy empresarial claro.
- `access-control.service.ts`: `ensureSystemRoleTemplatesSeeded()` ahora también refresca plantillas activas existentes cuando su descripción visible quedó desfasada frente al seed canónico.
- `mod00-settings-labels.ts`: la etiqueta de módulo `wfm` pasó de `WFM` a `Operaciones de campo` para evitar siglas internas en la navegación del editor.

**Validacion ejecutada:**

- Jest focalizado backend: `access-control.service.spec.ts` — 7/7 en verde.
- Jest focalizado backend: `access-control.controller.http.spec.ts` — 11/11 en verde.
- Jest focalizado portal: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Playwright focalizado portal: `portal-settings-access-governance.spec.ts` — 3/3 en verde.

**Resultado:** el módulo Access reduce de forma consistente el lenguaje interno de arquitectura o implementación y presenta un vocabulario más comprensible para un administrador de empresa desde la primera lectura.

---

### v1.43 — 2026-05-27 — Regla de identidad iWana y refinamiento operativo de Access

**Autor:** AI-SR-FULL (Senior Developer Fullstack)  
**Tipo:** Gobernanza visual, skill operativa y refinamiento UI incremental

Se ejecutó la opción aprobada para convertir la identidad visual iWana en regla reutilizable y aplicarla de forma incremental en `/dashboard/settings/access`. La dirección conserva la naturaleza operativa B2B del portal: interfaces limpias, jerarquía clara, tokens iWana, accesibilidad AA y copy amigable para usuarios no técnicos.

**Cambios realizados:**

- `.github/instructions/frontend.instructions.md` y `.github/instructions/portal.instructions.md`: se agregaron reglas para aplicar la identidad operativa iWana en nuevas pantallas, secciones y módulos.
- `.agents/skills/iwana-identity-ui-review/SKILL.md`: se creó una skill dedicada para revisar UI contra el manual de identidad, tokens reales, primitives portal, accesibilidad y vocabulario.
- `AGENTS.md` y `.agents/skills/tailwind-patterns/SKILL.md`: se enlazó la nueva disciplina visual y se reforzó el uso de tokens, glass selectivo y utilities compartidas.
- `packages/ui/src/styles/globals.css` y `portal-ui.tsx`: se agregaron `portal-eyebrow` y `portal-input-surface`, y `PortalActionToolbar` ahora responde mejor en mobile.
- `AccessControlSettingsClient.tsx`, `mod00-settings-labels.ts`, `ProfileChangeEvidence.tsx`, `EffectivePermissionsPanel.tsx` y `SettingsAccessShortcuts.tsx`: se alineó el lenguaje visible hacia `perfiles de acceso`, `categoria base` y `accesos`, con drawer y busqueda visualmente más consistentes con iWana.

**Validacion ejecutada:**

- Jest focalizado: `AccessControlSettingsClient.spec.tsx` — 12/12 en verde.
- Jest focalizado: `SettingsClient.spec.tsx` — 3/3 en verde.
- Playwright focalizado: `portal-settings-access-governance.spec.ts` — 3/3 en verde.
- Diagnósticos de editor en archivos tocados — sin errores.

**Resultado:** la identidad iWana queda formalizada como criterio de diseño futuro y Access funciona como una referencia práctica: más coherente visualmente, más responsive y con vocabulario más amable para administradores de empresa.

---

### v1.44 — 2026-05-27 — Integracion consultiva de ui-ux-pro-max

**Autor:** AI-SR-FULL (Senior Developer Fullstack)  
**Tipo:** Gobernanza de skills y apoyo UI/UX

Se incorporó `ui-ux-pro-max` al flujo de diseño del repo como biblioteca de apoyo para razonamiento UI/UX avanzado. Su alcance queda acotado: aporta heuristicas, patrones, tipografia, color, responsive, interaccion, accesibilidad y performance visual, pero no puede contradecir la identidad iWana ni el sistema visual implementado.

**Cambios realizados:**

- `AGENTS.md`: se añadió `ui-ux-pro-max` al dispatch de skills como apoyo UI/UX avanzado, subordinado a la identidad y componentes del repo.
- `.github/instructions/frontend.instructions.md`: se documentó que la skill puede apoyar decisiones UI/UX amplias sin reemplazar manual de identidad, tokens ni primitives.
- `.agents/skills/iwana-identity-ui-review/SKILL.md`: se agregó una sección de apoyo consultivo y precedencia para usar `ui-ux-pro-max` sin introducir drift visual.

**Validacion ejecutada:**

- Diagnósticos de editor en archivos tocados — sin errores.

**Resultado:** el equipo gana una segunda mirada UI/UX más amplia, manteniendo a iWana como fuente de verdad visual y operativa.

---

### v1.45 — 2026-05-27 — Auditoria EM-Architect sobre Seguridad, Users, Access y Mi perfil

**Autor:** AI-EM-ARCH  
**Tipo:** Auditoria de ownership, racionalizacion de control plane y plan de transicion

Se ejecuto una auditoria funcional y arquitectonica del subdominio visible de seguridad del portal usando las skills `architect-review`, `docs-architect` y `writing-plans`, apoyada por agentes Explore para contraste de codigo, docs y E2E.

**Hallazgos principales:**

- La ruta `/dashboard/settings/security` expone hoy una sola politica global: `mfa_required_all`.
- La misma politica global ya esta duplicada en `/dashboard/profile`, lo que contradice el ownership esperado de una vista personal.
- `/dashboard/users` concentra correctamente operaciones por cuenta: reset de contraseña, estado, MFA por usuario y asignacion de roles de empresa.
- `/dashboard/settings/access` ya es la superficie aprobada de gobierno de acceso del tenant; por coherencia, la politica MFA global debe aterrizar ahi y no como modulo independiente ni dentro de `Mi perfil`.

**Decision documental propuesta:**

1. Se crea `docs/adrs/ADR-045-Consolidacion-Politica-MFA-Global-en-Access.md` en estado **En revision**.
2. Se aprueba como direccion recomendada de arquitectura visible:
   - `Mi perfil` = seguridad personal.
   - `Users` = cuentas internas y operaciones por usuario.
   - `Access` = gobierno de acceso y politica MFA global del tenant.
3. La ruta `/dashboard/settings/security` queda recomendada para deprecacion controlada con transicion legacy hacia Access.

**Artefacto de ejecucion creado:**

- `docs/plans/2026-05-27-mod00-consolidacion-politica-mfa-en-access.md`

**Blast radius validado:**

- portal settings shell y registry de MOD00;
- `ProfileClient` y el toggle global duplicado;
- pruebas E2E de `portal-settings-empresa`, `portal-settings-federated-shell` y `portal-users`;
- documentacion pendiente de ajuste posterior a aprobacion CTO: PRD/HLD de MOD00 y HLD de MOD04.

**Decision de gobierno:**

No se actualizaron aun los PRD/HLD aprobados como fuente de verdad operacional porque la reubicacion visible de la politica MFA y la deprecacion de la ruta `Seguridad` requieren validacion CTO segun ADR-045. El informe vivo, el ADR en revision y el plan ya dejan trazabilidad suficiente para pasar a decision formal.

**Resultado:** queda resuelta la ambiguedad de analisis. La recomendacion EM-Architect no es conservar tres superficies para la misma capacidad, sino consolidar la politica global MFA en Access y retirar la duplicacion en Profile y la ruta Security una vez ADR-045 sea aprobada.

---

### v1.46 — 2026-05-27 — Ejecucion Sr. Fullstack de consolidacion MFA global en Access

**Autor:** AI-SR-FULL  
**Tipo:** Ejecucion fullstack, limpieza de deuda visible y validacion focalizada

Se ejecuto el plan de consolidacion de la politica MFA global del tenant dentro de `Access`, manteniendo el contrato persistido `mfa_required_all` y retirando la duplicacion visible entre `Security` y `Mi perfil`.

**Cambios implementados:**

- `apps/portal/src/components/settings/AccessControlSettingsClient.tsx` ahora carga `tenantSelfApi.getSettings()`, expone el bloque `Politicas de autenticacion` y guarda `mfa_required_all` desde `/dashboard/settings/access`.
- `apps/portal/src/components/settings/mod00-settings-labels.ts` centraliza el copy operativo del nuevo bloque MFA dentro de Access.
- `apps/portal/src/components/profile/ProfileClient.tsx` deja de renderizar la politica MFA global y conserva solo informacion personal, alertas y credenciales propias.
- `apps/portal/src/app/dashboard/settings/security/page.tsx` pasa a redireccionar de forma server-side hacia `/dashboard/settings/access#politicas-de-autenticacion`.
- `apps/api/src/modules/configuration/services/settings-registry.service.ts` deja de publicar `SettingsSectionKey.SECURITY` en el shell federado.
- Se elimina deuda de UI huérfana: `SecuritySettingsClient`, `SecuritySettingsCard`, su spec asociado y `MfaRequiredToggle`.

**Validacion ejecutada:**

- Jest portal focalizado en `AccessControlSettingsClient.spec.tsx` — verde con cobertura del bloque MFA en Access y su guardado.
- HTTP spec backend `configuration.controller.http.spec.ts` — verde, confirmando que `SECURITY` ya no sale en el registry.
- Playwright focalizado `portal-users.spec.ts` — verde en la regresion que valida que `Mi perfil` ya no expone `Activar MFA obligatorio`.
- Playwright focalizado `portal-settings-federated-shell.spec.ts` — verde, confirmando ausencia de `Seguridad` en el shell y redirect legacy correcto.
- Playwright focalizado `portal-settings-empresa.spec.ts` — verdes los casos nuevos para guardar la politica MFA desde Access y validar la redireccion legacy desde `/dashboard/settings/security`.
- Diagnosticos de editor en archivos tocados — sin errores.

**Deuda residual explicitada:**

- Los PRD/HLD aprobados siguen pendientes de actualizacion formal hasta que ADR-045 cambie de `En revision` a decision aprobada por CTO.
- `e2e/tests/portal-settings-empresa.spec.ts` mantiene casos legacy ajenos a este slice con drift acumulado de mocks/selectores. La consolidacion MFA quedo cubierta por casos focalizados nuevos y estables.

**Resultado:** queda ejecutada la consolidacion visible de la politica MFA global en `Access`, `Mi perfil` recupera ownership personal y la ruta `Security` pasa a estado legacy con transicion controlada.

---

### v1.47 — 2026-05-27 — Cierre de barrido posterior sobre Security, enum y artefactos maestros

**Autor:** AI-SR-FULL  
**Tipo:** Hardening tecnico menor y alineacion documental final

Se ejecuto un segundo barrido focalizado para cerrar la deuda menor que quedaba tras la consolidacion MFA en Access.

**Cambios realizados:**

- `apps/portal/src/components/settings/SettingsSectionGrid.tsx` deja de mapear `SettingsSectionKey.SECURITY` en el icon map del shell, manteniendo fallback defensivo sin reintroducir la seccion.
- `docs/adrs/ADR-045-Consolidacion-Politica-MFA-Global-en-Access.md` pasa a estado **Aprobado** y documenta la implementacion ya ejecutada.
- `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` deja de listar `Seguridad` como seccion activa del shell y fija que la politica MFA global vive dentro de `Usuarios y acceso`.
- `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` documenta que Access es el owner visible de la politica MFA global y que `/dashboard/settings/security` solo existe como redirect legacy.

**Validacion ejecutada:**

- Diagnosticos del editor sin errores en `SettingsSectionGrid.tsx`.
- Jest focalizado en `SettingsSectionGrid.spec.tsx` y `SettingsClient.spec.tsx` — verde.
- Barrido de referencias residuales sin nuevas contradicciones funcionales activas.

**Resultado:** queda cerrado el barrido posterior. El runtime ya no conserva referencias visibles a `Security` como seccion activa y los artefactos maestros de MOD00 quedan alineados con la implementacion vigente.

---

### v1.48 — 2026-05-28 — Token reusable para la superficie suave de Configuracion

**Autor:** AI-SR-FULL  
**Tipo:** Refinamiento de design system y alineacion documental

Se formalizo el tono `#F8FAF5` usado en las tarjetas del hub `/dashboard/settings` como token semantico reusable del sistema visual iWana, evitando que siga viviendo como hardcode aislado.

**Cambios realizados:**

- `packages/ui/src/styles/globals.css`: se agrega `--color-iwana-surface-soft` como token oficial de superficie suave.
- `apps/portal/src/components/settings/SettingsSectionGrid.tsx`: el hub de Configuracion reemplaza `#f8faf5` por clases basadas en `bg-iwana-surface-soft`, manteniendo la misma jerarquia visual ya validada en UI.
- `docs/identity/Manual_Implementacion_Identidad_Iwana.md`: se documenta el nuevo token, su valor y su uso recomendado para cards operables, fondos de apoyo y estados vacios activos sin desplazar la card blanca como superficie base.

**Validacion ejecutada:**

- Jest focalizado: `apps/portal/src/components/settings/SettingsSectionGrid.spec.tsx`.

---

### v1.49 — 2026-05-29 — Handoff EM-Architect para refinamiento UI/UX de Calendario operativo y jornadas

**Autor:** AI-EM-ARCH  
**Tipo:** Gobernanza de ejecucion, handoff fullstack y trazabilidad posterior a Fase 06

Se ejecuto una nueva auditoria visual y funcional sobre `/dashboard/settings/calendar` usando el perfil unificado EM + Architect, la skill `writing-plans`, la skill `docs-architect`, la disciplina `iwana-identity-ui-review`, apoyo consultivo `ui-ux-pro-max` y agentes Explore para contraste de codigo, docs y superficie renderizada.

**Decision de gobierno:**

1. no se reutiliza la Fase 06 cerrada como contenedor del refinamiento;
2. el trabajo se ejecuta como una iteracion nueva, enfocada en jerarquia visual, copy, responsive y accesibilidad;
3. el boundary aprobado por ADR-040 y ADR-042 permanece intacto;
4. cualquier necesidad de backend nuevo o refactor funcional profundo en WFM se trata como bloqueo fuera de este slice.

**Artefactos creados para ejecucion fullstack:**

- `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md` — actualizada a v1.1 con trazabilidad ejecutable.
- `docs/plans/2026-05-29-mod00-refinamiento-calendario-operativo-jornadas.md`
- `docs/prompts/PROMPT-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`
- `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`

**Direccion aprobada para el fullstack:**

- reforzar el shell de calendario como consola operativa legible;
- hacer responsive el editor semanal sin romper su contrato;
- dar mas jerarquia a horario base y horarios por sede;
- subordinar formularios secundarios de excepciones y eventualidades;
- contextualizar WFM como capa de programacion de visitas, no como duplicado del horario empresarial.

**Riesgos explicitados en el handoff:**

- no reabrir ownership ni API;
- no resolver mobile con scroll horizontal como unica estrategia;
- no convertir el slice en reescritura funcional de `WfmOperatingHoursManager`;
- no introducir lenguaje tecnico o de ausencias personales en UI final.

**Resultado:** queda lista una cadena documental completa y trazable para que Sr. Dev Fullstack ejecute el refinamiento sin ambiguedad y sin contaminar la evidencia historica de Fase 06.

**Validacion documental ejecutada:**

- diagnosticos del editor sin errores en los artefactos nuevos y actualizados;
- convencion documental alineada con `docs/**` y trazabilidad enlazada a ADR, PRD, HLD, spec e informe vivo.
- Diagnosticos del editor sin errores en `globals.css`, `SettingsSectionGrid.tsx` y este informe.

---

### v1.50 — 2026-05-30 — Cierre ejecutado del refinamiento UI/UX de Calendario operativo y jornadas

**Autor:** AI-SR-FULL  
**Tipo:** Ejecucion validada, cierre documental y evidencia final

Se cierra la iteracion de refinamiento UI/UX posterior a Fase 06 sobre `/dashboard/settings/calendar` con implementacion real, validacion ejecutable y artefactos de control actualizados.

**Resultado funcional consolidado:**

1. `CalendarSettingsClient` reordena la experiencia como consola operativa legible y tolera cargas parciales por bloque sin degradar toda la pantalla.
2. `BusinessHoursWeekEditor` resuelve el uso responsive sin mismatch de hidratacion y mantiene testids estables para desktop y mobile.
3. `CalendarOrganizationHoursPanel` y `CalendarSiteHoursPanel` refuerzan el flujo principal con mejor jerarquia, feedback estable y acciones secundarias subordinadas.
4. `CalendarExceptionsPanel`, `OperationalEventualitiesPanel` y `WfmOperatingHoursManager` dejan formularios secundarios cerrados por defecto y privilegian el escaneo del listado.
5. `CalendarWfmPanel` deja explicito que la configuracion WFM solo afecta visitas programadas y no el horario base empresarial.

**Validacion ejecutada con evidencia real:**

- `pnpm --filter @iwana/portal typecheck` ✅
- Jest focalizado portal para calendario ✅ 8 suites, 75 pruebas en verde
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 8 de 8 pruebas en verde
- `get_errors` sin errores en `e2e/tests/portal-settings-calendar.spec.ts` ✅

**Ajuste clave del cierre E2E:**

- se alinearon los mocks de Playwright con los contratos reales de `api-client`, en especial el consumo de usuarios y eventualidades operativas;
- se reemplazaron esperas fragiles por selectores accesibles y no ambiguos en el bloque de cambios puntuales;
- se confirma que `/dashboard/settings/calendar` ya no depende del endpoint legacy `operating-sites` en este flujo.

**Artefactos cerrados en esta iteracion:**

- `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md` → v1.2, estado Aprobado
- `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md` → cerrada con evidencia ejecutada
- `e2e/tests/portal-settings-calendar.spec.ts` → validado en verde

**Bloqueos residuales:** ninguno dentro del alcance UI/UX y validacion del calendario operativo.

**Resultado:** la superficie suave que ya funcionaba bien en Configuracion queda convertida en decision reusable de design system, con nombre semantico, documentacion y un primer consumidor oficial dentro del portal.

---

### v1.51 — 2026-05-30 — Redistribucion ejecutada de contenedores y densidad en Calendario operativo

**Autor:** AI-SR-FULL  
**Tipo:** Ejecucion validada, redistribucion visual y cierre documental incremental

Se ejecuta la iteracion complementaria definida en `docs/plans/2026-05-30-mod00-calendario-operativo-distribucion-contenedores-ui.md` para reducir densidad, mejorar ritmo visual y unificar la jerarquia del submodulo `/dashboard/settings/calendar` sin reabrir ownership, contratos ni rutas.

**Cambios realizados:**

- `CalendarSettingsClient` separa el shell en bloque principal y bloque complementario, y mueve el estado operativo a una franja compacta fuera del header.
- El resumen superior queda resuelto en esta iteracion como franja textual compacta; los indicadores enriquecidos quedan diferidos para una pasada posterior si agregan contexto real sin volver a densificar el header.
- `CalendarOrganizationHoursPanel` y `CalendarSiteHoursPanel` dejan el editor semanal como tarea dominante y rebajan alerts persistentes o contexto introductorio a superficies ligeras.
- `CalendarExceptionsPanel` y `OperationalEventualitiesPanel` consolidan el patron list-first con disclosures accesibles, sin duplicar acciones de cierre y manteniendo los formularios subordinados.
- `CalendarWfmPanel` y `WfmOperatingHoursManager` eliminan contexto duplicado, reducen la sensacion de panel dentro de panel y conservan la gestion global de cierres aun cuando falle la carga de sedes de visitas.
- `OperationalEventualitiesPanel` degrada de forma parcial cuando falla el directorio de personas: mantiene visible la tabla con fallback de nombre y bloquea solo el alta hasta recuperar los datos necesarios.
- `e2e/tests/portal-settings-calendar.spec.ts` ahora valida la lectura por capas con `calendar-operational-status`, `calendar-shell-primary` y `calendar-shell-secondary`, en vez de depender solo del orden de headings.

**Validacion ejecutada:**

- `pnpm --filter @iwana/portal typecheck` ✅
- Jest focalizado portal para calendario ✅ 7 suites, 60 pruebas en verde
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 8 de 8 pruebas en verde

**Artefactos actualizados:**

- `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md` → v1.3, estado Aprobado
- `docs/quality/CHECKLIST-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md` → evidencia actualizada con redistribucion de contenedores
- `e2e/tests/portal-settings-calendar.spec.ts` → validado con la nueva jerarquia observable del shell

**Bloqueos residuales:** ninguno dentro del alcance frontend y de validacion de esta iteracion.

---

### v1.54 — 2026-05-30 — Shell unificado sin divisiones en Calendario operativo

**Autor:** AI-SR-FULL  
**Tipo:** Correccion de layout, densidad y jerarquia visual

Se corrigio la distribucion del shell de `/dashboard/settings/calendar` para eliminar el hueco entre bloques y retirar la linea divisoria que separaba artificialmente los pasos inferiores.

**Cambios realizados:**

- `CalendarSettingsClient` deja de usar dos grids independientes para los paneles funcionales.
- El calendario ahora usa un unico shell en dos columnas: la columna izquierda agrupa `Horario base de la empresa` y `Cierres por fecha y aperturas especiales`; la columna derecha agrupa `Horarios por sede` y `Cambios puntuales de disponibilidad`.
- Se eliminan del shell las clases `border-t` y `pt-4` que generaban la linea horizontal y la separacion visual innecesaria entre contenedores.
- `CalendarSettingsClient.spec.tsx` y `portal-settings-calendar.spec.ts` actualizan sus expectativas para validar la nueva distribucion compacta.

**Validacion ejecutada:**

- `CalendarSettingsClient.spec.tsx` ✅ 10 pruebas en verde
- `pnpm --filter @iwana/portal typecheck` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 8 de 8 pruebas en verde

**Resultado:** Paso 3 queda bajo Paso 1, Paso 4 queda bajo Paso 2 y la pantalla deja de mostrar una division visual artificial entre esos bloques.

---

### v1.55 — 2026-05-30 — Columnas compactas sin separacion vertical remanente

**Autor:** AI-SR-FULL  
**Tipo:** Refinamiento visual de densidad y continuidad

Se aplico un ajuste adicional sobre el shell del calendario para eliminar la separacion residual entre los dos paneles apilados de cada columna.

**Cambios realizados:**

- Las columnas izquierda y derecha del shell pasan de `space-y-4` a una pila compacta sin hueco vertical entre paneles.
- Se recortan los radios internos de las tarjetas apiladas y se elimina el borde superior del segundo panel de cada columna para evitar la sensacion de division entre bloques contiguos.
- El E2E de calendario ahora verifica tambien que la distancia vertical entre paneles consecutivos en cada columna sea `<= 1px`.

**Validacion ejecutada:**

- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 8 de 8 pruebas en verde

**Resultado:** cada columna del calendario se percibe como una pila continua, sin huecos intermedios ni separaciones visibles entre el panel superior y el inferior.

---

### v1.56 — 2026-05-30 — Selector de hora/minuto mas compacto en horarios

**Autor:** AI-SR-FULL  
**Tipo:** Refinamiento visual de control reutilizable

Se ajusto la primitive `TimeFieldSelect` para reducir el ancho excesivo del selector desplegable de `Hora` y `Min.` cuando solo muestra valores de dos digitos.

**Cambios realizados:**

- El popover del selector reduce su ancho total y el padding exterior.
- Las columnas de `Hora` y `Min.` usan menor separacion interna.
- Las opciones internas dejan de reservar ancho sobrante y ahora centran mejor los valores de dos digitos junto al check de seleccion.
- Se agrega un caso E2E que valida que las opciones desplegadas no excedan el ancho esperado en el editor semanal.

**Validacion ejecutada:**

- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts --grep "selector de hora compacto"` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 9 de 9 pruebas en verde

**Resultado:** el selector de tiempo conserva la interaccion actual, pero elimina espacio visual innecesario en listas pensadas para valores de dos digitos.

---

### v1.57 — 2026-05-30 — Trigger compacto mas estrecho en TimeFieldSelect

**Autor:** AI-SR-FULL  
**Tipo:** Refinamiento visual de densidad en control reutilizable

Se redujo el ancho del estado cerrado de `TimeFieldSelect` cuando se usa en modo compacto, para evitar que los botones `07:00`, `18:00` y equivalentes ocupen mas espacio del necesario dentro de grillas operativas.

**Cambios realizados:**

- El trigger compacto pasa a un ancho fijo menor, con menos padding lateral y menor separacion entre valor e iconos.
- El valor visible usa `tabular-nums` para conservar lectura estable con menor ancho.
- La prueba E2E del selector compacto ahora valida tambien el ancho del trigger cerrado.

**Validacion ejecutada:**

- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts --grep "selector de hora compacto"` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 9 de 9 pruebas en verde

**Resultado:** el selector cerrado ocupa menos espacio horizontal y la tabla semanal gana aire sin perder legibilidad ni interaccion.

---

### v1.58 — 2026-05-30 — Scrollbar contenido dentro del selector de hora

**Autor:** AI-SR-FULL  
**Tipo:** Correccion visual de contencion en control reutilizable

Se corrigio el desborde visual de la barra de scroll en las listas de `Hora` y `Min.` del `TimeFieldSelect`, donde la barra aparecia saliendo del contenedor redondeado.

**Cambios realizados:**

- El borde redondeado y el scroll dejan de vivir en el mismo nodo.
- Cada columna del popover ahora usa un wrapper con `overflow-hidden` para recortar visualmente la barra.
- El scroll vertical queda en una capa interna con gutter estable y padding derecho para mantener la barra dentro del contenedor.

**Validacion ejecutada:**

- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts --grep "selector de hora compacto"` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 9 de 9 pruebas en verde

**Resultado:** la barra de desplazamiento queda visualmente contenida dentro de cada lista y deja de romper el borde del selector.

---

### v1.53 — 2026-05-30 — Alineacion visual de controles en Cambios puntuales

**Autor:** AI-SR-FULL  
**Tipo:** Correccion de UI, coherencia con design system y validacion ejecutada

Se corrigio el formulario de `Cambios puntuales de disponibilidad` en `/dashboard/settings/calendar` porque seguia mezclando controles nativos del navegador con primitives del sistema visual. La causa raiz eran dos `select` nativos y dos campos `datetime-local`, que abrían listas y calendarios fuera del lenguaje visual de iWana.

**Cambios realizados:**

- `OperationalEventualitiesPanel` migra `Persona afectada` y `Tipo de ajuste` a `Select` de `@iwana/ui`.
- `Inicio del cambio` y `Fin del cambio` dejan de usar `datetime-local` y pasan a una composicion `DatePicker` + `TimeFieldSelect`, manteniendo el mismo payload ISO al guardar.
- `OperationalEventualitiesPanel.spec.tsx` se adapta al nuevo contrato del formulario con mocks controlados de `Select`, `DatePicker` y `TimeFieldSelect`.
- `e2e/tests/portal-settings-calendar.spec.ts` actualiza el flujo de alta para interactuar con los controles visibles del sistema en lugar de rellenar inputs nativos.

**Validacion ejecutada:**

- `OperationalEventualitiesPanel.spec.tsx` ✅ 19 pruebas en verde
- `pnpm --filter @iwana/portal typecheck` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-calendar.spec.ts` ✅ 8 de 8 pruebas en verde

**Resultado:** el Paso 4 ya no abre calendarios ni listas desplegables del navegador y queda visualmente alineado con el sistema de componentes compartido del portal.

---

### v1.52 — 2026-05-30 — Retiro de Programacion de visitas del Calendario operativo

**Autor:** AI-SR-FULL  
**Tipo:** Correccion funcional de UX, limpieza de copy y cierre documental incremental

Se retira el contenedor `Programacion de visitas` de `/dashboard/settings/calendar` porque duplicaba la fuente de verdad del horario operativo. La pantalla queda enfocada en cuatro capas: horario base de empresa, horarios por sede, cierres por fecha y cambios puntuales de disponibilidad.

**Cambios realizados:**

- `CalendarSettingsClient` elimina `CalendarWfmPanel` del shell secundario y mantiene la distribucion compacta en dos columnas con `CalendarExceptionsPanel` y `OperationalEventualitiesPanel`.
- `CalendarWfmPanel.tsx` y `CalendarWfmPanel.spec.tsx` se eliminan porque eran el wrapper exclusivo del contenedor retirado.
- `CALENDAR_SETTINGS_COPY` elimina menciones visibles a programacion de visitas dentro del calendario y renumera `Cambios puntuales` como Paso 4.
- `CalendarSettingsClient.spec.tsx` valida que el bloque secundario ya no renderiza `Programacion de visitas`.
- La spec viva `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md` pasa a v1.4 y documenta el modelo de cuatro capas.

**Validacion ejecutada:**

- `CalendarSettingsClient.spec.tsx` ✅ 10 pruebas en verde
- `pnpm --filter @iwana/portal typecheck` ✅

**Resultado:** la agenda de visitas deja de ser un calendario paralelo en MOD00 y queda como consumidor del calendario operativo resuelto, evitando ambiguedad entre horario base, horario por sede y reglas de agenda.

---

### v1.49 — 2026-05-28 — Regla explicita entre superficie suave y acento secundario

**Autor:** AI-SR-FULL  
**Tipo:** Cierre de criterio visual y gobernanza del design system

Se completo la auditoria posterior a la migracion del tono `#F8FAF5` para diferenciar de forma explicita dos roles visuales que estaban mezclados en el portal: superficies suaves de apoyo y acentos verdes de seleccion.

**Decision tomada:**

- `iwana-surface-soft` queda como fondo base para cards suaves, contenedores auxiliares, toolbars, empty states y paneles de contexto ligero.
- `iwana-secondary-50` se conserva solo para acentos de interaccion o enfasis: tabs activas, filtros seleccionados, pills temporales como `En edición` y algunos hovers donde el verde comunica estado o foco funcional.

**Evidencia del barrido final:**

- Las primitivas compartidas `PortalActionToolbar`, `PortalAlert` variante `info` y `PortalEmptyState` migraron a `iwana-surface-soft`.
- Los usos restantes con `iwana-secondary-50` en `AccessControlSettingsClient`, `OffersManager`, `AdditionalProductsManager` y `AdditionalServicesManager` corresponden a estados activos o señales de seleccion, no a fondos base.
- Se actualiza el manual de identidad para que esta separacion no dependa de memoria oral ni criterio local por pantalla.

**Resultado:** queda cerrada la taxonomia visual del tono suave aprobado. El portal ya no usa `iwana-secondary-50` como superficie neutra por defecto y conserva ese color solo cuando realmente actua como acento semantico.

---

### v1.52 — 2026-06-12 — Auditoria visual y de accesibilidad de `/settings` (apps/web)

**Autor:** AI-SR-UI-SYS + AI-EM-ARCH  
**Tipo:** Auditoria de calidad visual, accesibilidad WCAG 2.2 AA y deuda tecnica — superfice `apps/web` ruta `/settings`

**Contexto:**

Se realizo una auditoria completa de la pagina `/settings` de `apps/web` bajo el rol Senior UI Systems Designer (Perfil `AI-SR-UI-SYS`) y una segunda pasada de revision arquitectonica (rol `AI-EM-ARCH`). La auditoria cubrio los tres tabs de la pagina (General, Branding, Seguridad) analizando codigo fuente, snapshot de accesibilidad y capturas visuales en modo claro.

**Hallazgos detectados:**

| Severidad | Cantidad | Descripcion rapida |
|---|---|---|
| Bloqueante | 5 | Tabs sin ARIA (tablist/tab/tabpanel), inputs de contrasena sin aria-invalid/describedby, campo TOTP sin label/inputMode, bloques de exito sin role="alert", shadow hardcodeada fuera del token |
| Importante | 9 | Formulario de branding operable durante carga con defaults hardcodeados, eliminacion de imagen sin confirmacion, mezcla Input/@iwana/ui vs nativo en SecuritySettings, sin autoComplete en campos de contrasena, carga MFA invisible, SecuritySettings sin cobertura de tests, tests faltantes en page.spec.tsx |
| Menor | 10 | Inconsistencia de radios de borde (3 valores distintos), CardTitle con color hardcodeado, deuda en tab General sin TODO documentado, overlay upload sin role="status", otros |

**Deuda documentada pero no resuelta en este ciclo:**

- Link a directorio `/brand/` en BrandingSlotCard: requiere analisis de ruta de assets (escalar EM-ARCH)
- `CardTitle` con color hardcodeado `text-[#17163A]` en `@iwana/ui`: afecta el paquete global, requiere ADR de tokens
- `form-styles.ts` sin tokens semanticos: refactor mayor, requiere ADR
- `details/summary` del campo URL alternativa: deuda UX aceptable en backlog
- `ProtectedLayout` spinner sin role="status": deuda transversal fuera del scope de settings

**Artefactos producidos:**

- Plan de implementacion: `docs/plans/2026-06-12-web-settings-ui-audit-fixes.md` (8 tasks, ~30 pasos)
- Informe vivo actualizado (este documento)

**Documentos a actualizar o crear segun analisis:**

| Documento | Accion | Justificacion |
|---|---|---|
| `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | Actualizar (hecho) | Registro de auditoria y hallazgos |
| `docs/plans/2026-06-12-web-settings-ui-audit-fixes.md` | Crear (hecho) | Plan de correccion ejecutable |
| `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | Actualizar seccion frontend/UI | Documentar criterio de tabs accesibles y tab General como deuda pendiente de contenido real |
| `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | Revisar seccion de componentes UI | Verificar que la lista de componentes de @iwana/ui usados este actualizada (Tabs, OtpInput, Dialog) |
| `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md` o nuevo | Crear checklist de revision UI | Agregar criterios de accesibilidad WCAG 2.2 AA para la superficie `apps/web /settings` |
| ADR nuevo: ~~`ADR-046-Normalizacion-Tokens-Visuales-Settings`~~ ⚠️ **número ya ocupado** — ADR-046 existe y es *"Bounded Context Tasks / Ejecución Operativa"* (Aprobado). Esta propuesta quedó huérfana: si sigue vigente, **renumérese al siguiente libre** y escálese; si no, ciérrese. Detectado 2026-07-19 vía [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) | Crear (propuesto, escalar CTO) | Formalizar el uso de tokens de sombra y radio semanticos en `@iwana/ui` vs `form-styles.ts`; incluir decision sobre `CardTitle` con color hardcodeado |
| `INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md` | Crear (recomendado) | Informe de auditoria standalone para trazabilidad, separado del informe vivo del modulo |

**Criterio de cierre de esta entrada:**

La entrada queda cerrada cuando el plan `2026-06-12-web-settings-ui-audit-fixes.md` este completamente ejecutado (todos los checkboxes marcados), los tests pasen y la ruta `/settings` supere el checklist visual de review (Seccion 13 del perfil AI-SR-UI-SYS).

**Estado actual:** Plan ejecutado completamente el 2026-06-12. Todos los tasks completados y verificados (27/27 tests en verde, typecheck y lint limpios, smoke visual en browser confirmado).

---

### v1.59 — 2026-08-15 — Remediación del hub de Configuración y prioridad dinámica

**Autor:** AI-EM-ARCH con AI-SR-FULL, AI-FE-PLATFORM y AI-SR-QA
**Tipo:** Auditoría UI/UX, contrato read-model y ejecución correctiva del hub portal

La auditoría de `/dashboard/settings` fijó un resultado inicial de 51/100: sin P0, pero con bloqueos de prioridad, contraste dark, recuperación, cobertura y E2E. La validación visual autenticada quedó pendiente porque la ruta local redirigía al login; la evidencia histórica no se consideró comparable.

**Artefactos congelados:**

- `docs/specs/2026-08-15-mod00-settings-priority-dynamic-design.md`
- `docs/prompts/PROMPT-MOD00-CONFIGURACION-PRIORITY-REMEDIACION-v1.0.md`

**Decisiones:**

- La recomendación del hub se alimentará de `GET /api/v1/configuration/settings-priority` y no del registry estático.
- El agregado usará puertos tipados de Tenant, Users y Organization, `Promise.allSettled`, aislamiento por schema y sin migraciones ni caché.
- El portal ocultará la recomendación para `NONE`, `UNKNOWN`, errores, `403` o destinos no operables.
- El copy visible usará “Perfiles y autenticación”, “verificación en dos pasos” y las cinco claves de prioridad definidas en la spec.
- CTA/reintento usarán primitives del design system con foco visible, objetivo táctil mínimo de 44 px y contraste AA en dark mode.

**Validación ejecutada:**

- Backend/shared: 33 pruebas focalizadas en 7 suites, typecheck API/shared y ESLint enfocado en verde.
- Portal: 27 pruebas focalizadas en verde; cobertura del núcleo 93.75 % statements, 81.66 % branches, 95.45 % functions y 93.57 % lines.
- E2E portal federado: 9/9 en verde, incluyendo las cinco prioridades, permisos y navegación.
- axe WCAG 2A/2AA: cero violaciones en claro y oscuro; validado por el E2E en la superficie del hub.
- `audit-ui.mjs`: P0/P1/P2/P3 = 0 en los componentes del hub.
- Typecheck portal y `git diff --check`: en verde. No se agregaron tokens, migraciones, caché ni dependencias.

**Resultado:** G6 queda **GO para el alcance del hub raíz**, con la salvedad de que la URL local sin mocks continúa requiriendo una sesión real para inspección manual fuera del arnés E2E. Los hallazgos de subpantallas de calendario/acceso permanecen fuera de alcance.

---

### v1.60 — 2026-08-15 — Remediación UI/UX Organización

**Autor:** AI-EM-ARCH con AI-PROD-UX, AI-DS-OWNER, AI-FE-PLATFORM, AI-SR-QA y confirmación AI-SR-FULL  
**Tipo:** Remediación UI/UX de `/dashboard/settings/organization`  
**Plan:** `docs/plans/2026-08-15-mod00-organizacion-ui-remediation.md`  
**Spec:** `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`  
**Prompt:** `docs/prompts/PROMPT-MOD00-ORGANIZACION-REMEDIACION-UI-v1.0.md`

## Remediación UI/UX Organización — 2026-08-15

- **Hallazgos cerrados:** P0, P1, P2 y P3 de la pantalla de Organización (estados de carga/vacío/permisos, errores sanitizados, país en el modal unificado, validación entre tabs, tabla responsive, badges, objetivos táctiles ≥44 px, diálogo iWana de baja, copy Firma).
- **Archivos funcionales modificados:**
  - `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
  - `apps/portal/src/components/settings/CompanyProfileForm.tsx`
  - `apps/portal/src/components/settings/OperationalSettingsForm.tsx`
  - `apps/portal/src/components/settings/mod00-settings-labels.ts`
  - `apps/portal/src/components/settings/organization-settings-options.ts` (nuevo)
- **Confirmación AI-SR-FULL:** `country` ya existía en `OrganizationSiteDetail`, `CreateOrganizationSiteDto` y `UpdateOrganizationSiteDto`. Sin cambio de backend.
- **Cobertura final** (Jest `--collectCoverageFrom` de los tres componentes): statements 92.45 %, branches 85.97 %, functions 90.9 %, lines 92.3 %. Ningún archivo crítico bajo 80 % en líneas (`CompanyProfileForm` 100 %, `OrganizationSettingsClient` 91.46 %, `OperationalSettingsForm` 93.02 %).
- **Suites Jest ejecutadas:** portal completo 185/185 suites, 1356 passed / 1 skipped. Focalizado Organización: 54 pruebas en los tres specs de settings.
- **Suites E2E ejecutadas:** 18/18 passed (`portal-settings-empresa` 7, `portal-settings-organization-access` 1, `portal-settings-organization-ui` 10).
- **Resultado axe** (wcag2a + wcag2aa): 0 violaciones en mobile 390×844, tablet 1024×768 y desktop 1440×900, en claro y oscuro. CTA `Crear sede` ≥44 px. `body` sin `overflow-x: scroll`.
- **Evidencia visual autenticada vigente:** capturas Playwright con sesión tenant ADMIN sembrada (no se reutilizan capturas históricas del hub):
  - `e2e/tests/portal-settings-organization-ui.spec.ts-snapshots/organization-{mobile,tablet,desktop}-{light,dark}-chromium-win32.png`
  - La URL `http://localhost:3002/dashboard/settings/organization` no se inspeccionó con sesión real en esta corrida (portal local no estaba levantado); la evidencia autenticada vigente es el arnés E2E.
- **Veredicto AI-PROD-UX:** GO. Spec correctiva congelada; CA-ORG-UX-01…10 cubiertos por implementación y pruebas.
- **Veredicto AI-DS-OWNER:** GO. Contrato visual §10 cumplido; `audit-ui.mjs` 0 hallazgos en los tres componentes; CTAs `size="lg"` y objetivos táctiles ≥44 px.
- **Gate G6:** **GO**. E2E verde, cobertura ≥80 % en las cuatro métricas del conjunto, axe sin violaciones A/AA, contraste conforme al contrato DS y evidencia visual autenticada vigente en el arnés E2E.

**Validación de cierre (Task 7):**

- `pnpm --filter @iwana/portal typecheck` — exit 0
- `pnpm --filter @iwana/portal lint` — exit 0 (0 errores; 52 warnings preexistentes fuera de alcance)
- `pnpm --filter @iwana/portal test -- --runInBand` — 185 suites, 1356 passed
- Playwright Organización — 18 passed
- `pnpm audit:doc-locations` / `pnpm audit:adr-citations` — BLOQUEANTE 0
- `pnpm sync:agents:check` — OK
- `git diff --check` — exit 0
- Sin API, OpenAPI, migraciones, tokens ni cambios globales de `@iwana/ui`.
