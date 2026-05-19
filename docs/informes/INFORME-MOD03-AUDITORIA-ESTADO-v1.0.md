# INFORME — MOD03 Configuracion Empresarial — Auditoria de Estado y Brechas

**Version:** 1.4  
**Estado:** Aprobado  
**Fecha:** 2026-03-24  
**Convencion documental:** INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md

## Vinculos de trazabilidad

- PRD auditado: `docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` (actualizado a v1.1)
- HLD auditado: `docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` (actualizado a v1.1)
- Informe Fase 01: `docs/informes/INFORME-MOD03-DEFINICION-v1.0.md`
- Plan de Ejecución Fase 02: `docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md`
- **Plan de Ejecución Fase 02-B:** `docs/sprints/PLAN-MOD03-FASE-02B-SPRINT-01-v1.0.md` (nuevo)
- **Prompt de Ejecución Fase 02-B:** `docs/prompts/PROMPT-MOD03-FASE-02B-v1.0.md` (nuevo)
- PRDs Cruzados Verificados: `PRD-MOD04-USUARIOS-INTERNOS-v1.0.md`, `PRD-MOD05-CRM-DEFINICION-v2.0.md`

## Changelog

| Version | Fecha | Cambios |
| --- | --- | --- |
| 1.0 | 2026-03-24 | Emision inicial con gap analysis |
| 1.1 | 2026-03-24 | Actualizacion post-planificacion: se formalizaron PRD v1.1, HLD v1.1, sprint plan y prompt de ejecucion para cerrar brechas |
| 1.2 | 2026-03-24 | Actualizacion post-implementacion tecnica de Fase 02B: backend DELETE, frontend ABM + mapa, E2E ampliado y validaciones |
| 1.3 | 2026-05-19 | Formalizacion arquitectonica MOD03 v2 como control plane federado con Organizacion/Sedes y Usuarios/Acceso |
| 1.4 | 2026-05-19 | Aprobacion CTO: el control plane se transfiere a MOD00; MOD03 queda como antecedente historico |

---

## 1. Resumen Ejecutivo

A solicitud del usuario, se ha realizado una auditoría del estado del Módulo 03 (Configuración Empresarial) contrastando el código actual en el repositorio y los artefactos documentales vigentes, **incluyendo los módulos adyacentes MOD04 y MOD05**.

**El resultado del análisis es que el módulo MOD03 está parcialmente completado.**
La Fase 01 se encuentra terminada, validada y documentada, mientras que la Fase 02 (Cobertura Comercial y Planes y Valores) ha sido implementada a nivel de Backend, pero **le falta completamente la implementación del Frontend (interfaz de usuario ABM) en el Portal Empresarial.**
Dicha interfaz frontend **NO** está contemplada ni delegada a MOD04 ni MOD05, sino que es una dependencia estricta para que MOD05 pueda operar.

---

## 2. Hallazgos y Brechas (Gap Analysis)

### 2.1 Fase 01: Perfil Empresarial y Configuración Operativa

**Estado:** Completado (100%)

- **Backend:** Endpoints `PATCH /api/v1/tenants/me/profile` y `PATCH /api/v1/tenants/me/settings` operativos.
- **Frontend:** Formularios en `/dashboard/settings` válidos y funcionales. Pruebas E2E exitosas.
- **Documentación:** El HLD y todos los ADRs referenciados (ADR-016, ADR-018, ADR-019, ADR-022, ADR-023) existen y están disponibles. El previo `ANALISIS-PRD-MOD03-v1.0.md` era inexacto informando que faltaban.

### 2.2 Fase 02: Cobertura Comercial y Catálogo de Planes

**Estado:** En progreso (Aprox. 60%)

Según el plan vigente (`PLAN-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md`), el alcance de la Fase 02 abarca persistencia, backend y frontend.

#### Backend (Completado)

- Los servicios de planes y cobertura ya están creados en TenantModule (`TenantService`).
- Las entidades `CommercialNode`, `CoverageZone` y `PlanCatalogItem` existen en la base de datos con su auditoría correspondiente.

#### Frontend (Pendiente / Brecha)

- **Brecha 1:** Faltan las rutas `apps/portal/src/app/dashboard/settings/coverage` y `apps/portal/src/app/dashboard/settings/plans` para que el Administrador registre nodos y planes.
- **Brecha 2:** No hay enlaces en el componente de navegación lateral `Sidebar.tsx`.
- Las tareas `BT-CE2-07`, `BT-CE2-08` y `BT-CE2-09` del Plan Fase 02 siguen sin implementarse.

