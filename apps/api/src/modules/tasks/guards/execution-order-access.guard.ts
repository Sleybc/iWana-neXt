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
    // Redrive is event-scoped; its tenant/permission checks are handled by
    // PermissionsGuard and the redrive service, not by an OT resource id.
    if (!id && request.params?.eventId) return true;
    if (!id) return false;
    const write = request.method !== 'GET';
    const requiredPermissions = this.reflector.getAllAndOverride<AccessPermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiresTechnicalExecution = requiredPermissions
      ? requiredPermissions.includes(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
      : write;
    await this.executionOrdersService.assertActorAccess(
      id,
      actor,
      write,
      requiresTechnicalExecution,
    );
    return true;
  }
}
