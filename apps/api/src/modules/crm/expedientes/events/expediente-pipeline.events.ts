export class ExpedienteReadyForInstallationEvent {
  constructor(
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly expedienteId: string,
    public readonly actorUserId: string,
  ) {}
}

export class ExpedienteActivatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly expedienteId: string,
    public readonly actorUserId: string,
  ) {}
}

export class ExpedienteDiscardedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly expedienteId: string,
    public readonly actorUserId: string,
    public readonly reason: string | null,
  ) {}
}