### 2.3 Impacto Cruzado con MOD04 y MOD05

Para descartar redundancias, se auditaron los PRD de módulos adyacentes:

- **MOD04 (Usuarios Internos):** Este módulo rige exclusivamente la creación y jerarquía de empleados dentro de la consola, manejo de roles (RBAC) y cumplimiento de Habeas Data, **no** contempla ABM comercial de Cobertura o Planes.
- **MOD05 (CRM Experimento Único):** Según la sección "Fuera de Scope" del `PRD-MOD05`, el ABM de cobertura y catálogos de planes pertenece expresamente a MOD03. MOD05 actúa como **consumidor solo lectura** (Read-Only Consumer) de estos servicios de MOD03 mediante los puertos `CoverageReadPort` y `PlanCatalogReadPort`.

**Impacto:** Al no haber pantalla de configuración en MOD03 para que la empresa administradora ingrese los planes y la cobertura comercial, el CRM de MOD05 se queda sin datos semilla para funcionar con cotizaciones.

---

## 3. Conclusión y Recomendaciones

La arquitectura es coherente, pero la paralización en el Frontend Fase 02 de MOD03 genera un bloqueo funcional para la completitud productiva del CRM MOD05.

**Siguientes Pasos (Next Steps):**

1. **Ejecutar Frontend:** Iniciar el desarrollo de las rutas de `/coverage` y `/plans` en `apps/portal/src/app/dashboard/settings` para completar la Fase 2 del MOD03.
2. Tras la codificación, aplicar pruebas E2E con Playwright simulando la carga de un nodo comercial y un plan, garantizando que queden listos para consumo por MOD05.

---

## 4. Acciones correctivas formalizadas (v1.1)

Tras la emision del informe v1.0, se realizo el siguiente trabajo de planificacion para cerrar las brechas identificadas:

### 4.1 Documentos actualizados

| Documento | Cambio                                                                                                                       | Version |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| PRD-MOD03 | Ampliado con CU-06 a CU-11, RF-CE-21 a RF-CE-40, contratos DELETE, mapa Leaflet, criterios de aceptacion CA-CE-09 a CA-CE-17 | v1.1    |
| HLD-MOD03 | Ampliado con contratos de cobertura y planes, componentes frontend (ABM + mapa), deployment notes Leaflet, riesgos v1.1      | v1.1    |

### 4.2 Documentos nuevos generados

| Documento                                            | Proposito                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `docs/sprints/PLAN-MOD03-FASE-02B-SPRINT-01-v1.0.md` | Sprint plan con backlog de 25 tareas (P0-P4), dependencias, selectores E2E, criterios de aceptacion                      |
| `docs/prompts/PROMPT-MOD03-FASE-02B-v1.0.md`         | Prompt de ejecucion para Sr. Dev Fullstack con instrucciones paso a paso, restricciones, entregables y criterios stop/go |

### 4.3 Decisiones clave tomadas

1. **Mapa interactivo Leaflet:** Se eligio `leaflet` + `react-leaflet` (MIT, OpenStreetMap, sin API key) para visualizar nodos y zonas. Requiere `next/dynamic({ ssr: false })` por acceso a `window`.
2. **Endpoints DELETE (soft-delete):** Se decidio agregar `DELETE /tenants/me/coverage/nodes/:id` y `DELETE /tenants/me/coverage/zones/:id` con soft-delete (no toggle simple) para consistencia con el patron de `deletePlan()`.
3. **E2E completo con roles:** Suite Playwright con CRUD cobertura + CRUD planes + validacion factibilidad + validacion NOC read-only.

### 4.4 Estado de brechas post-planificacion

| Brecha original                            | Estado actual                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Brecha 1: Falta ABM frontend de cobertura  | **Plan formalizado** — Sprint plan con 12 tareas P1+P2, prompt con instrucciones detalladas |
| Brecha 2: Falta enlaces navegacion lateral | **Incluido en refactorizacion** de CommercialCoverageCard (tarea BT-CE2B-11)                |
| Impacto MOD05 sin datos semilla            | **Desbloqueado** al completar estas tareas, MOD05 CRM tendra datos de cobertura y planes    |
| Falta E2E                                  | **Plan formalizado** — 7 tests E2E en P3 del sprint                                         |
| Falta DELETE endpoints                     | **Plan formalizado** — 4 tareas P0 del sprint                                               |

