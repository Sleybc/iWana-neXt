# INFORME-MOD14 — Revisión de seguridad de diseño · Fase 01

**Versión:** 1.0  
**Estado:** Emitido  
**Fecha:** 2026-11-03  
**Emisor:** AI-SEC-ENG  
**Alcance:** Bloque S0, revisión de diseño en solo lectura de ADR-103, HLD-MOD14-FACTURACION-v1.1 (contrato congelado tras el G0 del re-sync del 2026-11-03) y PRD-MOD14 Fase 01 v1.0. Foco específico en §8.1 (privacidad y retención fiscal), RS-6 (titulares bloqueados y anonimizados), RS-7 (suplantación de identidad), propuesta para D-BIL-11 y análisis de amenazas STRIDE.

---

## 1. Dictamen de Seguridad y Cierre de Decisiones

### 1.1 Dictamen sobre D-BIL-11: ¿El perfil Soporte registra pagos?

**Postura de Seguridad:** **Ratificar la opción (b) — Soporte NO debe registrar pagos en la Fase 01.**

- **Justificación de segregación de funciones (SoD):** Registrar o anular pagos modifica saldos financieros. La Fase 01 no define sesiones de caja, arqueo ni límites por punto de recaudo; por ello, no hay controles compensatorios que justifiquen habilitar esa mutación al perfil de Soporte.
- **Postura para Fase 01:** Mantener el permiso `billing.payments.register` restringido exclusivamente a los perfiles `ADMIN` (Administrador general) y `ACCOUNTANT` (Acceso estándar Contable). Soporte conserva únicamente `billing.invoices.read` y `billing.payments.read`, permitiendo validar el estado de cuenta y la agenda de corte para responder inquietudes de servicio sin riesgo de manipulación de saldos.
- **Condición para fases futuras:** Si la operación comercial del ISP exige recaudo en mostrador por agentes de servicio al cliente, esto deberá modelarse como una capacidad de caja dedicada (módulo de tesorería/caja con sesión y arqueo), o crear un perfil específico «Cajero» con trazabilidad por punto de recaudo, no habilitando el permiso general en el perfil Soporte.

### 1.2 Revisión de Q2 y deber de conservación (HLD §8.1, RS-4/RS-5)

- **Q2 cerrada por diseño para la fase:** HLD v1.1 §8.1 y ADR-094 D7/H10 fijan la categoría interna `FACTURACION_SOPORTES_CONTABLES` en diez años, contados desde el último asiento o documento. No interpreto esta decisión como dictamen jurídico sobre cada tipo de documento.
- **Precisión de fuentes:** Ley 962 de 2005 art. 28 establece diez años para los libros y papeles del comerciante. Su art. 46 modifica el periodo asociado al ET art. 632 para que corra hasta la firmeza de la declaración de renta soportada por esos documentos; por tanto, no debe atribuirse al ET art. 632, por sí solo, un plazo universal de diez años. La aplicación concreta de ambos plazos a cada documento de Billing debe validarse con fuente oficial y asesoría jurídica antes de producción ([Ley 962 de 2005, arts. 28 y 46](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=17004); [Código de Comercio, art. 60](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=41102)).
- **Puerto de deber de conservación:** `privacy` declara `IBillingStandingReadPort`; Billing devuelve la fecha civil del último documento `EMITIDO` o `ANULADO` usando el `manager` recibido. La consulta ocurre dentro de la transacción de supresión y después del bloqueo de filas del titular. HLD exige considerar ambos estados; los documentos anulados también son soporte.
- **Participante de supresión:** `BillingTitularErasureParticipant` es el octavo participante, después de `media`, y solo actúa cuando la supresión procede. Con el mismo `manager`, redacta los campos personales de `buyer_snapshot` conservando número/fechas/montos, pone `reference` y `note` en `NULL`, elimina borradores y sus líneas, verifica residuales y reporta las categorías `FISCAL` y `COMERCIAL`; no modifica tablas de CRM. Esta división conserva soportes mientras rige el deber y minimiza PII cuando ya procede la supresión.

---

## 2. Resumen de Hallazgos

| Severidad | Cantidad | Descripción sintética                                                                                                                                                              |
| :-------: | :------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  **P0**   |    0     | No se evidencian vulnerabilidades críticas que bloqueen el inicio de Ola 1.                                                                                                        |
|  **P1**   |    3     | Bloqueo transaccional frente a anonimización; falla cerrada ante auditoría indisponible; cifrado en reposo no especificado para `buyer_snapshot`.                                  |
|  **P2**   |    4     | Minimización de PII en observabilidad; alcance de lectura financiera/PII para roles de solo lectura; vinculación del cuerpo a la clave de idempotencia; límites de advisory locks. |
|  **P3**   |    1     | Claridad en la expiración del snapshot del emisor ante cambios de razón social o NIT del tenant.                                                                                   |

