import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPermissionKey } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PERMISSIONS_KEY } from '../../access-control/decorators/permissions.decorator';
import { ExecutionOrdersService } from '../services/execution-orders.service';

/** ABAC resource-aware: RBAC/PermissionsGuard ya verificó capacidad. */
@Injectable()
export class ExecutionOrderAccessGuard implements CanActivate {
  constructor(
    private readonly executionOrdersService: ExecutionOrdersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      params?: { id?: string; eventId?: string };
      method?: string;
    }>();
    const id = request.params?.id;
    const actor = request.user;
    if (!actor) return false;
    const requiredPermissions = this.reflector.getAllAndOverride<AccessPermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Redrive is event-scoped, but still requires a resource-aware preflight.
    // The service repeats this validation in the command transaction.
    if (!id && request.params?.eventId) {
      await this.executionOrdersService.assertActorCanRedrive(request.params.eventId, actor);
      return true;
    }
    if (!id) return false;
    const write = request.method !== 'GET';
    const requiresTechnicalExecution = requiredPermissions
      ? requiredPermissions.includes(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
      : write;
    const requiresSupervisionScope = requiredPermissions?.includes(
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
    );
    await this.executionOrdersService.assertActorAccess(
      id,
      actor,
      write,
      requiresTechnicalExecution,
      requiresSupervisionScope,
    );
    return true;
  }
}
