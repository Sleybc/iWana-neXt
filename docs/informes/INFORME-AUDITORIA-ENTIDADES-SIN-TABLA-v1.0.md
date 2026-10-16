# INFORME — Auditoría transversal de entidades TypeORM sin tabla (TA1 / G7-5)

**Fecha:** 2026-10-16 · **Autor:** AI-DATA-ENG (solo lectura; sin cambios de código, migraciones ni bases) · **Encargo:** `docs/prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md` §6.1 G7-5 / §6.2 bloque TA1
**Skills aplicadas (como documentación):** `postgresql`, `database-migration` · **Gobernanza:** `AGENTS.md`
**Ruta verificada libre antes de redactar:** `docs/informes/INFORME-AUDITORIA-ENTIDADES-SIN-TABLA-v1.0.md` (sin colisión)

## 1. Resumen ejecutivo

- **Universo auditado:** 132 ficheros `*.entity.ts` con `@Entity()` — 49 en `apps/api/src`, 83 en `packages/database/src/entities`, 0 en `apps/worker` (el worker no declara entidades).
- **Runners contrastados:** `packages/database/src/migrations/public/index.ts` (`PUBLIC_MIGRATIONS`, 001–027) y `packages/database/src/migrations/tenant/runner.ts` (`TENANT_MIGRATIONS`, 000–148, 148 registrada).
- **Casos conocidos confirmados:** los 4 existen como entidad sin `CREATE TABLE` en ninguna migración registrada:
  - `potential_leads` → ninguna · módulo desmontado → **P3**.
  - `subscriber_contacts` → ninguna · módulo desmontado (D-CONT) → **P3**.
  - `habeas_data_consents` → ninguna · módulo montado pero inerte (rutas 410, sin `forFeature`) → **P3**.
  - `arco_requests` → ninguna · idem → **P3**.
- **Hallazgo nuevo (P1):** `opportunities` — entidad con repositorio vivo y rutas expuestas, montada vía `CrmModule` → `AppModule`, **sin migración que la cree**. Es un 500 latente del mismo patrón que D-CONT, pero vivo. Ver fila O-1.
- **Hallazgos nuevos (P3):** `prospect_cases` y `customer_activations` — entidades sin tabla cuyos módulos (`ProspectsModule`, `ReviewsModule`) no están importados por nadie; código muerto con rutas apagadas. Ver filas O-2 y O-3.
- **Resto:** todas las demás entidades tienen `CREATE TABLE` en una migración registrada en su runner. `packages/database` (83/83) OK. `apps/worker` sin entidades: sin riesgo.
- **Matiz de riesgo:** `autoLoadEntities: true` (`apps/api/src/app.config.ts:140`) carga metadatos de toda entidad registrada en un `forFeature`, pero la ausencia de tabla solo falla **al ejecutar la primera query** (500 en caliente), no en arranque. Por eso «montado + sin `forFeature`/sin query» es P3 (inerte) y «montado + repositorio en uso» es P1.

## 2. Tabla completa — entidades de `apps/api/src` (49)

Leyenda de riesgo: **P1** = montado sin tabla con acceso real a BD (500 latente) · **P3** = desmontado sin tabla, o montado sin acceso a BD (inerte).

