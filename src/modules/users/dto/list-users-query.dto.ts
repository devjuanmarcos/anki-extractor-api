import { ApiPropertyOptional } from '@nestjs/swagger';
import { APP_ROLES } from '../../../common/types/role';
import type { Role } from '../../../common/types/role';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  limit?: number = 20;

  @ApiPropertyOptional()
  search?: string;

  @ApiPropertyOptional({ enum: APP_ROLES })
  role?: Role;

  @ApiPropertyOptional()
  isActive?: boolean;
}