### 4.5 Siguiente paso

El Sr. Dev Fullstack debe ejecutar el prompt `PROMPT-MOD03-FASE-02B-v1.0.md` siguiendo el sprint plan `PLAN-MOD03-FASE-02B-SPRINT-01-v1.0.md`. Al finalizar, crear el informe de sprint `INFORME-MOD03-FASE-02B-v1.0.md` y actualizar este informe con los resultados finales.

---

## 5. Resultados post-implementacion Fase 02B (2026-03-24)

### 5.1 Estado de cierre de brechas

| Brecha                                            | Estado post-ejecucion    |
| ------------------------------------------------- | ------------------------ |
| Endpoints DELETE cobertura (nodos/zonas)          | Cerrada                  |
| Frontend ABM cobertura (tablas + dialogs)         | Cerrada                  |
| Integracion mapa interactivo Leaflet              | Cerrada                  |
| API client deleteCoverageNode/deleteCoverageZone  | Cerrada                  |
| E2E cobertura + planes + read-only + factibilidad | Cerrada en spec objetivo |

### 5.2 Evidencia tecnica implementada

- Backend: se agregaron endpoints self-service de cobertura y planes en `TenantController`, incluyendo DELETE con soft-delete para nodos y zonas.
- Backend: `TenantService` ahora incluye `removeCoverageNode`, `removeCoverageZone` y `removePlanCatalogItem` con auditoria e idempotencia.
- Backend tests: `tenant.service.spec.ts` incorpora pruebas unitarias para soft-delete de nodos y zonas.
- Frontend portal: se implementaron componentes nuevos para cobertura (`CoverageNodeTable`, `CoverageZoneTable`, `CoverageNodeDialog`, `CoverageZoneDialog`, `CoverageCheckSection`, `CoverageMap`, `CoverageMapWrapper`) y refactor de `CommercialCoverageCard` como orquestador.
- Frontend portal: se instalaron `leaflet`, `react-leaflet` y `@types/leaflet`; iconos copiados a `apps/portal/public/leaflet/`.
- E2E: `e2e/tests/portal-settings-empresa.spec.ts` se amplio con casos CRUD de nodos, zonas y planes, read-only por rol y validador de factibilidad.

### 5.3 Validaciones ejecutadas

- `pnpm --filter @iwana/api typecheck`: OK.
- `pnpm --filter @iwana/portal typecheck`: OK.
- `pnpm --filter @iwana/portal lint`: OK (warning no bloqueante de tipo de modulo en config raiz).
- `pnpm exec playwright test e2e/tests/portal-settings-empresa.spec.ts --config e2e/playwright.portal.config.ts`: 11/11 OK.
- `pnpm --filter @iwana/api test`: ejecucion parcialmente fallida por issue transversal de Jest + ESM (`otplib/@scure`) en `platform-users.controller.spec.ts` no causado por cambios de MOD03.

### 5.4 Riesgos abiertos

1. Existe deuda tecnica transversal en entorno de tests del API por compatibilidad ESM en dependencia `otplib`.
2. La suite completa `pnpm test:e2e:portal` mantiene fallos en specs no relacionadas con MOD03 (MFA setup y auth notifications), fuera del alcance funcional de este cierre.

### 5.5 Ajustes correctivos UX en cobertura comercial (2026-03-24)