---

## 3. Hallazgos Detallados

### [SEC-MOD14-01] RS-6: La validación de titular anonimizado debe ejecutarse bajo bloqueo transaccional `FOR SHARE`

- **Severidad:** **P1**
- **Superficie:** `apps/api/src/modules/billing/payments/billing-payments.service.ts` y puerto `BillingContractReadPort.lockTitularForBillingWrite`.
- **Riesgo:** Si la comprobación del estado de anonimización del titular se realizara mediante una guarda HTTP externa (`CanActivate`) o antes de iniciar la transacción de base de datos, una carrera entre el registro de un pago y la ejecución del proceso de supresión de datos podría permitir registrar un pago o cobertura para un suscriptor en pleno proceso de anonimización, violando la integridad de la base de datos o fallando de forma no controlada ante el trigger `trg_contracts_prevent_anonymized_mutation` (migración 169).
- **Recomendación / Control requerido:** Validar siempre dentro de la transacción de Billing mediante `lockTitularForBillingWrite`, aplicando `SELECT anonymized_at FROM subscribers WHERE id = :id FOR SHARE` sobre la fila del suscriptor. Si `anonymized_at IS NOT NULL`, abortar la transacción de inmediato respondiendo HTTP 409 con el código `PRIVACY_TITULAR_ANONYMIZED`.

### [SEC-MOD14-02] RS-6: Fallo cerrado (503) obligatorio si la auditoría de acceso a titular bloqueado no responde

- **Severidad:** **P1**
- **Superficie:** `apps/api/src/modules/billing/documents/` y `apps/api/src/modules/billing/accounts/`.
- **Riesgo:** Al consultar listas, detalle, estado de cuenta o PDF de un titular con `DATOS_BLOQUEADOS`, un operador con permiso `crm.blocked_data.read` o `privacy.read` puede desenmascarar el `buyer_snapshot`. Si el servicio de auditoría (`AuditService`) falla o la base de datos de auditoría no está accesible, permitir el retorno de los datos personales sin registro auditable violaría la política de protección de datos (ADR-094 y Ley 1581).
- **Recomendación / Control requerido:** La auditoría debe ejecutarse **antes** de responder al cliente (`RECORD_ACCESS` o `LIST_ACCESS`). Si la escritura de auditoría falla por cualquier motivo, el endpoint debe fallar cerrado respondiendo 503 `PRIVACY_AUDIT_UNAVAILABLE`, manteniendo los datos protegidos sin enviar el snapshot en claro.

### [SEC-MOD14-03] `buyer_snapshot` debe cifrarse en reposo conforme a ADR-058

- **Severidad:** **P1**
- **Superficie:** `billing_documents.buyer_snapshot` y el flujo de emisión (§3.1, §5 y §6.2).
- **Riesgo:** El contrato congela nombre/razón social, tipo y número de documento y dirección fiscal en JSONB. CRM descifra el documento del titular para producir el snapshot, pero el HLD no especifica que ese contenido vuelva a cifrarse antes de persistirlo. Guardarlo en claro trasladaría al histórico de Billing PII que CRM protege cifrada en reposo, en conflicto con ADR-058.
- **Control requerido antes de B2:** Definir y usar el cifrado en reposo vigente de ADR-058 para los campos personales del snapshot, minimizando los campos congelados al soporte necesario y sin registrar plaintext en logs, eventos o errores. La implementación del participante de supresión debe poder redactar esos campos bajo el `manager` de la transacción, sin reintroducir texto claro. Si el diseño pretende una excepción, debe resolverse en el HLD/ADR con aprobación del CTO; S0 no la concede.

### [SEC-MOD14-04] Zero-Trust PII: Aislamiento de `buyer_snapshot`, `reference` y `note` en observabilidad

