# INFORME — Privacy DT-3 · B1-R · clasificación de contratos

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-11-01
**Contrato:** [DT-3 v1.1](../specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md), D-RER-1 a 3.
**Alcance:** anexo de clasificación previo a editar de B1-R; solo contratos.

## Evidencia roja y clasificación previa

Jest aislado: 1 suite fallida; 41 fallidos y 63 aprobados, 104 totales, 0 omitidos.

Todas las referencias corresponden a apps/api/src/modules/crm/contracts/tests/.

| Prueba (archivo:línea antes del cambio)                                                                                    | Categoría | Causa y autorización                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| contracts.service.spec.ts:549 · requiere un archivo antes de cargar soporte o consultar el contrato                        | b         | La aserción sin transacción contradice D-RER-3.4: 404/anonimizado se evalúan antes de validar el payload.                                           |
| contracts.service.spec.ts:561 · propaga el 503 de almacenamiento no privado sin tocar el contrato                          | b         | D-RER-3.4 exige lectura temprana de privacidad; se ajusta únicamente el conteo 2 → 3 y el doble. 503 y ausencia de mutación se conservan.           |
| contracts.service.spec.ts:592 · reemplaza y limpia un soporte previo en un borrador sin recalcular IVA                     | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:645 · reemplaza el soporte de un contrato activo y recalcula el snapshot                         | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:764 · exige al menos un campo del punto de servicio                                              | b         | La aserción sin transacción contradice D-RER-3.4: 404/anonimizado se evalúan antes de validar el payload.                                           |
| contracts.service.spec.ts:771 · rechaza el cambio dedicado cuando el contrato no está activo                               | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:807 · conserva el uso actual si solo se edita el estrato y audita campos sin PII                 | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:863 · audita tratamiento anterior nulo para un contrato activo heredado sin instantánea          | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:906 · es idempotente si el contrato borrador no tiene soporte                                    | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:1886 · activa y persiste la instantánea resuelta desde el catálogo y el puerto de Taxation       | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:1943 · rechaza una transición si la versión del contrato cambió después de la lectura            | b         | La expectativa parte de entidad fuera de bloqueo; D-RER-3.3 obliga releer dentro del bloqueo y aplicar transición sobre la versión vigente.         |
| contracts.service.spec.ts:1969 · lanza ConflictException si el contrato no está en DRAFT                                   | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:1980 · responde 422 cuando falta el uso                                                          | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:1989 · responde 422 cuando el plan no tiene concepto fiscal                                      | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2008 · rechaza persona jurídica con uso residencial con 422                                      | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2095 · transiciona TERMINATED → ARCHIVED                                                         | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2109 · lanza ConflictException al intentar archivar contrato ACTIVE                              | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2118 · ARCHIVED no puede transicionar a ningún estado (estado final)                             | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2132 · elimina (soft-delete) un contrato en DRAFT                                                | b         | D-RER-3.1 exige contexto tenant; aserción exige id + tenantId en vez de solo id. Se conserva borrado lógico y auditoría.                            |
| contracts.service.spec.ts:2156 · lanza BadRequestException al intentar eliminar un contrato ACTIVE                         | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2169 · audita nombres de campos permitidos y omite installationNotes y sus valores               | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2205 · restringe los campos fiscales al estado DRAFT                                             | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2216 · lanza ConflictException al intentar cambiar planSnapshotJson en contrato ACTIVE           | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2227 · actualiza alias sin problemas                                                             | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2241 · redacta la respuesta al editar un contrato anonimizado y conserva el plan y estado        | b         | Editar un anonimizado ya no es permitido; D-RER-1 exige 409 sin escritura, antes de proyectar respuesta.                                            |
| contracts.service.spec.ts:2273 · aplica los campos editables de un borrador y conserva los valores nulos explícitos        | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2589 · responde 422 BILLING_CYCLE_INVALID al cambiar a un ciclo inactivo                         | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2641 · rechaza cargar soporte en un contrato terminado sin crear el asset                        | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2669 · rechaza el soporte en un punto no residencial con STRATUM_EVIDENCE_NOT_APPLICABLE         | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2684 · borra el asset recién subido si el contrato deja de ser editable dentro de la transacción | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2713 · no retira soporte de un contrato suspendido                                               | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2730 · propaga un error de borrado distinto de no encontrado al retirar el soporte               | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2744 · retira el soporte de un contrato activo, recalcula el IVA y borra el asset anterior       | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2793 · no recalcula el IVA de un contrato activo sin uso y responde SERVICE_USAGE_REQUIRED       | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2880 · traduce un RangeError del resolvedor de IVA a STRATUM_REQUIRED                            | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2896 · propaga los errores del resolvedor de IVA que no son de rango                             | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2909 · deja el snapshot de IVA en null cuando el resolvedor no encuentra tratamiento canónico    | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2923 · avisa y aplica el tratamiento estándar cuando el asset heredado tiene uso GENERAL         | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2962 · responde SERVICE_USAGE_REQUIRED al ajustar el estrato de un contrato activo sin uso       | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:2980 · exige estrato al cambiar un punto activo a residencial sin estrato                        | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |
| contracts.service.spec.ts:3045 · rechaza un punto residencial en borrador si el titular es persona jurídica                | a         | El doble SQL no devuelve la lectura del suscriptor bajo FOR SHARE (produce 404 antes del comportamiento evaluado). D-RER-3.1; conservar aserciones. |

