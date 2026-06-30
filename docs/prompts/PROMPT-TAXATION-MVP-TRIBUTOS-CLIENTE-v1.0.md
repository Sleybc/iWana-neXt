# PROMPT — Ejecución MVP Taxation: tributos por cliente

**Versión:** 1.0
**Estado:** Listo para ejecución
**Fecha:** 2026-04-22

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Archivo destino: `docs/prompts/PROMPT-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md`
- Convención documental general: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`
- Sprint plan base: `docs/sprints/PLAN-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md`

## Modulo

- Nombre: Taxation + Subscribers fiscal profile MVP
- Codigo: MOD07 + MOD05
- Fase: MVP-TRIBUTOS-CLIENTE
- Version: 1.0
- Fecha: 2026-04-22
- Generado por: Lead Software Architect Senior
- Nombre de archivo destino: `PROMPT-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md`

---

## 1. Objetivo exacto de la fase

- Resultado esperado:
  Implementar el MVP operativo de tributos por cliente, con catálogo maestro en `TaxationModule`, asignación tributaria por cliente, sugerencia editable de IVA por estrato y visualización clara en Suscriptor 360.
- Lo que si entra:
  - simplificación de la UX visible tributaria,
  - mantenimiento del catálogo de tributos,
  - submodelo de perfil tributario del cliente,
  - configuración tributaria por facturación,
  - lectura del perfil tributario en Suscriptor 360,
  - soporte a tasas fijas y variables,
  - sugerencia de IVA por estrato editable.
- Lo que no entra:
  - motor visible de reglas tributarias,
  - simulador tributario como flujo operativo principal,
  - aplicación automática de tributos territoriales por municipio de residencia,
  - automatización masiva de cambios normativos.

## 2. Artefactos de entrada obligatorios

- PRD del modulo:
  - `docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md`
  - `docs/prds/PRD-ADDENDUM-TAXATION-PARTIES-v1.0.md`
- HLD del modulo:
  - `docs/hlds/HLD-MOD07-TAXATION-v1.0.md`
  - `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
  - `docs/hlds/HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum.md`
- ADRs aplicables:
  - `docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md`
  - `docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md`
  - `docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md`
- Sprint plan aplicable:
  - `docs/sprints/PLAN-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md`
- Prompt arquitectonico origen:
  - `docs/specs/2026-04-22-taxation-mvp-tributos-por-cliente-design.md`
  - `docs/specs/2026-04-21-taxation-bounded-context-design.md`
  - `docs/specs/2026-04-20-reglas-comerciales-design.md`
- Artefactos faltantes detectados:
  - Alinear formalmente PRD/HLD si este refinamiento MVP se adopta como baseline definitivo.

## 3. Instrucciones para Sr. Dev Fullstack

1. Implementar backend requerido por la fase.
   - Mantener `TaxationModule` como dueño del catálogo.
   - No exponer reglas tributarias complejas al usuario del MVP.
   - Crear el submodelo tributario del cliente en el bounded context dueño del cliente, recomendado bajo Subscribers/CRM.
   - Implementar entidades o tablas equivalentes para perfil tributario del cliente y asignaciones tributarias.
   - Implementar lectura y escritura de asignaciones tributarias por cliente con trazabilidad de estado: `SUGGESTED`, `CONFIRMED`, `MANUAL_ADJUSTMENT`.
   - Implementar sugerencia editable de tratamiento de IVA por estrato.

2. Implementar frontend requerido por la fase.
   - Simplificar `TaxCatalogManager` para que opere solo catálogo.
   - Retirar del flujo principal del MVP el protagonismo de `TaxApplicationRulesManager` y del simulador.
   - Crear interfaz de configuración tributaria por cliente en el flujo de facturación usando checklist de tributos.
   - Mostrar tasas fijas provenientes del catálogo y solicitar tasas variables al asignar.
   - Añadir en Suscriptor 360 una vista clara del perfil tributario del cliente.

3. Implementar migraciones y cambios de base de datos.
   - Mantener reversibilidad.
   - No romper el catálogo existente.
   - No modelar tributos territoriales como resultado automático por municipio de residencia.

4. Actualizar contratos, validaciones y seguridad.
   - Extender `apps/portal/src/lib/api-client.ts` con contratos de perfil tributario del cliente.
   - Validar entradas con Zod donde corresponda.
   - Mantener tenant isolation y no hardcodear tenant ni schema.

5. Documentar decisiones y desvíos.
   - Si encuentras conflicto entre el baseline documental viejo y este refinamiento MVP, documenta el punto exacto y escala antes de continuar.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No usar credenciales ni datos reales.
- No omitir pruebas ni documentación.
- `TaxationModule` sigue siendo dueño exclusivo del catálogo.
- El perfil tributario del cliente no debe vivir dentro de `Taxation`.
- El municipio no puede ser disparador automático general de tributos territoriales.
- Las entidades públicas colombianas deben tratarse como personas jurídicas con tributos propios cuando el caso de negocio lo exija.

## 5. Entregables tecnicos obligatorios

- Codigo backend para perfil tributario por cliente.
- Codigo frontend para checklist tributario y vista en Suscriptor 360.
- Migraciones o scripts de base de datos necesarios.
- Tests unitarios, integración y E2E segun aplique.
- Actualizacion de OpenAPI o contratos.

## 6. Entregables documentales obligatorios

- Informe de fase en `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md`
- Evidencia de calidad en `docs/quality/`
- Actualizacion de PRD/HLD si cambió algo aprobado durante la ejecución
- Decision stop/go documentada si aparece bloqueo tecnico
- Si la fase corresponde a correccion o ajuste, actualizar el informe vigente relacionado y no crear uno nuevo

## 7. Criterios de aceptacion

- CA-MVP-01: el catálogo de tributos puede administrarse sin exponer reglas complejas al usuario final.
- CA-MVP-02: un cliente puede tener un checklist de tributos confirmados y ajustados manualmente.
- CA-MVP-03: los tributos de tasa fija reutilizan la tasa del catálogo; los variables piden tasa al asignar.
- CA-MVP-04: el sistema sugiere tratamiento de IVA por estrato y facturación puede confirmarlo o ajustarlo.
- CA-MVP-05: Suscriptor 360 muestra el perfil tributario con lenguaje claro y trazabilidad operativa.
- CA-MVP-06: un cliente residencial no recibe tributos territoriales solo por vivir en un municipio donde existan tributos de una entidad pública.

## 8. Criterio de stop/go

- Detenerse inmediatamente si:
  - la implementación exige contradecir ADR-029, ADR-030 o ADR-031 sin documento formal de ajuste,
  - se requiere mover ownership del catálogo fuera de `Taxation`,
  - se detecta que el perfil tributario del cliente invade boundaries de Billing o Taxation.
- Documentar causa en:
  - `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md`
- Escalar a:
  - CTO Humano
  - Engineering Manager / Architect
- Recomendacion esperada:
  - continuar,
  - ajustar artefactos,
  - o emitir addendum/ADR si el cambio se vuelve estructural.

## 9. Criterio de salida de la fase

- Backend validado: perfil tributario y asignaciones por cliente operativos.
- Frontend validado: catálogo simple, configuración por checklist y Suscriptor 360 actualizados.
- Base de datos validada: migraciones reversibles y tenant-safe.
- Tests en verde: unitarios, integración y E2E relevantes.
- Documentacion archivada: informe vivo actualizado y desvíos registrados.