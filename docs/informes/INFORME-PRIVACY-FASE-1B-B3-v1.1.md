# INFORME — Privacy Fase 1B · B3 · v1.1

**Estado:** Implementado; pendiente de verificación global de la fase.  
**Base:** S1′ de B1 confirmado; los esquemas de B3 se publicaron primero (S2′).  
**Propiedad:** `crm/subscribers/**`, `crm/expedientes/**`, `crm/contracts/**` y los esquemas shared expresamente asignados por el delta v1.1. No se modificó `crm/contacts/**` ni `privacy/**`.

## Cambio

El esquema de suscriptor expone `anonymizedAt` y `anonymizedRequestId` en sus proyecciones. El esquema de contrato agrega únicamente `titularAnonymizedAt`, derivado del suscriptor. `privacyRestricted` pertenece a la proyección del suscriptor/expediente y no se añadió al contrato.

Las lecturas CRM aplican `canSeeBlocked = privacy.read || crm.blocked_data.read`. Las lecturas individuales de datos bloqueados autorizadas generan `RECORD_ACCESS` con el permiso que habilitó la vista; los listados registran `blockedServed` cuando entregan filas bloqueadas sin redactar. Sin esos permisos:

| Proyección / campos                                                                                                                                                                                                              | Regla aplicada                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suscriptor: `id`, `tenantId`, `partyId`, `userId`, `personType`, `customerSegment`, `documentType`, estado, tratamiento IVA, régimen tributario, `expedienteId`, fechas de conversión/activación/creación/actualización y marcas | Se conservan conforme a la lista permitida de §2.11; se agregan `privacyRestricted`, `anonymizedAt` y `anonymizedRequestId`.                                                                                                                               |
| Suscriptor: demás campos personales, contacto, ubicación, fiscal y comercial                                                                                                                                                     | Se proyectan como `null`; `contactPending` queda en `false`. La construcción por lista permitida evita pasar campos nuevos por accidente.                                                                                                                  |
| Expediente: identificadores, etapa, estado, fechas y asignaciones                                                                                                                                                                | Se conservan con `privacyMarks`, `privacyRestricted`, `anonymizedAt` y `anonymizedRequestId`. Los campos personales y de contacto/ubicación se redactan; el `subscriberSummary.fullName` del bootstrap también queda en `null`.                            |
| Contratos dentro de listado, detalle, suscriptor y vista 360°                                                                                                                                                                    | Se expone `titularAnonymizedAt`. Para un titular bloqueado sin permiso, se redactan los datos personales y los campos sensibles de dirección/coordenadas, evidencia de estrato y snapshot fiscal; las vistas autorizadas conservan la proyección completa. |
| Búsqueda de suscriptores y expedientes                                                                                                                                                                                           | Texto y criterios exactos excluyen titulares bloqueados mediante el puerto de marcas y filtro SQL parametrizado `<> ALL`; el listado sin búsqueda conserva la fila redactada.                                                                              |

Las mutaciones bloqueadas devuelven 409 `PRIVACY_DATA_BLOCKED` en las rutas enumeradas por §5.3: actualización del suscriptor, edición de expediente y reintento de conversión, actualización de contrato y punto de servicio, evidencia de estrato, y creación de contratos —incluida la creación desde expediente— para el titular. `crm.blocked_data.read` no habilita mutaciones. Los estados/transiciones y las lecturas GET anidadas no se añadieron a esa lista normativa.

## Línea base y verificación

La medición comparable de `crm/subscribers` en `main` se tomó antes de editar B3: **14 suites / 285 tests**. La corrida final no-cache ejecutó el conjunto CRM completo, y la cobertura se limitó al mismo módulo productivo que la línea base.

Comando final ejecutado desde la raíz:

```powershell
pnpm --filter @iwana/api exec jest --no-cache --runInBand --coverage `
  --coverageDirectory="../../coverage/privacy-b3-v11-final" `
  --coverageReporters=text-summary --coverageReporters=json-summary --coverageReporters=json `
  --collectCoverageFrom="modules/crm/subscribers/**/*.ts" `
  --coveragePathIgnorePatterns="\.spec\.ts$" --coverageThreshold="{}" `
  --testPathPattern="modules/crm/(subscribers|contracts|expedientes)"
```

Resultado real: **33 suites aprobadas / 663 tests aprobados / 0 snapshots**. La cobertura de `crm/subscribers` quedó así:

| Métrica    |      Base en `main` |               Final | Diferencia |
| ---------- | ------------------: | ------------------: | ---------: |
| Statements | 93,81 % (1123/1197) | 94,05 % (1202/1278) |   +0,24 pp |
| Branches   |   83,20 % (560/673) |   83,42 % (629/754) |   +0,22 pp |
| Functions  |   91,47 % (118/129) |   90,97 % (131/144) |   −0,50 pp |
| Lines      | 94,34 % (1051/1114) | 94,53 % (1125/1190) |   +0,19 pp |

El criterio explícito de B3 para `crm/subscribers` —statements y branches sin bajar— se cumple. Functions queda 0,50 puntos porcentuales por debajo de la base y se registra como diferencia informativa. Además pasó, sin caché, el test de `contract.schema.spec.ts`: **1 suite / 7 tests**. Pasaron `tsc --noEmit -p tsconfig.json` de API y `pnpm --filter @iwana/shared typecheck`.

La configuración ordinaria de Jest no ejecuta los `*.postgres.integration.spec.ts`; no se declara aquí evidencia de integración PostgreSQL. Los errores emitidos por pruebas de ramas de error son salidas esperadas de fixtures sintéticos.

## Deuda nueva por severidad

| Severidad | Deuda                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0        | Ninguna.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P1        | Los GET directos de subrecursos de expediente —timeline, soportes/descarga, intentos de contacto, consentimientos y verificaciones de cobertura— aún dependen de sus permisos CRM ordinarios y no consultan `DATOS_BLOQUEADOS` ni registran `RECORD_ACCESS`/`LIST_ACCESS` de privacidad. La UI del detalle bloqueado oculta las pestañas, pero eso no sustituye un control en API. Se deja como observación de lectura para decisión de alcance; el delta §5.3 enumera mutaciones y B3 no amplió el contrato de lectura. |
| P2        | Functions de `crm/subscribers`: 90,97 % frente a 91,47 % de base (−0,50 pp). Statements y branches sí superan los umbrales textuales de B3.                                                                                                                                                                                                                                                                                                                                                                              |
| P3        | Ninguna.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
