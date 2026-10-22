export class ServiceProvisioningActivatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly serviceProvisioningId: string,
    public readonly subscriberId: string,
    public readonly expedienteId: string | null,
    public readonly contractId: string | null,
    public readonly executionOrderId: string,
    public readonly cpeSerialNumber: string | null,
  ) {}
}
