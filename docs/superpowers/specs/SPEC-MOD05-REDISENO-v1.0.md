# SPEC - MOD05 Rediseno CRM

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Autor:** AI-EM-ARCH  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**ADR de referencia:** docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md  
**Informe soporte:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md (§9-10)

---

## 1. Proposito

Documenta las decisiones de rediseno que transformaron el CRM de un modelo dual (PotentialLead + ProspectCase) al modelo Expediente Unico Progresivo, incluyendo las correcciones de boundary entre MOD05 y MOD03.

---

## 2. Correcciones de boundary

### 2.1 Cobertura comercial: de CRM a MOD03

| Aspecto | Antes (Sprint 01) | Despues (Sprint 02) |
| --- | --- | --- |
| Ownership | CRM gestionaba cobertura | MOD03 (TenantModule) es owner |
| Acceso | Acceso directo a datos de cobertura | CRM consume via ICoverageReadPort |
| Razonamiento | Cobertura es configuracion del tenant, no datos comerciales | Boundary limpio |

### 2.2 Catalogo de planes: de CRM a MOD03

| Aspecto | Antes | Despues |
| --- | --- | --- |
| Ownership | CRM tenia tablas de planes | MOD03 es owner del catalogo |
| Acceso | Lectura directa | CRM consume via IPlanCatalogReadPort |
| Snapshots | No existian | Quote guarda planSnapshotJson al momento de cotizar |

### 2.3 Politica de ejecucion: de CRM a MOD03

| Aspecto | Antes | Despues |
| --- | --- | --- |
| Ownership | No definido | MOD03 via IExecutionPolicyReadPort |
| Funcion | — | Determina si transiciones requieren aprobacion manual o son automaticas |

---

## 3. Modelo antes vs despues

### 3.1 Modelo Sprint 01 (v1.1)

```
PotentialLead (captura inicial)
  ↓ [cualificacion manual]
ProspectCase (gestion comercial)
  ↓ [instalacion]
CustomerActivation (cierre)
  ↓
Subscriber (cliente activo)
```

Problemas:
- Datos fragmentados entre PotentialLead y ProspectCase.
- Sincronizacion manual de campos al transicionar.
- Sin captura progresiva: obligaba a completar formularios antes de avanzar.
- ConsentRecord v1 binario (accepted/rejected) sin canal ni texto legal.
- Sin completitud multidimensional.

### 3.2 Modelo Sprint 02 (v2.0 — Expediente Unico)

```
ExpedienteRecord (registro unico maestro)
  ├── ContactAttempt (intentos de contacto)
  ├── ConsentRecord v2 (consentimiento triple)
  ├── CoverageCheck (verificaciones cobertura)
  ├── StatusChange (transiciones auditadas)
  └── Quote (cotizaciones vinculadas)
      ↓ [al alcanzar CLIENTE_ACTIVO]
      Subscriber (creacion post-activacion)
```

Ventajas:
- Un solo registro con toda la informacion.
- 8 secciones editables independientemente.
- Captura progresiva: se avanza con lo que hay.
- 12 estados con validacion de campos minimos por transicion.
- Completitud 4D: comercial, legal, tecnica, operativa.
- Consentimiento triple Ley 1581 con trazabilidad completa.

---

## 4. Cambios en el portal

### 4.1 Componentes retirados (Sprint 01 legacy)

| Componente | Funcion | Estado |
| --- | --- | --- |
| PotentialForm | Formulario de high de potenciales | Retirado |
| PotentialList | Listado de potenciales | Retirado |
| ProspectBoard | Board kanban de prospectos | Retirado |
| ProspectDetail | Detalle de prospecto | Retirado |
| CustomerActivationFlow | Flujo de activacion | Retirado |

### 4.2 Componentes nuevos (Sprint 02)

| Componente | Funcion |
| --- | --- |
| CrmOverviewClient | Overview con metricas pipeline |
| Expedientes list page | Listado con creacion inline y filtros |
| Expediente detail page | Detalle con 8 secciones accordion, panel lateral, timeline |
| expediente-ui.ts | Metadata de estados, formatters |

---

## 5. Cambios en backend

### 5.1 Submodulos deprecados

| Submodulo | Estado | Razon |
| --- | --- | --- |
| PotentialsModule | Deprecado | Absorbido por ExpedientesModule |
| ProspectsModule | Deprecado | Absorbido por ExpedientesModule |
| ReviewsModule | Deprecado | Absorbido en logica de transiciones |

### 5.2 Submodulo nuevo

| Submodulo | Responsabilidad |
| --- | --- |
| ExpedientesModule | CRUD de expedientes, transiciones, completitud, timeline |

### 5.3 Servicios nuevos

| Servicio | Responsabilidad |
| --- | --- |
| ExpedienteService | CRUD + cifrado + completitud |
| StatusTransitionService | Validacion de campos minimos por transicion |
| CompletenessCalculator | Calculo de 4 dimensiones con degradacion segura |

---

## 6. Remediaciones aplicadas en Sprint 02

Brechas detectadas en auditoria post-ejecucion y sus correcciones:

| # | Brecha | Correccion |
| --- | --- | --- |
| 1 | Portal exponía flujo legado como principal | Redirect a expedientes; componentes legacy retirados |
| 2 | Acciones placeholder sin integracion real | Endpoints funcionales conectados |
| 3 | Cliente HTTP ignoraba filtros | Params correctos en api-client |
| 4 | Validacion Zod no aplicada en runtime | ZodBodyValidationPipe en create, updateSection, transitionStatus |
| 5 | createdBy/changedBy usaban tenantId | Corregido a @CurrentUser().sub (actor real) |
| 6 | Sin tests del controller | expedientes.controller.spec.ts creado |

### Hotfixes aplicados

| # | Hotfix | Detalle |
| --- | --- | --- |
| HF-01 | CompletenessCalculator degradacion | Captura 42P01/42703 sin crash |
| HF-02 | Migraciones tenant schema | Normalizar esquema MOD05 en tenant `iwana` |
| HF-03 | Validacion local portal | Validacion pre-POST + ApiError con detalles Zod |
| HF-04 | DTOs con @Allow() | Convivencia con ValidationPipe global de NestJS |
| HF-05 | @JoinColumn explicito | @JoinColumn({ name: 'expediente_id' }) en entidades hijas |

---

## 7. Decision de salida

**GO** — Rediseno completado. Modelo dual reemplazado por Expediente Unico. Boundaries corregidos: cobertura, catalogo y politica de ejecucion en MOD03. Portal actualizado. Remediaciones y hotfixes aplicados y verificados.

---

*Spec reconstruida por AI-EM-ARCH a partir del INFORME-MOD05-DEFINICION-v1.0.md §9-10 y el codigo fuente implementado.*
