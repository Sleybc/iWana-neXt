# PROMPT - MOD09 Retiro de Excepciones por Tecnico

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-22  
**Aprobacion:** CTO, 2026-05-22

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- ADR: `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md`
- Spec: `docs/specs/2026-05-22-mod09-wfm-field-operations-sin-excepciones-design.md`
- PRD: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- HLD: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Plan: `docs/plans/2026-05-22-retiro-excepciones-tecnico-wfm.md`
- Informe vivo: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Nombre de archivo destino: `PROMPT-MOD09-RETIRO-EXCEPCIONES-TECNICO-v1.0.md`

---

## Modulo

- Nombre: Programacion / WFM
- Codigo: MOD09
- Fase: Retiro limpio de Excepciones por tecnico
- Version: 1.0
- Fecha: 2026-05-22
- Generado por: Engineering Manager + Lead Architect

---

## 1. Objetivo exacto de la fase

- Resultado esperado: retirar de WFM la capacidad visible de Excepciones por tecnico y dejar field operations enfocada en horario base, horario por sede y cierres especiales.
- Lo que si entra: limpieza de UI, API, servicio, DTOs, entidad, pruebas y documentos asociados a `technician-business-overrides`.
- Lo que no entra: construir RR. HH., crear workflow de permisos/licencias, disenar integracion real con HCM o redisenar scheduling completo fuera del alcance definido.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- HLD del modulo: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- ADRs aplicables: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`, `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md`
- Sprint plan aplicable: `docs/plans/2026-05-22-retiro-excepciones-tecnico-wfm.md`
- Prompt arquitectonico origen: este documento
- Artefactos faltantes detectados: ninguno. ADR-041 quedo aprobada por CTO el 2026-05-22.

## 3. Instrucciones para Sr. Dev Fullstack

1. Retirar la seccion Excepciones por tecnico del frontend portal sin dejar copy transicional.
2. Limpiar `wfmApi.technicianBusinessOverrides` y todo consumo asociado en settings.
3. Retirar endpoints, DTOs, servicio y entidad de `technician-business-overrides` en WFM.
4. Adaptar `OperatingWindowResolverService` a la nueva precedencia sin overrides personales.
5. Revisar `TechnicianAvailability` solo para evitar dependencia visible accidental; no convertirlo en reemplazo funcional de la seccion retirada.
6. Actualizar pruebas unitarias, HTTP y E2E que hoy dependen del endpoint retirado.
7. Actualizar el informe vivo con evidencia real de ejecucion y cualquier deuda remanente.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No reintroducir disponibilidad individual visible con otro nombre en field operations.
- No acceder a tablas de otro modulo directamente.
- No inventar integracion con RR. HH. antes de que exista.
- No omitir migracion reversible si se retira la tabla tenant-aware.
- No dejar endpoints publicos vivos para una capacidad retirada de producto.

## 5. Entregables tecnicos obligatorios

- Codigo backend limpio de `technician-business-overrides`
- Codigo frontend sin seccion de excepciones por tecnico
- Migracion o script de base de datos para retiro controlado
- Tests unitarios, integracion y E2E actualizados
- Ajuste de contratos expuestos y, si aplica, OpenAPI

## 6. Entregables documentales obligatorios

- Actualizacion del informe vivo en `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Evidencia de calidad en `docs/quality/`
- Actualizacion de documentos rectores ya identificados si se detecta desviacion adicional
- Decision stop/go documentada si aparece bloqueo tecnico o inconsistencia arquitectonica

## 7. Criterios de aceptacion

- CA-RET-01: `/dashboard/settings/field-operations` ya no muestra Excepciones por tecnico.
- CA-RET-02: el portal sigue permitiendo configurar horario base, horario por sede y cierres especiales.
- CA-RET-03: la API publica ya no expone `/wfm/technician-business-overrides`.
- CA-RET-04: `OperatingWindowResolverService` resuelve con precedencia sin overrides personales visibles.
- CA-RET-05: los tests focalizados de portal, API y E2E quedan actualizados y en verde.

## 8. Criterio de stop/go

- Detenerse inmediatamente si el cleanup exige cambio de boundary no descrito en ADR-041, si aparece dependencia cross-module no aprobada o si la migracion de datos resulta no reversible.
- Documentar causa en: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Escalar a: CTO / Architect responsable
- Recomendacion esperada: decision explicita de continuar, acotar o dividir el cambio

## 9. Criterio de salida de la fase

- Backend validado: sin servicios, DTOs ni endpoints publicos de overrides
- Frontend validado: pantalla limpia y coherente con nuevo alcance
- Base de datos validada: retiro controlado o encapsulado de tabla legacy
- Tests en verde: si
- Documentacion archivada: si
