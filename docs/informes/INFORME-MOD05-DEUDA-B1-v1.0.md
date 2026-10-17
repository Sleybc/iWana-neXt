# INFORME — MOD05 deuda de código · B1 suscriptores · v1.0

- **Fecha:** 2026-10-17.
- **Estado:** **[BLOQUEO] después de S2**.
- **Agente:** `sr-backend`.
- **Base verificada:** `main` en `09af7f60fcf5aceb8a4f09f3c5d16abadd0fb0e5`.
- **Plan:** [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md).
- **Encargo:** [PROMPT-MOD05-DEUDA-CODIGO-v1.0.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md), §0–§3 y B1 §4.

## S2 publicado

Se publicaron en `@iwana/shared` los contratos de IVA/RUT, `PartyRoleType.LEGAL_REPRESENTATIVE`, el DV de NIT de un dígito obligatorio para persona jurídica y el objeto `legalRepresentative { fullName, documentType, documentNumber }`. `SubscriberListItem` expone los nuevos campos de IVA/RUT y la proyección `{ partyId, displayName }`; `TaxRegime` quedó marcado como deprecado.

Archivos: [subscriber.schema.ts](../../packages/shared/src/schemas/subscriber.schema.ts), [vat-responsibility.enum.ts](../../packages/shared/src/enums/vat-responsibility.enum.ts), [party-role-type.enum.ts](../../packages/shared/src/enums/parties/party-role-type.enum.ts), [index.ts](../../packages/shared/src/index.ts) y [subscriber.schema.spec.ts](../../packages/shared/src/schemas/subscriber.schema.spec.ts).

La prueba nueva primero falló en la guardia previa (**4/4 fallos**); tras publicar el contrato pasó **5/5**. Se anunció **S2** antes de iniciar el alcance API.

## Baseline de cobertura previo a B1

Antes de editar código B1, en el `main` verificado, la cobertura de `crm/subscribers` fue:

| Métrica | Baseline |
| --- | ---: |
| Statements | 93,83 % (1249/1331) |
| Branches | 82,85 % (638/770) |
| Functions | 91,89 % (136/148) |
| Lines | **94,50 % (1170/1238)** |

Las 14 suites del área terminaron con **302/302 pruebas aprobadas**. Jest salió con código 1 porque el umbral global configurado exige `serialized-asset-useful-life.util.ts`, que no pertenece al conjunto de cobertura filtrado; los specs del área no fallaron. La primera ejecución dentro del sandbox bloqueó servidores HTTP locales (`EACCES`); la medición válida se repitió con acceso al loopback.

## [BLOQUEO] — falta de datos en la conversión automática

El flujo existente `SubscriberCreationService.createFromExpediente` crea un suscriptor al pasar el expediente a listo. El origen solo proporciona, entre otros, tipo de persona, NIT, razón social y datos de contacto. `ExpedienteRecord` no tiene `vatResponsibility`, `rutResponsibilities` ni un objeto de representante con nombre, tipo y número de documento. `primaryContactName`/`primaryContactRole` no acreditan que la persona sea representante legal ni proporcionan su documento.

El contrato exige al menos una responsabilidad del RUT en altas y el representante Party natural para toda persona jurídica nueva. La migración 154 deja pasar filas jurídicas antiguas, pero su constraint `NOT VALID` se aplica a filas nuevas. No hay una fuente aprobada para completar esos valores durante la conversión. Inferirlos inventaría información fiscal o de identidad; permitir un representante pendiente impediría insertar una empresa nueva; fallar la conversión cambiaría el flujo automático.

Por la instrucción del encargo, detuve B1 tras S2. R1–R4 y R10 de API no se implementaron; no cambié el flujo de conversión, no migré la base y no inicié la integración API. Para continuar hace falta definir cómo el flujo obtiene y valida responsabilidades RUT y representante antes de convertir una persona jurídica. No añadí contratos fuera de §2.2.

## Compatibilidad del contrato y validación API

Al ejecutar la suite integrada, dos fixtures de alta de API todavía usaban el payload anterior. Actualicé únicamente esos fixtures con la responsabilidad IVA/RUT sintética requerida en §2.2, sin tocar lógica productiva de B1: [create-subscriber-contact.contract.spec.ts](../../apps/api/src/modules/crm/subscribers/tests/create-subscriber-contact.contract.spec.ts) y [subscribers.controller.fase2.http.spec.ts](../../apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts). La corrida focalizada terminó con **2 suites y 29/29 pruebas aprobadas**.

En el árbol integrado final, `@iwana/api` pasó sin caché: **390 suites aprobadas, 4 omitidas; 5.283 pruebas aprobadas, 15 omitidas; 0 fallos**. El wrapper `pnpm` no pudo iniciar porque intentó descargar Node 24.13.1 y DNS devolvió `ENOTFOUND`; se usó el Node 24.13.1 ya instalado directamente, sin cambiar configuración. La integración de API quedó pendiente por el bloqueo de PostgreSQL/Docker descrito en el informe B2.

## Ruta e higiene

La ruta del informe se comprobó libre antes de crearlo. No se usaron PII ni claves reales y no se creó commit. Se preservaron los cambios locales ajenos a B1. B2 terminó su alcance y dejó el [informe correspondiente](INFORME-MOD05-DEUDA-B2-v1.0.md).
