# ADR-102: Ciclo de facturación y fecha de corte por servicio

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-10-30
**Aprobado por:** CTO Humano — 2026-10-30, con D-F9-1 = (a), D-F9-2 = (a) y D-F9-3 = (a) del PRD Fase 09 §9.1
**Enmiendas:** D2 (propiedad del catálogo de ciclos) y D5 (cálculo del corte) enmendadas por [ADR-103](ADR-103-Modulo-Facturacion-MOD14.md) (Aprobado, 2026-10-31). Con los valores por defecto (`ANTICIPADO` + `DIA_FIJO_CICLO`) el resultado de D5 es idéntico. D6 sigue bloqueado: MOD14 cumple P1; P2 y P3 siguen abiertas.
**Autor:** AI-EM-ARCH
**Modo activo:** Product Architect + Architect + Orchestrator
**Aprobación requerida:** CTO. Fija una regla de negocio de facturación y corte, crea una tabla en el schema tenant y cambia el contrato de `POST /crm/contracts/:id/activate`.
**Módulos:** MOD05 CRM Suscriptores (dueño en esta fase) · módulo de Facturación futuro (dueño destino del catálogo y consumidor de la fecha de corte) · MOD13 Red y Aprovisionamiento (ejecutor futuro del corte en red)
**Relacionado:** [ADR-080](ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md) (Aprobado; cota de dos módulos abiertos) · [ADR-098](ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) (Aprobado; D8: `ContractsService.activate` es la firma del contrato; D9: `RouterProvisioningPort.suspend`) · [PRD MOD05 Fase 05 v1.2](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md) (Aprobado; D-E4-1, Q1, Q2) · [PRD maestro](../prds/PRD_Sistema_ISP_Colombia_v2_4.md) v2.5 (propuesto) RF-BIL-06
**PRD de la fase:** [PRD MOD05 Fase 09](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) · **Plan:** [2026-10-30-mod05-ciclo-facturacion](../plans/2026-10-30-mod05-ciclo-facturacion.md)

---

## Contexto

El CTO fijó el 2026-10-30 la regla de iWana:

> Al activar el servicio se ingresa la fecha de facturación. Hay dos: el día 1 y el día 15 de cada mes. Al cliente con facturación el día 1 que no registre pago se le corta el día 15; al de facturación el día 15, el día 30.

En la misma sesión el CTO decidió tres puntos:

| # | Pregunta | Decisión del CTO |
| --- | --- | --- |
| C1 | Alcance de esta fase, dado que no existe registro de pagos | **Solo ciclo y fecha de corte, dentro de MOD05**; la decisión de cortar sigue manual en esta fase |
| C2 | Cómo se ejecuta el corte | **Automático, sin confirmación** |
| C3 | Día de corte inexistente o no hábil | **Último día del mes** si el mes no tiene ese día; **se corta aunque sea domingo o festivo** |

### Verificación en código (2026-10-30, `main` en `1ce4f263`)

| Pieza | Estado actual |
| --- | --- |
| `contracts.controller.ts:618` · `POST crm/contracts/:id/activate` | DRAFT → ACTIVE. **Sin cuerpo.** Permiso `CRM_EXPEDIENTES_MANAGE` |
| `contracts.service.ts:723` · `activate()` → `_transition` | No pide ni valida ciclo |
| `contracts.billing_cycle varchar(20)` (migración `029_extend_contracts_for_services.ts`) | **Texto libre**, Zod `z.string().max(20)` en `packages/shared/src/schemas/contract.schema.ts`. Ninguna lógica lo usa |
| `expediente_records.billing_cycle varchar(30)` | Texto libre; se copia al contrato al convertir el expediente (`apps/api/src/modules/crm/contracts/contracts.service.ts:324`) |
| Facturación, pagos, cartera, Wompi | **No existen** (PRD maestro §14.2: «No iniciado») |
| Suspensión | Solo manual: `subscriber-lifecycle.service.ts`; motivo `MORA` y origen `BILLING` ya reservados (`packages/shared/src/schemas/lifecycle.schema.ts`; CHECK en `158_crm_lifecycle_changes.ts`), con `source = 'MANUAL'` fijo |
| Corte en red | `RouterProvisioningPort.suspend()` existe con adaptador manual y **ningún llamador** |
| Configuración de Facturación | Sección `billing` en `COMING_SOON`, `ownerModule: 'Billing futuro'` (`apps/api/src/modules/configuration/services/settings-registry.service.ts:64-72`) |
| Zona horaria del tenant | `tenants.settings.timezone`, por defecto `America/Bogota` |

