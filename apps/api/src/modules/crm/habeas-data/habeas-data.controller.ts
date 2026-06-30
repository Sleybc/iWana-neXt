import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CreateArcoRequestDto, UpdateArcoRequestStatusDto } from './dto/arco-request.dto';
import { CreateHabeasDataConsentDto } from './dto/create-habeas-data-consent.dto';
import { HabeasDataService } from './habeas-data.service';
import { HabeasDataConsent } from './entities/habeas-data-consent.entity';
import { ArcoRequest } from './entities/arco-request.entity';

@ApiTags('habeas-data')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class HabeasDataController {
  constructor(private readonly habeasDataService: HabeasDataService) {}

  @Post('subscribers/:subscriberId/habeas-data/consent')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Registrar consentimiento Habeas Data de suscriptor' })
  @ApiResponse({ status: 201 })
  async createConsent(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body() dto: CreateHabeasDataConsentDto,
  ): Promise<{ data: HabeasDataConsent }> {
    const data = await this.habeasDataService.createConsent(subscriberId, dto);
    return { data };
  }

  @Get('subscribers/:subscriberId/habeas-data/consents')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar historial de consentimientos del suscriptor' })
  async listConsents(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
  ): Promise<{ data: HabeasDataConsent[] }> {
    const data = await this.habeasDataService.listConsents(subscriberId);
    return { data };
  }

  @Post('subscribers/:subscriberId/habeas-data/arco')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear solicitud ARCO para suscriptor' })
  async createArcoRequest(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body() dto: CreateArcoRequestDto,
  ): Promise<{ data: ArcoRequest }> {
    const data = await this.habeasDataService.createArcoRequest(subscriberId, dto);
    return { data };
  }

  @Get('subscribers/:subscriberId/habeas-data/arco')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar solicitudes ARCO del suscriptor' })
  async listArcoRequests(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
  ): Promise<{ data: ArcoRequest[] }> {
    const data = await this.habeasDataService.listArcoRequests(subscriberId);
    return { data };
  }

  @Patch('habeas-data/arco/:requestId')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar estado de solicitud ARCO' })
  async patchArcoStatus(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: UpdateArcoRequestStatusDto,
  ): Promise<{ data: ArcoRequest }> {
    const data = await this.habeasDataService.updateArcoStatus(requestId, dto);
    return { data };
  }
}
