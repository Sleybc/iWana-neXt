import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExpedienteService } from '../expediente.service';
import {
  BLOCKED_TITULAR_GUARD_METADATA,
  type BlockedTitularResolver,
} from './guard-blocked-titular.decorator';

interface GuardedRequest {
  params?: Record<string, string | undefined>;
}

@Injectable()
export class ExpedientesBlockedTitularGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly expedienteService: ExpedienteService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resolver = this.reflector.get<BlockedTitularResolver>(
      BLOCKED_TITULAR_GUARD_METADATA,
      context.getHandler(),
    );
    if (!resolver) return true;

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const rawId = request.params?.[resolver.slice('params.'.length)];
    const expedienteId = await new ParseUUIDPipe().transform(rawId ?? '', {
      type: 'param',
      metatype: String,
      data: 'id',
    });
    const expediente = await this.expedienteService.findById(expedienteId);
    if (expediente.anonymizedAt != null) return true;
    const marks = await this.expedienteService.getPrivacyMarksForExpediente(expedienteId);
    if (marks.includes('DATOS_BLOQUEADOS')) {
      throw new ConflictException({
        code: 'PRIVACY_DATA_BLOCKED',
        message: 'Los datos de este titular están bloqueados para edición.',
      });
    }
    return true;
  }
}