### El conflicto entre C1 y C2

Sin registro de pagos, el sistema no puede saber quién «no registró pago». Un corte automático implementado hoy suspendería a **todos** los servicios activos del ciclo en su fecha de corte. C2 se adopta, por tanto, como **comportamiento objetivo** con sus precondiciones declaradas (D6), y C1 fija lo que se construye ahora.

**Resolución G0 (2026-10-30):** el CTO aprobó este ADR y las tres recomendaciones del PRD Fase 09 §9.1: el corte automático se difiere hasta P1–P3 de D6 (D-F9-1), los contratos existentes sin ciclo se corrigen a mano (D-F9-2) y la agenda vive dentro de Suscriptores (D-F9-3).

---

## Decisión

### D1. El ciclo de facturación es atributo del contrato

El ciclo se guarda en el **contrato** (el servicio), no en el suscriptor. Es coherente con D-E4-1 de la Fase 05: el corte real es por servicio, y el suscriptor deriva su estado de sus contratos.

- Columna nueva `contracts.billing_cycle_day smallint NULL`.
- Valor válido: un `cycle_day` **activo** del catálogo del tenant (D2). Integridad por FK a `crm_billing_cycles(cycle_day)`.
- `contracts.billing_cycle varchar(20)` queda **deprecada**: no se escribe desde formularios nuevos, se muestra como dato heredado y se elimina cuando el módulo de Facturación lo decida.
- `expediente_records.billing_cycle` sigue siendo un dato de la propuesta comercial. Al convertir el expediente, si su texto es exactamente un `cycle_day` del catálogo, se usa como **valor sugerido** para el contrato; nunca se escribe sin confirmación (D3).

### D2. Catálogo de ciclos por tenant

Otros ISP de la plataforma tendrán otros días; el ciclo no se codifica como constante.

- Tabla del schema tenant `crm_billing_cycles`:
  - `cycle_day smallint` PK, `CHECK (cycle_day BETWEEN 1 AND 28)`;
  - `cutoff_day smallint NOT NULL`, `CHECK (cutoff_day BETWEEN 1 AND 31)` y `CHECK (cutoff_day > cycle_day)` (el corte cae en el mismo mes del ciclo);
  - `active boolean NOT NULL DEFAULT true`;
  - `updated_by uuid NULL`, `updated_at timestamptz NOT NULL DEFAULT now()`.
- La migración siembra en **todos** los tenants: `(1, 15)` y `(15, 30)`.
- Dueño en esta fase: CRM (MOD05). El catálogo se expone por contrato tipado en `@iwana/shared` para que su propiedad pase al módulo de Facturación, por ADR, sin cambiar consumidores.
- La edición del catálogo desde Configuración queda **fuera de esta fase**: la sección `billing` sigue `COMING_SOON`. Cambiar valores exige migración o una fase posterior.

### D3. El ciclo se captura al activar el servicio

`POST /crm/contracts/:id/activate` acepta un cuerpo **opcional**:

```ts
{ billingCycleDay?: number }
```

| Contrato tiene ciclo | Cuerpo trae ciclo | Resultado |
| --- | --- | --- |
| No | No | 422 `BILLING_CYCLE_REQUIRED` |
| No | Sí, activo en el catálogo | Se guarda y se activa, en la misma transacción |
| Sí | No | Se activa con el ciclo guardado |
| Sí | Sí, activo | Se guarda el del cuerpo y se activa |
| — | Sí, inexistente o inactivo | 422 `BILLING_CYCLE_INVALID` |

- El cambio del ciclo se audita como cualquier campo editable del contrato.
- Crear y editar contrato sustituyen el texto libre por un selector del catálogo; en esos flujos el ciclo es opcional (se exige al activar).
- Contratos `ACTIVE` o `SUSPENDED` pueden recibir o cambiar el ciclo por edición. La agenda usa siempre el ciclo vigente del contrato; esta fase no lleva historial de ciclos (el historial es del módulo de Facturación, que factura por periodo).

