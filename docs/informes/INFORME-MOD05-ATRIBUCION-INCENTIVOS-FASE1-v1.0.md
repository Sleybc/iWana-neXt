# INFORME - MOD05 Atribucion Incentivos Fase 1

**Version:** 1.0
**Estado:** En revision
**Fecha:** 2026-04-02
**Modulo:** MOD05 CRM
**Fase:** 1 - Backend + Portal de origen y atribucion
**Prompt base:** docs/prompts/PROMPT-MOD05-CRM-ORIGEN-ATRIBUCION-FASE1-v1.1.md

---

## 1. Alcance ejecutado

Se implemento el alcance funcional de origen comercial y atribucion sin introducir componentes de incentivos economicos.

Incluye:

1. Enums compartidos de canal y rol de atribucion.
2. Migracion tenant para `acquisition_channel`, `source_detail` y tabla `sales_attributions`.
3. Sub-modulo backend `attributions` con endpoints de alta, consulta activa, historial y revocacion.
4. Ajustes de `ExpedienteRecord`, DTOs y servicio para canal estructurado.
5. Ajustes portal en alta rapida y detalle de expediente para canal/detalle + atribucion.
6. Pruebas unitarias de servicio y controller del sub-modulo de atribucion.

---

## 2. Artefactos modificados

- `packages/shared/src/enums/crm/acquisition-channel.enum.ts`
- `packages/shared/src/enums/crm/attribution-role.enum.ts`
- `packages/shared/src/enums/crm/index.ts`
- `packages/shared/src/index.ts`
- `packages/database/src/migrations/tenant/007_add_acquisition_channel_and_sales_attributions.ts`
- `packages/database/src/migrations/tenant/runner.ts`
- `apps/api/src/modules/crm/attributions/attributions.module.ts`
- `apps/api/src/modules/crm/attributions/attributions.controller.ts`
- `apps/api/src/modules/crm/attributions/attributions.service.ts`
- `apps/api/src/modules/crm/attributions/dto/create-attribution.dto.ts`
- `apps/api/src/modules/crm/attributions/dto/revoke-attribution.dto.ts`
- `apps/api/src/modules/crm/attributions/entities/sales-attribution.entity.ts`
- `apps/api/src/modules/crm/crm.module.ts`
- `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`
- `apps/api/src/modules/crm/expedientes/dto/create-expediente.dto.ts`
- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- `apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts`
- `apps/portal/src/components/crm/expedientes/expediente-ui.ts`
- `apps/portal/src/lib/api-client.ts`
- `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- `apps/api/src/modules/crm/attributions/tests/attributions.service.spec.ts`
- `apps/api/src/modules/crm/attributions/tests/attributions.controller.spec.ts`

---

## 3. Decisiones tecnicas

1. Se mantiene columna legacy `source` por compatibilidad; se sincroniza con `acquisition_channel` y `source_detail` en flujos de escritura.
2. La reatribucion no reemplaza en sitio: revoca la activa y crea una nueva fila (historial inmutable).
3. Se aplica unicidad parcial para una sola atribucion activa por expediente (`WHERE revoked_at IS NULL`).
4. El panel del portal habilita escritura de atribucion solo para `ADMIN` y `SYSTEM_ADMIN`.

---

## 4. Seguridad y boundaries

1. No se agregaron tablas ni logica de incentivos, devengos o pagos.
2. Endpoints de escritura de atribucion protegidos por `JwtAuthGuard + RolesGuard` y `@Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)`.
3. Validaciones de entrada con Zod en DTOs nuevos.
4. Multi-tenancy conservado via `TenantContext` y `runInTenantSchema`.

---

## 5. Evidencia de pruebas

Ejecuciones verificadas para el ajuste de busqueda de actor:

1. `cd apps/api && npx jest src/modules/users/users.service.spec.ts --runInBand`  
	Resultado: OK. Suite `UsersService` con 49 pruebas exitosas, incluyendo busqueda por nombres legacy decodificados, tolerancia a mayusculas/minusculas y coincidencias aproximadas (`Liliana` vs `lilina`).
2. `pnpm --filter @iwana/api typecheck`  
	Resultado: OK.
3. `pnpm --filter @iwana/portal typecheck`  
	Resultado: OK.
4. `pnpm --filter @iwana/api lint`  
	Resultado: OK.
5. `pnpm --filter @iwana/portal lint`  
	Resultado: OK.
6. `pnpm --filter @iwana/api build`  
	Resultado: OK.
7. `pnpm --filter @iwana/portal build`  
	Resultado: OK. `next build` completo sin errores, incluyendo la ruta `dashboard/crm/expedientes/[id]`.

---

## 6. Deuda tecnica identificada

1. Mantener `source` legacy implica doble escritura temporal hasta fase de retiro controlado.
2. El selector de actor carga hasta 100 usuarios activos del tenant; si la base crece, se debe evolucionar a busqueda paginada incremental.

---

## 7. Trazabilidad documental

- PRD: `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md`
- HLD: `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
- ADR: `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md`
- ADR: `docs/adrs/ADR-019-JWT-RS256-Refresh-Rotation.md`
- Prompt de fase: `docs/prompts/PROMPT-MOD05-CRM-ORIGEN-ATRIBUCION-FASE1-v1.1.md`

