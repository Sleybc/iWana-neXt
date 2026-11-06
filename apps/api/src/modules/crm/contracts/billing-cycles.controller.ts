import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  AccessPermissionKey,
  BILLING_PERIOD_PAYMENT_STATES,
  CutoffAgendaQuerySchema,
  PlatformRole,
  UserRole,
  type BillingCycleOption,
  type CutoffAgendaQuery,
  type CutoffAgendaResponse,
} from '@iwana/shared';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { ListMetaDto } from '../../../common/pagination';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ContractsService } from './contracts.service';

const SUBSCRIBER_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SALES,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
  UserRole.AUDITOR,
] as const;

@ApiTags('crm-billing-cycles')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class BillingCyclesController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly effectivePermissionsService: EffectivePermissionsService,
  ) {}

  @Get('crm/billing-cycles')
  @Roles(...SUBSCRIBER_READ_ROLES, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Consultar ciclos de facturación activos' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['cycleDay', 'cutoffDay', 'active', 'nextCutoffDate'],
        properties: {
          cycleDay: { type: 'integer', minimum: 1, maximum: 28 },
          cutoffDay: { type: 'integer', minimum: 1, maximum: 31 },
          active: { type: 'boolean' },
          nextCutoffDate: { type: 'string', format: 'date' },
        },
      },
    },
  })
  async getActiveBillingCycles(): Promise<BillingCycleOption[]> {
    return this.contractsService.getActiveBillingCycles();
  }

  @Get('crm/billing-cycles/cutoff-agenda')
  @Roles(...SUBSCRIBER_READ_ROLES, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Consultar servicios con corte programado en una fecha' })
  @ApiExtraModels(ListMetaDto)
  @ApiQuery({ name: 'date', required: false, type: String, example: '2026-11-15' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 25, maximum: 100 })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['date', 'items', 'meta', 'withoutCycleCount'],
      properties: {
        date: { type: 'string', format: 'date' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'contractId',
              'subscriberId',
              'subscriberDisplayName',
              'planName',
              'billingCycleDay',
              'cutoffDate',
            ],
            properties: {
              contractId: { type: 'string', format: 'uuid' },
              subscriberId: { type: 'string', format: 'uuid' },
              subscriberDisplayName: { type: 'string' },
              planName: { type: 'string', nullable: true },
              billingCycleDay: { type: 'integer' },
              cutoffDate: { type: 'string', format: 'date' },
              paymentState: {
                type: 'string',
                enum: [...BILLING_PERIOD_PAYMENT_STATES],
              },
              paymentPaidAmount: { type: 'string', nullable: true },
              paymentTotalAmount: { type: 'string', nullable: true },
            },
          },
        },
        meta: { $ref: '#/components/schemas/ListMetaDto' },
        withoutCycleCount: { type: 'integer', minimum: 0 },
      },
    },
  })
  async getCutoffAgenda(
    @Query(new ZodValidationPipe(CutoffAgendaQuerySchema)) query: CutoffAgendaQuery,
    @CurrentUser() actor: JwtPayload,
  ): Promise<CutoffAgendaResponse> {
    const canSeeBlocked = await this.canSeeBlockedSubscribers(actor.sub);
    return this.contractsService.getCutoffAgenda(query, actor.role, canSeeBlocked, actor.sub);
  }

  private async canSeeBlockedSubscribers(actorId: string): Promise<boolean> {
    const permissions = new Set(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actorId),
    );
    return (
      permissions.has(AccessPermissionKey.PRIVACY_READ) ||
      permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)
    );
  }
}
