# PROMPT — Ejecución sistema de botones iWana neXt · Fase 01

**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-04  
**Generado por:** Engineering Manager + Senior UI Systems Designer  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)  
**Convención documental:** `PROMPT-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md`

## Módulo

- Nombre: Sistema visual de botones iWana neXt
- Código: TRANSVERSAL-BOTONES-SISTEMA
- Fase: 01 — Estandarización de botones y acciones
- Versión: 1.0
- Fecha: 2026-05-04
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** `packages/ui`, `apps/portal` y superficies prioritarias de `apps/web` deben empezar a usar una gramática común de botones basada en **Command Pill + Utility Icon**.
- **Lo que sí entra:**
  - Ajustar `packages/ui/src/components/Button.tsx` para soportar la dirección visual aprobada.
  - Migrar CTAs y acciones prioritarias en Portal Comercial, Portal Usuarios y Catálogo de impuestos.
  - Reemplazar iconos sueltos accionables por icon buttons con affordance, foco y `aria-label`.
  - Reducir botones destructivos rojos repetidos en tablas/listas, conservando rojo sólido en confirmaciones.
  - Validar que badges y contadores no parezcan botones si no son interactivos.
- **Lo que no entra:**
  - Backend, API, OpenAPI, migraciones, auth, MFA, roles, permisos o tenancy.
  - Nueva librería UI, cambio de paleta global, tipografía global o Tailwind config.
  - Rediseño funcional de Comercial, Usuarios, CRM o Configuración.
  - Migración total de todo el monorepo en una sola fase.

## 2. Artefactos de entrada obligatorios

- Spec visual: [SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../specs/SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- Plan de fase: [PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../plans/PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- Plantilla base: [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
- Perfil Senior UI: [Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v1.md)
- Stack: [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)
- Primitive base: [Button.tsx](../../packages/ui/src/components/Button.tsx)
- Informe de trazabilidad: [INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../informes/INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- Artefactos faltantes detectados: no hay PRD/HLD específico de botones; esta fase se gobierna por la spec visual transversal y el design system existente.

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer la spec y el plan antes de tocar código. Ejecutar como estandarización visual, no como rediseño funcional.
2. Auditar usos manuales de botones en:
   - `apps/portal/src/components/commercial/**`
   - `apps/portal/src/components/users/**`
   - `apps/web/src/components/**`
   - `packages/ui/src/components/Button.tsx`
3. Clasificar cada acción encontrada como `primary`, `secondary`, `ghost`, `destructive`, `icon`, `link` o `badge`.
4. Ajustar `Button` para que:
   - comandos principales usen forma pill;
   - `secondary` sea pill outline;
   - `destructive` conserve rojo sólido para confirmaciones;
   - `size="icon"` tenga affordance suficiente para icon-only;
   - `loading`, `disabled`, `asChild`, `focus-visible` y dark mode se mantengan.
5. Migrar CTAs principales visibles:
   - `Nuevo plan`
   - `Agregar producto`
   - `Nueva definición`
   - acciones equivalentes de creación en Usuarios.
6. Migrar acciones repetidas:
   - `Editar` como secondary compacto o icon button según densidad.
   - `Eliminar` como danger icon suave en filas/listas; rojo sólido solo en modal de confirmación.
   - Refresh, llave, editar y eliminar como icon buttons con `aria-label`.
7. Revisar badges y contadores:
   - `Activo`, `2 registros`, `Administrador`, `1 activo` no deben tener hover/cursor de botón si no son interactivos.
8. Actualizar o agregar tests si cambian labels, roles ARIA, botones encontrados por `getByRole` o estados loading/disabled.
9. Capturar evidencia visual before/after de Comercial, Usuarios y Catálogo de impuestos en desktop y mobile.
10. Actualizar el informe vivo con archivos tocados, validaciones, deuda residual y stop/go.

## 4. Restricciones no negociables

- Usar `pnpm`, nunca `npm` ni `yarn`.
- No cambiar endpoints, DTOs, roles, permisos, tenancy, auth ni MFA.
- No agregar dependencias UI nuevas.
- No agregar `tailwind.config.js`; Tailwind v4 CSS-first se conserva.
- No hardcodear tenant, schema, credenciales ni tokens.
- Todo texto visible debe estar en español y sentence case.
- No usar `iwana-secondary` base como texto sobre blanco.
- Icon buttons deben tener `aria-label`, foco visible y área clicable suficiente.
- No esconder acciones frecuentes detrás de menús nuevos salvo que el patrón ya exista y sea necesario por densidad.

## 5. Entregables técnicos obligatorios

- `packages/ui/src/components/Button.tsx` alineado a la spec o deuda documentada si se decide no tocarlo.
- CTAs prioritarios migrados a `Button`.
- Acciones icon-only migradas a botones con affordance visual y accesible.
- Acciones destructivas repetidas ajustadas al patrón danger suave + confirmación.
- Tests actualizados cuando cambie semántica accesible.

## 6. Entregables documentales obligatorios

- Actualizar [INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../informes/INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md).
- Evidencia visual before/after desktop y mobile.
- Lista de comandos ejecutados y resultados.
- Inventario de deuda visual para botones no migrados.
- Stop/go documentado si aparece bloqueo.

## 7. Criterios de aceptación

- CA-BTN-01: `Button` soporta Command Pill + Utility Icon sin romper usos existentes.
- CA-BTN-02: CTAs de creación usan `Button` y forma pill consistente.
- CA-BTN-03: `Editar` repetido en tablas/listas usa secondary compacto o icon button, no estilos manuales divergentes.
- CA-BTN-04: `Eliminar` en filas/listas no aparece como rojo sólido repetido salvo confirmación.
- CA-BTN-05: Todo icon-only accionable tiene botón contenedor, `aria-label`, hover y focus-visible.
- CA-BTN-06: Badges y contadores pasivos no parecen botones.
- CA-BTN-07: No hay cambios de API, backend, roles, tenancy, stack ni librerías UI.
- CA-BTN-08: Contraste y foco cumplen WCAG 2.2 AA en botones tocados.
- CA-BTN-09: Portal Comercial, Usuarios y Catálogo de impuestos muestran una taxonomía coherente.
- CA-BTN-10: Informe vivo actualizado con validaciones y deuda residual.

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - normalizar botones exige cambiar comportamiento funcional o contrato API;
  - el cambio de `Button` rompe muchas pantallas fuera del alcance;
  - una variante requiere tokens globales nuevos;
  - se detecta pérdida de foco visible o contraste insuficiente;
  - se vuelve necesario rediseñar un flujo completo para resolver un botón.
- **Documentar causa en:** [INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../informes/INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- **Escalar a:** EM-ARCH; CTO solo por cambios de stack, tokens globales o lenguaje visual global.
- **Recomendación esperada:** mantener fase incremental y registrar deuda para Fase 02 si la migración total es riesgosa.

## 9. Criterio de salida de la fase

- Frontend validado:

```bash
pnpm --filter @iwana/ui typecheck
pnpm --filter @iwana/ui lint
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
```

- Tests focalizados:

```bash
pnpm --filter @iwana/portal test -- TaxCatalogManager.spec.tsx
```

- Validación visual archivada:
  - screenshots before/after de Comercial, Usuarios y Catálogo de impuestos;
  - desktop `1440x900` o viewport equivalente;
  - mobile `390x844` o viewport equivalente.
- Documentación archivada:
  - informe vivo actualizado con resultado, deuda residual y stop/go.
- Seguridad:
  - sin PII real, tokens, credenciales ni datos sensibles en código, tests, docs o capturas.