---

## 8. Ajuste posterior de portal (2026-04-02)

1. Se corrigio un error de render JSX en el detalle de expediente que ocultaba parcialmente bloques de UI.
2. Se dejo explicita la regla de permisos en frontend para atribucion: escritura solo para `ADMIN` y `SYSTEM_ADMIN`, lectura visible para otros roles permitidos por API.
3. Se mantuvo visible el bloque de `Originador actual` y `Historial` para trazabilidad comercial en la vista de detalle.

## 9. Ajuste de refinamiento UX y consistencia de atribucion (2026-04-02)

1. El campo `Actor originador` en portal paso de UUID manual a selector tenant-aware de usuarios activos, con busqueda por nombre, correo y rol.
2. El `Rol del actor` ahora se completa automaticamente segun el usuario seleccionado y queda en solo lectura en la UI.
3. Se agregaron ayudas de contexto en el formulario para explicar `Actor originador` y `Motivo de reatribucion`.
4. En backend, la API deja de confiar en el rol enviado por cliente: ahora resuelve `actorName` y `actorRole` desde usuarios persistidos (tenant o plataforma).
5. Si el actor no existe como usuario del sistema, la API responde `ACTOR_NOT_FOUND` y bloquea la atribucion.

## 10. Ajuste correctivo UX + payload de atribucion (2026-04-02)

1. En el formulario de atribucion, el selector de `Actor originador` muestra solo el nombre del usuario para simplificar la seleccion operativa.
2. Se retiro de la UI el bloque de `Rol del actor`; el usuario no lo visualiza ni lo edita durante la atribucion.
3. Se corrigio el armado de payload en portal para no enviar `reattributionReason` vacio (`''`), que activaba error de validacion Zod en backend (`Payload invalido para el boundary externo de CRM`).
4. El payload ahora envia solo campos validos y no vacios (`actorId`, `acquisitionChannel`, `notes?`, `reattributionReason?`), alineado al contrato API.

## 11. Ajuste correctivo de busqueda de actor (2026-04-02)

1. Se corrigio la causa raiz del buscador: `firstName` y `lastName` pueden existir en formato legacy cifrado, por lo que `ILIKE` contra columnas crudas no encontraba coincidencias por nombre.
2. El endpoint de usuarios ahora resuelve `search` sobre los DTOs ya decodificados, manteniendo filtros por `status` y `role` y soportando mayusculas/minusculas, acentos y coincidencias aproximadas simples.
3. En el panel de atribucion del portal, el filtro local tambien se volvio tolerante a mayusculas/minusculas y errores menores de tipeo, de modo que `Liliana`, `liliana` y `Lilina` acerquen al mismo resultado.
4. El selector muestra como fallback el correo del usuario cuando el nombre no este disponible, evitando listas visualmente vacias por datos legacy incompletos.
5. La UI del buscador ahora informa cantidad de coincidencias y muestra un mensaje explicito cuando no hay resultados, evitando la percepcion de fallo silencioso.

## 12. Ajuste UX en gestion operativa por tabs (2026-04-02)

1. Se corrigio el contenedor de tabs de `Gestion operativa` para renderizar solo el panel activo (`Contacto`, `Consentimientos` o `Cobertura`).
2. Con este ajuste, los formularios de `Consentimientos (Ley 1581)` y `Verificaciones de cobertura` ya no se muestran debajo del tab de contacto al mismo tiempo.
3. Se elimino ruido visual en la vista de detalle del expediente y se mantuvo el comportamiento esperado de navegacion por tabs.
