export { CoverageReadPort, type CoverageNode } from './coverage-read.port';
export {
  PlanCatalogReadPort,
  type PlanCatalogItem,
  type PlanSnapshot,
} from './plan-catalog-read.port';
export {
  ExecutionPolicyReadPort,
  type ExecutionPolicySnapshot,
} from './execution-policy-read.port';
export { CrmActorReadPort, type CrmActorSnapshot } from './crm-actor-read.port';
export { CrmQuoteReadPort, type CrmQuoteSnapshot } from './crm-quote-read.port';
export {
  CrmAttributionReadPort,
  type CrmCurrentAttributionSnapshot,
} from './crm-attribution-read.port';
export {
  CrmResponsibilityReadPort,
  type CrmResponsibilityActorSnapshot,
  type CrmResponsibilitySnapshot,
} from './crm-responsibility-read.port';
export {
  CrmSubscriberReadPort,
  type CrmSubscriberSummarySnapshot,
} from './crm-subscriber-read.port';
export { TicketReferencePort, type TicketReference } from './ticket-reference.port';
export { WorkOrderReferencePort, type WorkOrderReference } from './work-order-reference.port';
export {
  InventoryAssignmentPort,
  type InventoryAssignmentReference,
} from './inventory-assignment.port';
export { ExpansionRequestPort, type ExpansionRequestReference } from './expansion-request.port';
export { BillingActivationPort } from './billing-activation.port';
export { ProvisioningActivationPort } from './provisioning-activation.port';
