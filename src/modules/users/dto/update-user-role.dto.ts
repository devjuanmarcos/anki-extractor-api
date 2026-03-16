import { ApiProperty } from '@nestjs/swagger';
import { APP_ROLES } from '../../../common/types/role';
import type { Role } from '../../../common/types/role';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: APP_ROLES, example: 'ADMIN' })
  role!: Role;
}
