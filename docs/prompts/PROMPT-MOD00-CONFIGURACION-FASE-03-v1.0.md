# PROMPT - MOD00 Configuracion Fase 03

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-19  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 03 - Settings federados por modulo owner  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md

---

## 1. Objetivo exacto de la fase

Convertir settings en un shell federado donde MOD00 organiza navegacion y estados, mientras cada modulo owner conserva sus datos y endpoints.

### Lo que si entra

- Registry backend de secciones de settings.
- Portal shell con secciones, owner y estado.
- Estados `Disponible`, `Proximamente` y `No configurado`.
- Pruebas para no renderizar formularios falsos.

### Lo que no entra

- Implementar modulos futuros.
- Mover tablas de otros dominios a MOD00.
- Crear JSONB general de settings.

## 2. Artefactos de entrada obligatorios

- ADR MOD00: docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- PRD MOD00: docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- HLD MOD00: docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Plan Fase 03: docs/plans/2026-05-19-mod00-configuracion-fase-03-settings-federados.md
- Checklist Fase 03: docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-03-v1.0.md
- ADR Commercial: docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md
- ADR WFM: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md

## 3. Instrucciones para Sr. Dev Fullstack

1. Confirmar Fase 01 y Fase 02 cerradas o decidir compatibilidad explicita.
2. Crear registry de secciones como metadata, no como owner de datos.
3. Implementar settings shell del portal.
4. Mantener modulos futuros como estados no disponibles sin formularios.
5. Cubrir flujo con tests y Playwright.

## 4. Restricciones no negociables

- MOD00 no accede a tablas internas de otros modulos.
- No crear formularios que simulen Billing, Inventory, HR o NMS.
- No mostrar enums crudos.
- No romper rutas existentes de settings.

## 5. Entregables tecnicos obligatorios

- `SettingsRegistryService`.
- Endpoint REST de secciones.
- Shell frontend de settings.
- Componentes de estado no disponible.
- Tests y E2E focalizados.

## 6. Entregables documentales obligatorios

- Informe MOD00 actualizado.
- Checklist Fase 03 cerrado.
- Owner map documentado si cambia frente al HLD.

## 7. Criterios de aceptacion

- CA-CFG3-01: Settings lista secciones con owner y estado.
- CA-CFG3-02: Organization, Access y Field Operations abren rutas reales.
- CA-CFG3-03: Inventory/Billing futuros no muestran formularios falsos.
- CA-CFG3-04: Backend registry no lee tablas domain-owned.
- CA-CFG3-05: UI conserva textos en espanol y sentence case.

## 8. Criterio de stop/go

Detenerse si una seccion requiere mover ownership de datos a MOD00 sin ADR adicional. Documentar y escalar con `[ESCALACION AL CTO]`.

## 9. Criterio de salida de la fase

- Registry validado.
- Portal shell validado.
- Estados futuros validados.
- E2E ejecutado o bloqueo documentado.
- Informe actualizado.
