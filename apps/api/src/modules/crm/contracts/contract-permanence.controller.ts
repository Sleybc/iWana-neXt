import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessPermissionKey, PlatformRole, UserRole } from '@iwana/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { GuardBlockedTitular } from './guards/guard-blocked-titular.decorator';
import {
  ContractPermanenceService,
  type ContractPermanenceView,
} from './contract-permanence.service';

/** El cliente solo decide aceptar o no; montos y meses salen del plan. */
export const SetContractPermanenceBodySchema = z.object({ accepted: z.boolean() }).strict();
type SetContractPermanenceBody = z.infer<typeof SetContractPermanenceBodySchema>;

@ApiTags('crm-contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/contracts/:id/permanence')
export class ContractPermanenceController {
  constructor(private readonly permanenceService: ContractPermanenceService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({
    summary: 'Permanencia mínima del contrato y oferta del plan',
    description:
      '`permanence` con la forma ContractPermanence (tabla mes 1..N calculada); startDate y endDate ' +
      'van en null hasta la activación. `planOffer` es PlanPermanenceOffer o null.',
  })
  @ApiResponse({ status: 404, description: 'Contrato no encontrado en el tenant' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: ContractPermanenceView }> {
    return { data: await this.permanenceService.get(id) };
  }

  @Put()
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({
    summary: 'Aceptar o rechazar la permanencia mínima (solo contrato en borrador)',
    description:
      'Con accepted=true copia meses y valor de la oferta vigente del plan; el cargo es el ' +
      'installation_fee congelado en el contrato (o el vigente del plan y segmento si no lo tiene) ' +
      'y el valor no lo supera. accepted=false (sin permanencia) siempre es posible.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accepted'],
      additionalProperties: false,
      properties: { accepted: { type: 'boolean' } },
    },
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 404, description: 'Contrato no encontrado en el tenant' })
  @ApiResponse({
    status: 409,
    description:
      'CONTRACT_NOT_DRAFT | PLAN_WITHOUT_PERMANENCE | CONTRACT_INSTALLATION_FEE_REQUIRED | ' +
      'PERMANENCE_EXCEEDS_INSTALLATION_FEE',
  })
  async set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(SetContractPermanenceBodySchema))
    body: SetContractPermanenceBody,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: ContractPermanenceView }> {
    return { data: await this.permanenceService.set(id, body.accepted, actor.sub) };
  }
}
