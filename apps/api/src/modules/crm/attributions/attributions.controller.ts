import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole, UserRole } from '@iwana/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { AttributionsService } from './attributions.service';
import { CreateAttributionDto, CreateAttributionSchema } from './dto/create-attribution.dto';
import { RevokeAttributionDto, RevokeAttributionSchema } from './dto/revoke-attribution.dto';

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/expedientes/:id/attribution')
export class AttributionsController {
  constructor(private readonly attributionsService: AttributionsService) {}

  @Post()
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear o reatribuir originador comercial del expediente' })
  async create(
    @Param('id', ParseUUIDPipe) expedienteId: string,
    @Body(new ZodBodyValidationPipe(CreateAttributionSchema)) dto: CreateAttributionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.attributionsService.createAttribution(expedienteId, dto, user.sub);
    return { data };
  }

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.PARTNER,
    UserRole.SUPPORT,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener atribución activa del expediente' })
  async getCurrent(@Param('id', ParseUUIDPipe) expedienteId: string) {
    const data = await this.attributionsService.getCurrentAttribution(expedienteId);
    return { data };
  }

  @Delete()
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Revocar atribución activa del expediente' })
  async revoke(
    @Param('id', ParseUUIDPipe) expedienteId: string,
    @Body(new ZodBodyValidationPipe(RevokeAttributionSchema)) dto: RevokeAttributionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.attributionsService.revokeAttribution(
      expedienteId,
      dto.reason,
      user.sub,
    );
    return { data };
  }

  @Get('history')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.PARTNER,
    UserRole.SUPPORT,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener historial de atribuciones del expediente' })
  async getHistory(@Param('id', ParseUUIDPipe) expedienteId: string) {
    const data = await this.attributionsService.getAttributionHistory(expedienteId);
    return { data };
  }
}