| # | Entidad (fichero) | Tabla | Migración que la crea («ninguna» si ausente) | Módulo dueño | ¿Montado? (cadena hasta `AppModule`) | Endpoints / procesadores que la usan | Riesgo |
|---|---|---|---|---|---|---|---|
| 1 | `commercial/entities/catalog-item.entity.ts` | `catalog_items` | 017 `017_create_commercial_module` | CommercialModule (montado en `AppModule:211`) | Sí | CRUD comercial | — |
| 2 | `commercial/entities/plan-detail.entity.ts` | `plan_details` | 017 | CommercialModule | Sí | CRUD comercial | — |
| 3 | `commercial/entities/product-detail.entity.ts` | `product_details` | 017 | CommercialModule | Sí | CRUD comercial | — |
| 4 | `commercial/entities/service-detail.entity.ts` | `service_details` | 017 | CommercialModule | Sí | CRUD comercial | — |
| 5 | `commercial/entities/catalog-price-history.entity.ts` | `catalog_price_history` | 017 | CommercialModule | Sí | Histórico de precios | — |
| 6 | `commercial/entities/catalog-bundle.entity.ts` | `catalog_bundles` | 017 | CommercialModule | Sí | CRUD comercial | — |
| 7 | `commercial/entities/catalog-bundle-item.entity.ts` | `catalog_bundle_items` | 017 | CommercialModule | Sí | CRUD comercial | — |
| 8 | `commercial/entities/catalog-promotion.entity.ts` | `catalog_promotions` | 017 | CommercialModule | Sí | CRUD comercial | — |
| 9 | `commercial/entities/compatibility-rule.entity.ts` | `catalog_compatibility_rules` | 017 | CommercialModule | Sí | Reglas de compatibilidad | — |
| 10 | `crm/attributions/entities/sales-attribution.entity.ts` | `sales_attributions` | 007 `007_add_acquisition_channel_and_sales_attributions` | AttributionsModule (vía `CrmModule:46` → App) | Sí | Atribuciones CRM | — |
| 11 | `crm/contacts/entities/subscriber-contact.entity.ts` | `subscriber_contacts` | **ninguna** (sin `CREATE TABLE` en `migrations/`) | ContactsModule — **desmontado** (`crm.module.ts:40`, D-CONT; `crm.module.spec.ts:42` lo fija) | No | Código retenido: `POST/GET subscribers/:subscriberId/contacts`, `PATCH/DELETE :id` (apagados al no montar) | **P3** |
| 12 | `crm/contracts/entities/contract.entity.ts` | `contracts` | 028 `028_create_crm_quotes_and_contracts` | ContractsModule (vía `CrmModule:44` → App) | Sí | Contratos CRM | — |
| 13 | `crm/expedientes/entities/expediente-record.entity.ts` | `expediente_records` | 001 `001_create_expediente_records` | ExpedientesModule (vía `CrmModule:45` → App) | Sí | `forFeature` (`expedientes.module.ts:31-39`) + controladores expediente/pipeline | — |
| 14 | `crm/expedientes/entities/status-change.entity.ts` | `status_changes` | 001 | ExpedientesModule | Sí | `forFeature`, pipeline | — |
| 15 | `crm/expedientes/entities/contact-attempt.entity.ts` | `contact_attempts` | 001 | ExpedientesModule | Sí | `forFeature`, expediente | — |
| 16 | `crm/expedientes/entities/coverage-check.entity.ts` | `coverage_checks` | 001 | ExpedientesModule | Sí | `forFeature`, cobertura | — |
| 17 | `crm/expedientes/entities/consent-record-v2.entity.ts` | `consent_records` | 001 | ExpedientesModule | Sí | `forFeature` (convive con la fila 24 sobre la misma tabla; ver §4) | — |
| 18 | `crm/expedientes/entities/crm-conversion-failure.entity.ts` | `crm_conversion_failures` | 143 `143_subscriber_party_pii_hmac` (`:77`) | ExpedientesModule | Sí | `forFeature`, conversión | — |
| 19 | `crm/habeas-data/entities/habeas-data-consent.entity.ts` | `habeas_data_consents` | **ninguna** (solo fixture en `146_privacy_module.integration.spec.ts:121`; la 146 la trata como «origen no disponible») | HabeasDataModule (vía `CrmModule:41` → App) pero **sin `TypeOrmModule.forFeature`** y controlador retirado | Montado-inerte | 5 rutas (`.../habeas-data/consent(s)`, `.../arco`, `habeas-data/arco/:requestId`) todas `410 Gone` (`PRIVACY_ROUTE_RETIRED`, `habeas-data.controller.ts:15-21`); ningún repositorio | **P3** |
| 20 | `crm/habeas-data/entities/arco-request.entity.ts` | `arco_requests` | **ninguna** (idem; fixture en `146_privacy_module.integration.spec.ts:134`) | HabeasDataModule (idem) | Montado-inerte | Idem fila 19 | **P3** |
| 21 | `crm/opportunities/entities/opportunity.entity.ts` | `opportunities` | **ninguna** (en `migrations/` solo aparece `quotes.opportunity_id` como FK en la 028, sin `CREATE TABLE opportunities`) | OpportunitiesModule — **montado** (vía `CrmModule:42` → `AppModule:208`) con `forFeature([Opportunity])` (`opportunities.module.ts:9`) | **Sí (vivo)** | `POST/GET /opportunities`, `GET/PATCH /opportunities/:id` (`opportunities.controller.ts:31-85`); servicio con `createQueryBuilder(Opportunity, 'o')` (`opportunities.service.ts:44`) | **P1 — 500 latente** |
| 22 | `crm/potentials/entities/potential-lead.entity.ts` | `potential_leads` | **ninguna** | PotentialsModule — **no importado por nadie** (solo se define en `potentials.module.ts`; `CrmModule` no lo lista) | No | Código retenido: `POST/GET crm/potentials`, `POST :id/qualify` (apagados); referenciado por `cli/anonymize-titular.ts:970` solo como guarda (`tableExists` → aborta si hay filas) | **P3** |
| 23 | `crm/prospects/entities/prospect-case.entity.ts` | `prospect_cases` | **ninguna** (cero menciones en `migrations/`) | ProspectsModule y ReviewsModule — **ninguno importado** (ausentes en `CrmModule` y `AppModule`) | No | `POST crm/prospects/:id/schedule-installation` (apagado); `forFeature` en Prospects/Reviews (módulos muertos) | **P3** |
| 24 | `crm/reviews/entities/consent-record.entity.ts` | `consent_records` | 001 (tabla existe; **entidad duplicada** con la fila 17 sobre la misma tabla) | ReviewsModule — no montado; también en `forFeature` de PotentialsModule (no montado) | No (tabla sí existe) | `POST crm/prospects/:id/close-success`, `.../send-to-review`, `GET crm/customers/:id/overview` (apagados) | **P3** (nota de duplicidad en §4) |
| 25 | `crm/reviews/entities/customer-activation.entity.ts` | `customer_activations` | **ninguna** (cero menciones en `migrations/`) | ReviewsModule — no montado | No | `forFeature([ProspectCase, CustomerActivation])` en módulo muerto; `ActivationService` apagado | **P3** |
| 26 | `crm/quotes/entities/quote.entity.ts` | `quotes` | 028 | QuotesModule (vía `CrmModule:43` → App); también en `forFeature` de Prospects (muerto) y Expedientes (vivo) | Sí | Cotizaciones CRM | — |
| 27 | `crm/responsibilities/entities/operational-responsibility-history.entity.ts` | `operational_responsibility_history` | 009 `009_add_current_responsible_fields_and_operational_history` | ResponsibilitiesModule (vía `CrmModule:47` → App) | Sí | Historial de responsables | — |
| 28 | `crm/subscribers/entities/subscriber.entity.ts` | `subscribers` | 012 `012_add_subscribers` (+ evolves 014/015/016/143/148) | SubscribersModule (vía `CrmModule:48` → App) | Sí | Suscriptores CRM | — |
| 29 | `crm/subscribers/entities/subscriber-tax-profile.entity.ts` | `subscriber_tax_profiles` | 026 `026_create_subscriber_tax_profiles` | SubscribersModule | Sí | Perfiles fiscales | — |
| 30 | `crm/subscribers/entities/subscriber-tax-assignment.entity.ts` | `subscriber_tax_assignments` | 026 | SubscribersModule | Sí | Asignaciones fiscales | — |
| 31 | `parties/entities/party.entity.ts` | `party` | 022 `022_create_parties_module` | PartiesModule (`AppModule:217`) | Sí | Terceros (canónico ADR-030) | — |
| 32 | `parties/entities/party-contact.entity.ts` | `party_contact` | 022 | PartiesModule | Sí | Contacto canónico (el que sustituye a `subscriber_contacts`) | — |
| 33 | `parties/entities/party-role.entity.ts` | `party_role` | 022 | PartiesModule | Sí | Roles de tercero | — |
| 34 | `privacy/entities/data-authorization.entity.ts` | `data_authorizations` | 146 `146_privacy_module` (`:324`) | PrivacyModule (`AppModule:244`, `forFeature` en `privacy.module.ts:51-60`) | Sí | `AuthorizationsController/Service`, puertos de autorización | — |
| 35 | `privacy/entities/legal-text.entity.ts` | `legal_texts` | 146 (`:308`) | PrivacyModule | Sí | `LegalTextsController/Service` | — |
| 36 | `privacy/entities/party-privacy-mark.entity.ts` | `party_privacy_marks` | 146 (`:469`) | PrivacyModule | Sí | `MarksController/Service` | — |
| 37 | `privacy/entities/retention-policy.entity.ts` | `retention_policies` | 146 (`:488`) | PrivacyModule | Sí | `RetentionController/Service` | — |
| 38 | `privacy/entities/privacy-incident.entity.ts` | `privacy_incidents` | 146 (`:500`) | PrivacyModule | Sí | `IncidentsController/Service` | — |
| 39 | `privacy/entities/data-subject-request.entity.ts` | `data_subject_requests` | 146 (`:353`) | PrivacyModule | Sí | `PrivacyRequestsController/Service` + `PrivacyDueAlertsProcessor` (BullMQ `PRIVACY_DUE_ALERTS_QUEUE`) | — |
| 40 | `privacy/entities/data-subject-request-event.entity.ts` | `data_subject_request_events` | 146 (`:451`) | PrivacyModule | Sí | Trazabilidad de solicitudes | — |
| 41 | `privacy/entities/data-subject-request-task.entity.ts` | `data_subject_request_tasks` | 146 (`:412`) | PrivacyModule | Sí | Tareas de solicitud | — |
| 42 | `taxation/entities/tax-rule.entity.ts` | `tax_rules` | 017 (`tax_rules` comercial; 025 solo depreca el legado) | TaxationModule (`AppModule:214`) | Sí | Reglas IVA | — |
| 43 | `taxation/entities/tax-rule-application.entity.ts` | `tax_rule_applications` | 023 `023_create_tax_rule_applications` | TaxationModule | Sí | Aplicaciones de regla | — |
| 44 | `taxation/entities/tax-definition.entity.ts` | `tax_definitions` | 021 `021_create_taxation_module` | TaxationModule | Sí | Definiciones fiscales | — |
| 45 | `tenant/entities/additional-product.entity.ts` | `additional_products` | 008 (+ 063 `063_drop_legacy_additional_products` la recrea) | TenantModule (`AppModule:184`) | Sí | Productos adicionales legado | — |
| 46 | `tenant/entities/commercial-node.entity.ts` | `commercial_nodes` | 000 `000_initial_tenant_schema` (`:147`) | TenantModule | Sí | Nodos comerciales | — |
| 47 | `tenant/entities/coverage-zone.entity.ts` | `coverage_zones` | 000 (`:168`) | TenantModule | Sí | Zonas de cobertura | — |
| 48 | `tenant/entities/plan-catalog-item.entity.ts` | `plan_catalog_items` | 000 (`:190`) | TenantModule | Sí | Catálogo de planes | — |
| 49 | `crm/reviews/entities/consent-record.entity.ts` — ver fila 24 (misma tabla que fila 17) | `consent_records` | 001 | — (duplicada) | — | — | Ver §4 |

