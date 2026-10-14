import { BadRequestException, type CanActivate, type ExecutionContext } from '@nestjs/common';

interface RequestWithBody {
  body?: unknown;
}

/** Impide que clientes reasignen ids de assets que ahora gestiona el servidor. */
export class RejectClientStratumEvidenceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const body = context.switchToHttp().getRequest<RequestWithBody>().body;
    if (
      body !== null &&
      typeof body === 'object' &&
      Object.prototype.hasOwnProperty.call(body, 'stratumEvidenceMediaId')
    ) {
      throw new BadRequestException({
        code: 'STRATUM_EVIDENCE_SERVER_MANAGED',
        message: 'El soporte de estrato se gestiona mediante la acción dedicada del contrato.',
      });
    }
    return true;
  }
}