- **Severidad:** **P2**
- **Superficie:** Logs de aplicación (`AuditService`, logger NestJS) y eventos `EventEmitter2`.
- **Riesgo:** `buyer_snapshot` almacena nombre, tipo y número de documento, dirección fiscal y responsabilidades RUT del cliente. Asimismo, los campos `reference` y `note` de los pagos pueden contener nombres de terceros o números de cuenta bancaria. Si estos objetos o cadenas se interpolan en plantillas de logs o en los eventos `billing.contract-period.paid` / `reopened`, se produciría una fuga de PII en texto plano hacia los agregadores de logs.
- **Recomendación / Control requerido:** Los eventos del dominio Billing deben transportar estrictamente identificadores opacos (`tenantId`, `contractId`, `periodId`, `periodStart`, `occurredAt`), sin nombres ni montos con PII. Las funciones de logging deben excluir explícitamente `buyer_snapshot`, `reference` y `note`. El hook `pii-log-guard` de Claude Code debe activarse en las rutas de Billing.

### [SEC-MOD14-05] El alcance de lectura expone saldos y campos potencialmente personales

- **Severidad:** **P2**
- **Superficie:** `BILLING_INVOICES_READ`, `BILLING_PAYMENTS_READ` y `GET /billing/subscribers/:subscriberId/statement` (§6.5 y §7).
- **Riesgo:** La matriz asigna ambos permisos de lectura a Soporte, Comercial y Auditoría además de ADMIN y Contable. El estado de cuenta habilita el permiso de lectura de facturas; `BillingPaymentResponse` no tiene una proyección de campos descrita en el HLD, mientras `reference` y `note` aceptan texto libre que puede contener PII. El enmascaramiento por `DATOS_BLOQUEADOS` protege ese caso particular, pero no define qué información personal o financiera ven los demás roles en lecturas ordinarias.
- **Recomendación:** Antes de implementar las respuestas, definir explícitamente campos por permiso y verificar que toda lectura filtra por tenant y por el alcance de suscriptor/contrato autorizado. Mantener `reference` y `note` fuera de las respuestas de lectura generales o redactarlos salvo necesidad aprobada; confirmar con negocio que Comercial y Auditoría necesitan el saldo detallado y no solo el estado mínimo.

### [SEC-MOD14-06] Mitigación de contención y DoS en Advisory Locks de generación y consecutivo

- **Severidad:** **P2**
- **Superficie:** `pg_advisory_xact_lock` en generación por (contrato, periodo) y emisión por tenant.
- **Riesgo:** La generación masiva de cobro utiliza advisory locks a nivel de transacción. En tenants con miles de contratos o múltiples emisiones concurrentes en lote (hasta 100 documentos por comando), locks transaccionales prolongados pueden agotar el pool de conexiones o generar deadlocks si las transacciones consumen servicios externos síncronos dentro del bloque de lock.
- **Recomendación / Control requerido:** Ninguna llamada de red externa (ej. almacenamiento MinIO o cálculo de hash externo) debe ejecutarse mientras se retiene el advisory lock. Los locks deben adquirirse y liberarse exclusivamente en el ámbito mínimo necesario para calcular el consecutivo y persistir el documento.

### [SEC-MOD14-07] La idempotencia requiere validar la clave y comparar el cuerpo canónico

- **Severidad:** **P2**
- **Superficie:** `POST /billing/payments`, `billing_payments.idempotency_key` y `RegisterPaymentCommandSchema` (§3.1, §4 y §6.3).
- **Riesgo:** El HLD define unicidad por tenant, longitud máxima de 80 caracteres y el error `IDEMPOTENCY_KEY_REUSED`, pero no concreta el formato mínimo de la cabecera ni cómo comparar el “mismo cuerpo” ante reintentos concurrentes. Si se compara una representación no canónica, cambios de orden o normalización podrían producir duplicados o conflictos inconsistentes; claves arbitrarias únicas también permiten hacer crecer indefinidamente el registro por cualquier actor con permiso de recaudo.
- **Recomendación:** Validar en runtime claves no vacías de hasta 80 caracteres, persistir un fingerprint de la orden normalizada sin guardar una segunda copia de PII, y resolver de forma atómica la carrera de inserción. La misma clave y fingerprint debe devolver el mismo resultado; la misma clave con otro fingerprint debe responder 409. Añadir límite de frecuencia/cuota por usuario y tenant, y cubrir en B3 reintentos concurrentes, cuerpo distinto y colisiones de clave dentro del tenant.

### [SEC-MOD14-08] Inmutabilidad y vigencia de snapshots fiscales