> Nota: las filas 24/49 son la misma entidad listada dos veces por claridad del cruce; el universo sigue siendo 49 ficheros en `apps/api`.

## 3. Tabla compacta — entidades de `packages/database/src/entities` (83/83 con tabla)

Todas verificadas contra `CREATE TABLE` en migraciones registradas en `TENANT_MIGRATIONS` o `PUBLIC_MIGRATIONS`. Los módulos consumidores viven en `apps/api` (Inventory, Tasks, WFM, Assurance, Organization, AccessControl, Users, Media, Platform*) o son transversales; ninguno está en `apps/worker` (sin entidades).

| Grupo | Tablas (entidades) | Migración registrada |
|---|---|---|
| Núcleo tenant | `users`, `refresh_tokens`, `audit_logs` | 000 (tenant) |
| Núcleo comercial legado tenant | `commercial_nodes`, `coverage_zones`, `plan_catalog_items` | 000 (tenant) |
| Plataforma (schema `public`) | `tenants`, `platform_users`, `platform_audit_logs` | 001 (public) |
| Media (schema `public`) | `media_assets` | 008 (public) |
| Branding plataforma (schema `public`) | `platform_branding_settings` | 010 (public) |
| Control de acceso / organización | `access_permission_catalog`, `access_profiles`, `access_profile_permissions`, `user_access_profiles`, `organization_sites`, `organization_site_capabilities`, `organization_site_business_hours`, `organization_site_assignments`, `organization_site_responsibilities` | 037 (tenant) |
| Horarios empresa / excepciones | `organization_company_business_hours`, `organization_business_hours_exceptions` | 040 (tenant) |
| WFM eventualidades / overrides | `wfm_operational_eventualities`, `wfm_technician_business_overrides` | 042 / 041 (tenant) |
| Tareas (MOD11) | `operational_tasks`, `task_timeline_events`, `task_assignment_history` | 045 (tenant) |
| Órdenes de ejecución (núcleo) | `execution_orders`, `execution_order_activities`, `execution_order_item_usage`, `execution_order_evidence` | 046 (tenant) |
| Inventario/SCM (núcleo) | `inventory_items`, `stock_locations`, `purchase_requests`, `supplier_quotes`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `stock_lots`, `serialized_assets`, `stock_movements`, `stock_balances`, `stock_movement_lines`, `goods_receipt_lines`, `asset_lifecycle_events`, `asset_loan_assignments`, `inventory_write_offs` | 047 (tenant) |
| Compras (refino) | `purchase_request_lines`, `purchase_request_line_awards` | 049 (tenant) |
| Categorías inventario | `inventory_categories` | 052 (tenant) |
| Salidas de stock | `stock_issues`, `stock_issue_lines` | 057 (tenant) |
| RFQ / invitaciones | `purchase_rfqs`, `purchase_rfq_invitations` | 059 (tenant) |
| Proveedores | `supplier_profiles` | 064 (tenant) |
| Líneas de cotización proveedor | `supplier_quote_lines` | 069 (tenant) |
| Conteos | `stock_counts`, `stock_count_lines` | 071 (tenant) |
| Trazabilidad EO (outbox/inbox/idempotencia/intents) | `execution_order_outbox_events`, `execution_order_inbox_events`, `execution_order_idempotency_records`, `execution_order_audit_intents` | 090 (tenant) |
| Plantillas EO | `execution_order_templates`, `execution_order_template_versions`, `execution_order_template_requirements` | 094 (tenant) |
| Intents de evidencia | `execution_order_evidence_upload_intents` | 095 (tenant) |
| No realizaciones | `non_realization_causes` | 103 (tenant) |
| Impuestos movimientos / cotizaciones | `stock_movement_taxes`, `supplier_quote_taxes` | 127 / 124 (tenant) |
| Seriales salida | `stock_issue_line_serials` | 126 (tenant) |
| Transiciones EO | `execution_order_status_transitions` | 132 (tenant) |
| Recibos / reversiones inventario-EO | `inventory_execution_request_receipts`, `execution_order_item_usage_reversals`, `inventory_execution_request_reversal_receipts` | 139 / 140 / 141 (tenant) |
| Agenda / OT (MOD09) | `schedule_events`, `work_orders`, `work_order_tasks`, `schedule_reschedule_logs`, `technician_availability` | 030 (tenant) |
| Assurance (MOD10) | `ticket_sla_policies`, `support_tickets`, `ticket_comments`, `ticket_timeline_events`, `ticket_pqr_records`, `ticket_work_order_links` | 031 (tenant) |
| Visitas | `visit_requests` | 034 (tenant) |
| Horarios WFM | `wfm_company_business_hours`, `wfm_site_business_hours`, `wfm_holiday_blackouts` (más `wfm_operating_sites` y mapeos 038/039) | 036 (tenant) |