### D4. Sin migración de datos

Los contratos existentes no reciben ciclo automáticamente: no se infiere de `billing_cycle` libre. Los `ACTIVE` sin ciclo aparecen en la agenda (D7) como «sin ciclo asignado» y se corrigen editando el contrato.

### D5. La fecha de corte se deriva, no se persiste

Una sola función pura en `@iwana/shared`:

```ts
computeCutoffDate(input: {
  cycleDay: number;      // del contrato
  cutoffDay: number;     // del catálogo
  year: number;
  month: number;         // 1–12, periodo de facturación
}): string;              // 'YYYY-MM-DD'
// corte = min(cutoffDay, último día del mes)
```

- El periodo M se factura el día `cycleDay` de M y se corta en `min(cutoffDay, último día de M)`. Ejemplos con el catálogo sembrado: ciclo 1 → 15 de M; ciclo 15 → 30 de M, y en febrero el 28 (o 29 en bisiesto).
- **Sin corrimiento** por domingo ni festivo (C3).
- «Hoy» y «próximo corte» se calculan en la zona horaria del tenant (`settings.timezone`, por defecto `America/Bogota`). Nunca en la del servidor.
- No se persiste: cambia si cambia el catálogo, y persistirla obligaría a recalcular.

### D6. Corte automático sin confirmación: comportamiento objetivo, no implementado en esta fase

El corte automático (C2) queda **definido y bloqueado**. Se habilita solo cuando se cumplen **las tres** precondiciones:

| # | Precondición | Dueño |
| --- | --- | --- |
| P1 | Existe la señal «pago del periodo registrado» por contrato y periodo | Módulo de Facturación (no iniciado) |
| P2 | Q1 de la Fase 05 resuelta: aviso previo, plazo de pago oportuno y reconexión según el régimen de protección de usuarios de la CRC — **requiere verificación con fuente oficial** | Asesoría jurídica |
| P3 | Existe un ejecutor del corte en red (MOD13 `RouterProvisioningPort.suspend` con llamador) o se acepta explícitamente un corte solo comercial | MOD13 / CTO |

Forma prevista, para que el diseño futuro no la reabra:
- job diario por tenant según el patrón de `apps/api/src/modules/privacy/alerts/privacy-due-alerts.processor.ts` (barrido con `repeat: { pattern, tz }` y un job por tenant con `jobId` por fecha);
- en la fecha de corte, cada contrato `ACTIVE` del ciclo **sin** pago del periodo pasa a `SUSPENDED` con motivo `MORA` y origen `BILLING`, sin confirmación humana;
- idempotente por contrato + periodo; reintentos sin duplicar el historial;
- la reconexión al pagar es RF-BIL-07 y pertenece al módulo de Facturación.

Mientras D6 esté bloqueado, el operador corta con la suspensión manual existente (motivo `MORA`) usando la agenda de D7.

### D7. Agenda de corte

Endpoint de lectura:

```
GET /crm/billing-cycles/cutoff-agenda?date=YYYY-MM-DD&page=&limit=
```

- Devuelve los contratos `ACTIVE` cuya fecha de corte del periodo de `date` es `date`, agrupables por ciclo, con los campos que la lista operativa de suscriptores ya expone al rol; **ninguna PII adicional**.
- Incluye el conteo de contratos `ACTIVE` **sin ciclo asignado**.
- `date` por defecto: hoy en la zona horaria del tenant.
- Permiso: `CRM_SUBSCRIBERS_READ`. Paginado como el resto de listas de CRM.
- También: `GET /crm/billing-cycles` devuelve el catálogo activo para los selectores, con el próximo corte de cada ciclo calculado en el servidor (enmienda E1 aprobada por el CTO el 2026-10-30; precisa D7 sin cambiar ninguna decisión, por eso el ADR no cambia de versión; [PRD Fase 09 v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) RF-CF-20). El portal no calcula fechas de corte.

---

## Artefactos previos que este ADR modifica