- **Severidad:** **P3**
- **Superficie:** `billing_documents.buyer_snapshot` y `billing_documents.issuer_snapshot`.
- **Riesgo:** Si un suscriptor o el propio tenant actualizan su razón social o dirección fiscal, los documentos de cobro ya emitidos en meses pasados no deben sufrir recálculos dinámicos.
- **Recomendación / Control requerido:** El diseño en HLD §3.1 congela de forma inmutable los snapshots en formato JSONB en el instante de la emisión (`status = 'EMITIDO'`). Se confirma que las entidades y servicios no poseen métodos de actualización sobre documentos emitidos (solo anulación mediante `void`).

---

## 4. Análisis de Amenazas STRIDE

| Categoría STRIDE                                 | Amenaza identificada                                                       | Mitigación diseñada en HLD v1.1                                                                                                                                                                                                                                                                                                                 |                     Evaluación                     |
| :----------------------------------------------- | :------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------: |
| **Spoofing** (Suplantación)                      | Cobro sobre un contrato marcado como víctima de falsedad personal.         | **RS-7:** Si el titular tiene marca `VICTIMA_FALSEDAD_PERSONAL` o suspensión por `SUPLANTACION`, el generador omite el periodo; los documentos emitidos se anulan manualmente con el motivo `SUPLANTACION`. La regla defensiva queda definida; su fundamento y vigencia legal requieren validación jurídica conforme a la nota ⚠ de ADR-094 H6. | **Diseño defensivo; verificación legal pendiente** |
| **Tampering** (Manipulación)                     | Alteración de valores facturados o líneas de IVA tras la emisión.          | Inmutabilidad de `billing_documents` emitidos; corrección únicamente por anulación trazada. Restricción `CHECK` en montos e IVA por línea.                                                                                                                                                                                                      |                    **Robusto**                     |
| **Repudiation** (Repudio)                        | Rechazo de pagos o desconocimiento de anulaciones por el operador.         | Auditoría obligatoria con `AuditService.logWithin` dentro de cada transacción, registrando usuario autenticado, recurso y motivo.                                                                                                                                                                                                               |                    **Robusto**                     |
| **Information Disclosure** (Fuga de información) | Exposición de PII del snapshot y de datos de cuenta a roles de lectura.    | **RS-6:** ocultación por defecto para titulares bloqueados, permiso separado y auditoría previa; requiere falla cerrada 503. ADR-058 debe cubrir el snapshot cifrado en reposo. La matriz de lecturas sigue requiriendo proyección mínima por rol.                                                                                              |              **Condicionado a P1/P2**              |
| **Denial of Service** (Denegación de servicio)   | Reintentos de pago y uso abusivo de claves nuevas.                         | `Idempotency-Key` más `UNIQUE (tenant_id, idempotency_key)` evita doble efecto; fingerprint canónico, validación y cuota limitan abuso residual.                                                                                                                                                                                                |               **Condicionado a P2**                |
| **Elevation of Privilege** (Escalamiento)        | Acceso de roles de soporte o ventas a registrar pagos o cambiar políticas. | RBAC granular mediante `PermissionsGuard` con `BILLING_PAYMENTS_REGISTER` y `BILLING_POLICY_MANAGE` asignados estrictamente a perfiles autorizados (D-BIL-11).                                                                                                                                                                                  |                    **Robusto**                     |

---

## 5. Conclusión y Recomendaciones para las Siguientes Olas

1. **Ola 1 (D1 y B1a):** Esta revisión no encuentra un bloqueo de seguridad de diseño para sus migraciones ni los contratos compartidos. El hallazgo P1 sobre `buyer_snapshot` debe resolverse antes de B2/emisión y no constituye una excepción aprobada a ADR-058.
2. **Condiciones para Ola 2 (B1b) y Ola 3 (B2, B3, B4p):**
   - Resolver y verificar el cifrado en reposo de `buyer_snapshot` conforme a SEC-MOD14-03.
   - Asegurar que `lockTitularForBillingWrite` se invoque dentro de la transacción del pago y cubra anonimización concurrente.
   - Implementar la lectura enmascarada/auditada de titulares bloqueados y la falla cerrada 503.
   - En B4p, garantizar que `IBillingStandingReadPort.lastFiscalDocumentAt` incluya `EMITIDO` y `ANULADO`, y que el participante use el `manager` de supresión, limpie borradores/PII y verifique residuales.
   - Definir proyecciones y alcance por rol para saldos, documentos, PDF y campos libres de pagos; fijar semántica de fingerprint y abuso de `Idempotency-Key` antes de cerrar B3.
3. El plazo de diez años es el valor interno vigente de ADR-094 para esa categoría. La aplicabilidad normativa específica por clase de documento queda sujeta a revisión jurídica antes de producción; este informe no certifica cumplimiento legal.
