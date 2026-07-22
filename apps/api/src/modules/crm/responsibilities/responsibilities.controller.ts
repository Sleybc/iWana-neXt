import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
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
import { ResponsibilitiesService } from './responsibilities.service';
import { UpdateResponsibilityDto, UpdateResponsibilitySchema } from './dto';

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/expedientes')
export class ResponsibilitiesController {
  constructor(private readonly responsibilitiesService: ResponsibilitiesService) {}

  @Get(':id/responsibility')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.PARTNER,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener responsable operativo actual del expediente' })
  async getResponsibility(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.responsibilitiesService.getResponsibility(id);
    return { data };
  }

  @Patch(':id/responsibility')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.PARTNER,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Reasignar responsable operativo del expediente' })
  async updateResponsibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(UpdateResponsibilitySchema)) dto: UpdateResponsibilityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.responsibilitiesService.updateResponsibility(id, dto, user.sub);
    return { data };
  }

  @Get(':id/responsibility/history')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.PARTNER,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener historial operativo de reasignaciones del expediente' })
  async getResponsibilityHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Number(page) : undefined;
    const limitNum = limit ? Number(limit) : undefined;
    const result = await this.responsibilitiesService.getResponsibilityHistory(
      id,
      pageNum,
      limitNum,
    );
    return { data: result.data, total: result.total };
  }
}