- Frontend portal: se corrigio `CommercialCoverageCard` para que los toggles de estado y acciones de eliminacion reflejen el cambio de inmediato en UI sin requerir recarga completa de la pagina.
- Estrategia aplicada: optimistic update local para nodos y zonas, con rollback unicamente si la mutacion del backend falla.
- Frontend portal: se corrigio `CoverageMap` con `ResizeObserver` para invalidar tamano del mapa cuando el tab `Comercial` pasa de oculto a visible, evitando el render parcial de tiles.
- Frontend portal: se desacoplo el `loading` de los botones `Agregar nodo`, `Agregar zona` y `Crear nodo de prueba` para que no hereden el spinner de toggles o deletes ejecutados sobre la tabla.
- Design system: se elevo el z-index de `Dialog` para garantizar que overlays y contenido modal queden por encima de los panes internos de Leaflet, corrigiendo la superposicion visual del mapa al abrir `Nueva zona`.
- Frontend portal: se corrigio el runtime `React is not defined` al entrar a `/dashboard/settings`. Causa raiz: `WeekGrid` en `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx` habia quedado usando `React.Fragment` como hijo raiz de `week.map(...)` sin importar el namespace `React`, lo que rompe en ejecucion con el runtime JSX actual. Ajuste aplicado: se importo `Fragment` directamente desde `react` y se reemplazo `React.Fragment` por `Fragment` manteniendo `key={day.weekday}` en el hijo raiz. Validacion: diagnostico limpio del archivo tras el cambio.
- Frontend portal: se corrigio el selector de horas en `/dashboard/settings` para alinearlo con el design system. Causa raiz: `WfmOperatingHoursManager` seguia usando `input[type="time"]`, lo que delegaba el picker al navegador y producia un popup nativo ajeno al lenguaje visual de iWana; en el primer reemplazo, la variante compacta del trigger no tenia ancho util suficiente dentro de la tabla y ocultaba los valores seleccionados. Ajuste aplicado: se reemplazaron los controles nativos de hora en `WeekGrid` y en el formulario de overrides por un selector compuesto `HH:mm` basado en `Select` de `@iwana/ui`, conservando el valor final `HH:mm` para no tocar contratos ni validaciones; despues se recalibro la variante compacta para centrar realmente el valor del trigger, mover el chevron a una posicion absoluta para no sesgar el texto hacia la derecha, reservar padding lateral para que el icono no se monte sobre el ultimo caracter, abrir mas el ancho horizontal del control, suavizar su geometria hacia una forma mas ovalada, normalizar placeholders en minuscula sin negrilla y reducir el ancho/alto del dropdown a una escala coherente con listas de dos digitos. Validacion: spec focalizada `WfmOperatingHoursManager.spec.tsx` en verde y sin `input[type="time"]` remanentes en el render del manager.

---

---

## 6. Actualizacion arquitectonica MOD00 — Control Plane (2026-05-19)

### 6.1 Motivo

Durante la revision de Configuracion Empresarial, WFM y la vision operativa del tenant, se identifico que la nocion de **sede operativa** ya no puede permanecer encerrada en WFM. La sede debe servir tambien para empleados, responsables de inventario, recaudo, atencion al cliente, bases tecnicas, bodegas y futuros flujos de RRHH, Inventory y Billing.

Tambien se identifico que MOD04 Users mantiene `UserRole` fijo y que los permisos granulares estaban diferidos. Para soportar acceso por modulos y perfiles configurables sin debilitar seguridad, el control plane aprobado como **MOD00 Configuracion** debe incluir una seccion de **Usuarios y acceso** con perfiles configurables sobre roles base.

### 6.2 Documentos generados

| Documento | Estado | Proposito |
| --- | --- | --- |
| `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md` | Aprobado | Decision CTO para MOD00 Configuracion como control plane federado, Organizacion/Sedes y perfiles de acceso |
| `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | Aprobado | Alcance funcional MOD00 con Organizacion y Usuarios/Acceso |
| `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | Aprobado | Arquitectura tecnica, tablas, contratos REST, seguridad, migracion WFM |
| `docs/plans/2026-05-19-mod00-configuracion-control-plane.md` | Aprobado para ejecucion | Plan de implementacion task-by-task para fullstack |
| `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md` | Aprobado para ejecucion | Prompt operativo para Sr. Dev Fullstack basado en la plantilla oficial |
| `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | Aprobado | Informe vivo de MOD00 Fase 01 |

### 6.3 Decisiones principales

1. Configuracion centraliza la experiencia administrativa, no el ownership de todos los dominios.
2. Organizacion/Sedes se convierte en subdominio transversal administrado desde Configuracion.
3. WFM conserva agenda, Work Orders, overrides, ventanas de despacho y ejecucion de campo.
4. Inventory futuro sera owner de stock, seriales, MACs, bodegas y movimientos.
5. Billing futuro sera owner de recaudo, caja, cartera y facturacion.
6. Users/Auth conservan `UserRole` como rol base; Access Profiles agrega permisos configurables por tenant.
7. No se permite crear roles backend dinamicos desde la UI del tenant.

### 6.4 Estado de aprobacion

CTO aprueba ADR-040 el 2026-05-19. El paquete documental se renombra a MOD00 y queda habilitado para ejecucion fullstack. MOD03 Configuracion Empresarial v1.x se conserva como antecedente historico y no debe recibir nuevas responsabilidades de control plane.

_Documento actualizado a v1.4 — AI-EM-ARCH_  
_Fecha: 2026-05-19_
