# PROMPT — Refinamiento de layout de inputs en settings portal

**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-08  
**Generado por:** Engineering Manager  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)  
**Convención documental:** `PROMPT-TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS-v1.0.md`

## Módulo

- Nombre: Configuración empresarial del portal tenant-aware
- Código: TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS
- Fase: Refinamiento visual de formularios `General` y `Operación`
- Versión: 1.0
- Fecha: 2026-05-08
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** mejorar la distribución visual de inputs en `apps/portal:/dashboard/settings`, específicamente en las tabs `General` y `Operación`, para que el formulario sea más escaneable, más denso de forma útil y más cercano a la disciplina visual observada en `apps/web`, sin mezclar tabs ni cambiar contratos backend.
- **Lo que sí entra:**
  - reorganizar la grilla editable de `CompanyProfileForm`;
  - mejorar proporciones de `OperationalSettingsForm`;
  - introducir agrupación temática más clara dentro de `General`;
  - mantener `Operación` como sección separada, pero con mejor densidad y spans variables;
  - ajustar pruebas focalizadas si los anchors visibles cambian;
  - actualizar informe vivo con evidencia de ejecución.
- **Lo que no entra:**
  - fusionar `General` y `Operación`;
  - unificar submits o endpoints;
  - alterar DTOs, Zod schemas, permisos o contracts;
  - reintroducir overview superior o navegación secundaria en `Marca`;
  - rediseñar `Seguridad` o `Marca` fuera de impactos colaterales mínimos.

## 2. Artefactos de entrada obligatorios

- Plantilla base: [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
- PRD del módulo: [docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md](../prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md)
- HLD del módulo: [docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md](../hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md)
- Plan de implementación: [docs/plans/PLAN-TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS-v1.0.md](../plans/PLAN-TRANSVERSAL-PORTAL-SETTINGS-LAYOUT-INPUTS-v1.0.md)
- Prompt histórico de rediseño amplio: [docs/prompts/PROMPT-TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI-v1.0.md](PROMPT-TRANSVERSAL-PORTAL-SETTINGS-REDISENO-UI-v1.0.md)
- Informe vivo: [docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md](../informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md)
- Referencias de implementación:
  - [apps/portal/src/components/settings/CompanyProfileForm.tsx](../../apps/portal/src/components/settings/CompanyProfileForm.tsx)
  - [apps/portal/src/components/settings/OperationalSettingsForm.tsx](../../apps/portal/src/components/settings/OperationalSettingsForm.tsx)
  - [apps/portal/src/components/settings/SettingsClient.spec.tsx](../../apps/portal/src/components/settings/SettingsClient.spec.tsx)
  - [apps/web/src/components/profile/ProfileForm.tsx](../../apps/web/src/components/profile/ProfileForm.tsx)
  - [apps/web/src/components/settings/SecuritySettings.tsx](../../apps/web/src/components/settings/SecuritySettings.tsx)
- Artefactos faltantes detectados: no aplica; el ajuste queda suficientemente gobernado por PRD/HLD existentes y este plan puntual.

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer completo el plan antes de tocar código.
2. Mantener `General` y `Operación` como tabs separadas.
3. No tocar lógica de carga, validación ni submit; el alcance es de layout y jerarquía visual.
4. En `CompanyProfileForm.tsx`, reemplazar la grilla plana por una grilla flexible con agrupación temática:
   - `Perfil y contacto`
   - `Identificación y ubicación`
5. En `OperationalSettingsForm.tsx`, mantener los grupos `Ubicación` y `Preferencias`, pero ajustar los spans para que `Zona horaria` tenga más ancho que `Moneda` o `Idioma`.
6. Aplicar densidad controlada:
   - máximo 3 campos cortos por fila;
   - campos largos con spans amplios;
   - nada de 4 columnas iguales para inputs editables.
7. Preservar todos los textos visibles, botones de guardado y mensajes del flujo salvo que un ajuste menor de copy mejore claridad y no rompa tests.
8. Validar el resultado en desktop, tablet y mobile antes de cerrar.
9. Actualizar el informe vivo con evidencia real de ejecución.

## 4. Restricciones no negociables

- Usar `pnpm`, nunca `npm` ni `yarn`.
- No cambiar endpoints, DTOs, permisos, tenancy ni ownership de campos.
- No fusionar `PATCH /tenants/me/profile` con `PATCH /tenants/me/settings`.
- No agregar librerías nuevas ni mover estilos a `tailwind.config.js`.
- Mantener copy visible en español y semántica WCAG AA.
- No convertir el formulario en una tabla densa ni en una grilla de 4 columnas rígidas.
- No reabrir el alcance de `Marca` o `Seguridad` salvo ajustes colaterales mínimos necesarios para consistencia.

## 5. Entregables técnicos obligatorios

- `CompanyProfileForm.tsx` con nueva distribución de inputs y subsecciones internas.
- `OperationalSettingsForm.tsx` con mejor proporción de campos y densidad controlada.
- `SettingsClient.spec.tsx` ajustado si requiere nuevos anchors visibles o cobertura adicional.
- Evidencia de validación de settings en portal.

## 6. Entregables documentales obligatorios

- Actualización del informe vivo [INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md](../informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md)
- Registro de archivos modificados
- Comandos ejecutados y resultados
- Deuda residual visual si algún span requiere ajuste fino posterior

## 7. Criterios de aceptación

- CA-SET-LAYOUT-01: `General` sigue siendo un formulario independiente, pero con agrupación visual clara y mejor escaneabilidad.
- CA-SET-LAYOUT-02: `Operación` mantiene sus grupos actuales y mejora la proporción entre campos largos y cortos.
- CA-SET-LAYOUT-03: no se introducen cambios funcionales en validación, carga ni submit.
- CA-SET-LAYOUT-04: la densidad mejora en desktop sin degradar tablet o mobile.
- CA-SET-LAYOUT-05: tests focalizados, typecheck y lint del portal quedan en verde.
- CA-SET-LAYOUT-06: el informe vivo documenta el refinamiento con evidencia real.

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - el ajuste visual empuja a fusionar contratos `profile` y `settings`;
  - para lograr la densidad deseada se requiere romper accesibilidad o legibilidad en mobile;
  - el cambio obliga a tocar DTOs, Zod schemas, endpoints o permisos;
  - aparece conflicto documental con ownership de campos en PRD/HLD.
- **Documentar causa en:** [docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md](../informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md)
- **Escalar a:** EM-ARCH
- **Recomendación esperada:** resolver con ajustes de spans, grouping y ancho efectivo antes de ampliar alcance.

## 9. Criterio de salida de la fase

- Frontend validado:
  - `pnpm --filter @iwana/portal test -- "src/components/settings" --no-coverage`
  - `pnpm --filter @iwana/portal typecheck`
  - `pnpm --filter @iwana/portal lint`
- Validación manual mínima:
  - revisión desktop `1440x900` en `/dashboard/settings`
  - revisión tablet `1024x768` en `/dashboard/settings`
  - revisión mobile `390x844` en `/dashboard/settings`
  - verificación visual de que `General` no parece una lista plana ni una tabla editable
- Documentación archivada:
  - informe vivo actualizado con resultado final y deuda residual si aplica