| Artefacto | Cambio |
| --- | --- |
| [PRD MOD05 Fase 05 v1.2](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md) §9, Q2 | Nota «Desarrollo posterior»: para iWana la Q2 se responde con fechas fijas por ciclo (D5), no con días de mora relativos. Q1 sigue abierta y bloquea D6 |
| [PRD maestro](../prds/PRD_Sistema_ISP_Colombia_v2_4.md) RF-BIL-06 | Nota de divergencia: el corte por fecha fija por ciclo sustituye a «X días → suspensión con ancho de banda reducido → Y días → corte» mientras rija este ADR. La suspensión intermedia con ancho de banda reducido no se adopta |
| [HLD-MOD05-ARQUITECTURA-v2.0](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md) §5.1, fila «§7 Facturacion» de `ExpedienteRecord` | Nota: en el contrato, `billingCycle` (texto) queda deprecado por `billingCycleDay`; en el expediente sigue como dato de la propuesta |

---

## Consecuencias

**Positivas**

- El ciclo deja de ser texto libre: cada servicio activo tiene un día de facturación validado y una fecha de corte calculable.
- La operación ve cada día a quién corresponde cortar, antes de que exista Facturación.
- El corte automático queda diseñado con sus precondiciones, sin construir algo que hoy cortaría a clientes al día.

**Negativas y costes**

- Cambia el contrato de `activate`: un cliente del API que active un contrato sin ciclo recibe 422. El portal es el único cliente conocido y se actualiza en la misma fase.
- Conviven `billing_cycle` (deprecado) y `billing_cycle_day` hasta que Facturación elimine el primero.
- La expectativa del CTO de corte automático no se cumple en esta fase (D6). Se declara en el informe de definición.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| Multi-tenant | Tabla en el schema de cada tenant, sembrada en todos; la zona horaria es la del tenant; sin datos cruzados |
| Seguridad | La activación conserva `CRM_EXPEDIENTES_MANAGE`; la agenda usa `CRM_SUBSCRIBERS_READ` y la proyección de lista existente; el cambio de ciclo se audita |
| Escala | Índice `(status, billing_cycle_day)` en `contracts`; la fecha de corte se calcula en memoria; la agenda pagina |
| Regulación | Esta fase no corta. D6 queda bloqueado por P2 (régimen CRC, requiere verificación con fuente oficial) |
| Boundaries | Todo dentro de `crm/contracts`. El catálogo se publica como contrato tipado para su traspaso futuro a Facturación |
| Cota de ADR-080 | No abre módulo: es una fase de MOD05 |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Se lee la agenda como «estos clientes no pagaron» | La agenda dice «corte programado» y declara que el sistema no conoce pagos; la acción de corte sigue siendo la suspensión manual |
| R2 | Error de fecha en meses cortos o cambio de año | Pruebas en tabla de `computeCutoffDate`: febrero 28 y 29, meses de 30 y 31, diciembre → enero |
| R3 | La fecha «de hoy» se calcula en UTC y la agenda se adelanta 5 horas | La fecha local se obtiene con la zona del tenant; prueba explícita a las 19:00–23:59 de Bogotá |
| R4 | El catálogo cambia y los contratos quedan con un ciclo inactivo | FK + `active`: un ciclo inactivo no se ofrece ni se acepta al activar, pero los contratos que lo tienen conservan su fecha de corte |
| R5 | Corte sin aviso previo exigido por la CRC cuando se habilite D6 | P2 es precondición; el job no se construye sin ella |

---

## Alternativas descartadas

**A1. Ciclo en el suscriptor.** Un suscriptor puede tener varios servicios y el corte es por servicio (D-E4-1). Un ciclo por suscriptor obligaría a cortar todos los servicios a la vez.

**A2. Persistir la fecha de corte en el contrato.** Duplica un dato derivable y queda desfasado si cambia el catálogo.

**A3. Corte en dos pasos por días de mora (RF-BIL-06).** No es la regla de iWana. Exige definir dos plazos y un perfil de ancho de banda reducido que no existe en MOD13.

**A4. Correr el corte al siguiente día hábil.** El CTO decidió cortar aunque sea domingo o festivo (C3).

**A5. Implementar ya el job automático y desactivarlo por bandera.** Sin señal de pago no hay forma correcta de probarlo; código sin consumidor real se pudre. Se construye cuando P1 exista.