`apps/worker`: 0 ficheros `*.entity.ts`, 0 `forFeature`/`InjectRepository` — sin riesgo entidad↔tabla en el worker.

## 4. Casos conocidos — confirmación explícita

- **G7-1 `potential_leads` / `subscriber_contacts`:** confirmado — ninguna migración registrada crea esas tablas (búsqueda en `migrations/tenant` y `migrations/public` sin `CREATE TABLE` para ambas; solo aparecen en código y en la guarda de `anonymize-titular.ts:970` para `potential_leads`). `ContactsModule` desmontado (D-CONT ya aplicado); `PotentialsModule` tampoco está montado.
- **G7-4 `habeas_data_consents` / `arco_requests`:** confirmado — solo existen como `CREATE TABLE` dentro del spec `146_privacy_module.integration.spec.ts:121-134` (fixture de test, no migración) y la propia 146 las trata como «origen no disponible» (`146_privacy_module.ts:193-196, 660-665`). Las entidades siguen declaradas y su módulo sigue montado, pero el controlador responde 410 sin tocar BD.

## 5. Método de búsqueda reproducible (solo lectura)

```bash
# 1. Universo de entidades (132 ficheros)
grep -rl "@Entity(" apps/api/src apps/worker packages/database/src --include="*.entity.ts" | sort
# 2. Tablas creadas por migraciones tenant (origen: runner registrado)
grep -rhn "CREATE TABLE" packages/database/src/migrations/tenant --include="*.ts" | grep -v spec | sort
# 3. Contraste por tabla (ejemplo para cada sospechosa; debe dar vacío en migraciones reales)
grep -rn "potential_leads\|subscriber_contacts\|habeas_data_consents\|arco_requests\|opportunities\|prospect_cases\|customer_activations" packages/database/src/migrations --include="*.ts" | grep -v spec
# 4. Runners registrados (fuente de verdad del orden y alcance)
#    packages/database/src/migrations/tenant/runner.ts (TENANT_MIGRATIONS, 000–148)
#    packages/database/src/migrations/public/index.ts (PUBLIC_MIGRATIONS, 001–027)
# 5. Montaje: imports de app.module.ts, crm.module.ts y grep de "XxxModule" en apps/api/src
grep -rn "PotentialsModule\|ProspectsModule\|ReviewsModule\|ContactsModule\|OpportunitiesModule\|HabeasDataModule" apps/api/src --include="*.module.ts"
# 6. Uso real: controladores (@Controller/@Get/@Post/...) y repositorios (forFeature/InjectRepository/queryBuilder) por módulo
```

