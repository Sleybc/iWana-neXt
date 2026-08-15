import { ApiProperty } from '@nestjs/swagger';
import {
  SettingsPriorityEvaluation,
  type SettingsPriorityItem,
  SettingsPriorityKey,
  SettingsPriorityLevel,
  type SettingsPriorityResponse,
  SettingsPrioritySource,
  SettingsPriorityState,
  SettingsSectionKey,
} from '@iwana/shared';

export class SettingsPriorityItemDto implements SettingsPriorityItem {
  @ApiProperty({ enum: SettingsPriorityKey, enumName: 'SettingsPriorityKey' })
  key: SettingsPriorityKey;

  @ApiProperty({ enum: SettingsPriorityLevel, enumName: 'SettingsPriorityLevel' })
  level: SettingsPriorityLevel;

  @ApiProperty({ enum: SettingsSectionKey, enumName: 'SettingsSectionKey' })
  sectionKey: SettingsSectionKey;

  @ApiProperty({ example: '/dashboard/settings/access#politicas-de-autenticacion' })
  targetPath: string;
}

export class SettingsPriorityResponseDto implements SettingsPriorityResponse {
  @ApiProperty({ enum: SettingsPriorityState, enumName: 'SettingsPriorityState' })
  state: SettingsPriorityState;

  @ApiProperty({ type: SettingsPriorityItemDto, nullable: true })
  item: SettingsPriorityItemDto | null;

  @ApiProperty({
    enum: SettingsPriorityEvaluation,
    enumName: 'SettingsPriorityEvaluation',
  })
  evaluation: SettingsPriorityEvaluation;

  @ApiProperty({
    type: [String],
    enum: SettingsPrioritySource,
    enumName: 'SettingsPrioritySource',
  })
  unknownSources: SettingsPrioritySource[];
}

export class SettingsPriorityApiResponseDto {
  @ApiProperty({ type: SettingsPriorityResponseDto })
  data: SettingsPriorityResponseDto;
}