## Resultado

Remediación sin cambios de producto en este subbloque. Dos suites aisladas: **2 suites aprobadas, 122 tests aprobados, 0 omitidos** (contracts.service 104 y contract-plan-change 18). El padre ejecuta el conjunto completo de API y DB con --force.

Clasificación inicial consolidada: **59 tests rojos**, **53 (a)** y **6 (b)**; ningún (c) detectado en estas dos suites. Los cambios de aserción se limitan a seis tests (b).

Verificación ampliada del directorio `contracts/tests`: **5 suites aprobadas, 169 tests aprobados, 0 omitidos**, en 16,785 s. ESLint de los dos archivos modificados y Prettier de ambos: salida 0.

## Refinamiento previo a editar tras restituir FOR SHARE

- `propaga el 503…` requiere categoría **b** para su única aserción de cantidad de transacciones: D-RER-3.4 impone una lectura adicional antes de validar/cargar soporte; conserva 503 y ausencia de mutación. El resto de su reparación es doble (a).
- `responde no encontrado si el contrato activo ya no tiene suscriptor`, `no activa el contrato si el suscriptor ya no existe` y `valida el punto residencial de un borrador contra el suscriptor antes de guardarlo`: categoría **a**; la fila inexistente debe modelarse ahora en la lectura SQL bajo bloqueo, no en un segundo manager de transacción que ya no existe. Aserciones funcionales conservadas.
- Los fallos residuales de upload/punto de servicio son (a): la nueva comprobación temprana requiere su transacción propia en el doble antes de los managers previos.

## Clasificación adicional antes de editar

`elimina (soft-delete) un contrato en DRAFT`: **b** para la aserción del predicado de borrado; D-RER-3.1 exige contexto tenant bajo bloqueo, el predicado explícito incluye `tenantId`. Se conserva borrado lógico, auditoría y rechazo de otros estados.

Suite adicional detectada por corrida completa: 18 fallidos, 0 aprobados, 0 omitidos. Clasificación individual previa:

| Prueba (archivo:línea)                                                                                                                     | Categoría | Causa                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------- |
| contract-plan-change.service.spec.ts:119 · cambia DRAFT con snapshot servidor y segmento heredado, IVA pendiente y auditoría transaccional | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:149 · ACTIVE resuelve IVA con el mismo snapshot capturado y segmento override                         | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:169 · mismo plan retorna sin save, consulta de catálogo ni auditoría                                  | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:176 · rechaza estado SUSPENDED                                                                        | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:176 · rechaza estado TERMINATED                                                                       | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:176 · rechaza estado ARCHIVED                                                                         | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:186 · rechaza una versión obsoleta incluso si el plan es el mismo                                     | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:196 · rechaza plan inexistente o inactivo null                                                        | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:196 · rechaza plan inexistente o inactivo {"isActive":false}                                          | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:203 · traduce ausencia de tarifa vigente                                                              | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:211 · rechaza precio inválido NaN                                                                     | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:211 · rechaza precio inválido -1                                                                      | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:211 · rechaza precio inválido Infinity                                                                | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:217 · propaga el error de auditoría para revertir la transacción                                      | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:223 · rechaza un precio diferente del confirmado sin mutación                                         | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:230 · IVA inválido conserva el plan sin guardar                                                       | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:238 · rechaza titular bloqueado dentro de la transacción                                              | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |
| contract-plan-change.service.spec.ts:244 · contrato ajeno o inexistente no se modifica                                                     | a         | Falta qr.query para lectura FOR SHARE; mantener todas las aserciones. D-RER-3.1. |

## Dobles de casos previamente aprobados que también se adaptaron

| Prueba                                                                             | Categoría | Motivo                                                                                                             |
| ---------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| responde no encontrado si el contrato activo ya no tiene suscriptor                | a         | La inexistencia se modela en FOR SHARE y se agrega transacción de comprobación temprana; expectativa 404 intacta.  |
| no carga soporte si el suscriptor del contrato ya no existe                        | a         | Se antepone transacción de comprobación temprana a los managers de lectura ya existentes; expectativa 404 intacta. |
| no activa el contrato si el suscriptor ya no existe                                | a         | La inexistencia se modela en FOR SHARE; expectativa 404 intacta.                                                   |
| valida el punto residencial de un borrador contra el suscriptor antes de guardarlo | a         | La inexistencia se modela en FOR SHARE; expectativa 404 intacta.                                                   |