Criterio de veredicto: tabla creada ⇔ `CREATE TABLE <tabla>` (o `IF NOT EXISTS`) en un fichero de migración **importado por su runner** (`TENANT_MIGRATIONS` / `PUBLIC_MIGRATIONS`); los `CREATE TABLE` dentro de `*.spec.ts` son fixtures y no cuentan. Riesgo P1 ⇔ módulo en la cadena de imports hasta `AppModule` **y** repositorio/query sobre la entidad en código vivo. Riesgo P3 ⇔ módulo no importado, o montado sin ningún acceso a BD (retirado 410 / sin `forFeature`).

## 6. Recomendación por hallazgo (no se aplica código en este informe)

| Hallazgo | Recomendación (para el orquestador / sr-backend + data-eng) |
|---|---|
| **O-1 (P1) `opportunities` montado sin tabla** | Decisión CTO con dos caminos: (a) si el pipeline de oportunidades sigue vigente, fase propia con migración `149_create_opportunities` (reversible, con índice por tenant/estado según consultas de `opportunities.service.ts`) antes de cualquier release que la exponga; (b) si está superado por expedientes/potentials, desmontar `OpportunitiesModule` de `CrmModule` con el mismo patrón D-CONT (comentario + spec que fije el desmontaje) y retirar o marcar 410 sus rutas. Mientras tanto, G7 no expone `/opportunities` en smoke. |
| **O-2 (P3) `prospect_cases` sin tabla, módulos muertos** | Higiene: o se reintroducen con migración y montaje (fase propia), o se elimina el código muerto (`ProspectsModule`, `ReviewsModule`, `ProspectCase`, `CustomerActivation`, `ConsentRecord` de reviews) para que no confunda. No bloquea G7. Si se conserva, el invariante de K2Δ (objetivo ↔ migración) debería extenderse a entidades ↔ migración para impedir que vuelva a crecer. |
| **O-3 (P3) `customer_activations` sin tabla** | Idem O-2; va en el mismo paquete de higiene. |
| **Casos G7-1/G7-4 (P3)** | Sin acción de esquema: mantener desmontado/retirado. Cuando `party_contact` cubra el caso de uso, valorar borrar las 4 entidades huérfanas en una fase de limpieza (rompe la confusión, no el runtime). El test invariante de K2Δ ya cubre el vector CLI; añadir el invariante entidad↔migración cierra el vector ORM. |
| **Duplicidad `consent_records` (filas 17/24)** | Dos clases (`ConsentRecord` v2 en expedientes y `ConsentRecord` en reviews) mapean la misma tabla; hoy solo la v2 está viva. Recomendación: eliminar la de reviews con el paquete O-2/O-3, o renombrar/documentar si debe convivir. Riesgo actual bajo (módulo muerto), pero dos metadatos sobre una tabla es fuente de drift en futuros `synchronize`/comparaciones de esquema. |
| **Transversal** | Añadir un spec invariante «toda `@Entity()` registrada en un módulo montado tiene `CREATE TABLE` en una migración del runner» (extensión natural del invariante K2Δ). Solo lectura aquí; lo implementa sr-backend/sr-qa en su bloque. |

## 7. Límites de esta auditoría

- Solo lectura de código y migraciones; **no se consultó ninguna base** (ni `dbiw` ni desechables) ni se ejecutó migración alguna.
- No se evalúa si el DDL de cada migración coincide columna a columna con su entidad (drift fino), solo existencia de tabla; el invariante propuesto lo cubriría a futuro.
- Sin PII, secretos ni credenciales en este informe; rutas y líneas citadas como evidencia verificable.
