import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { APP_ROLES } from '../../../common/types/role';
import type { Role } from '../../../common/types/role';

export class CreateUserDto {
  @ApiProperty({ example: 'Template User' })
  name!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({
    example: 'Str0ngPassw0rd!',
    description:
      'At least 8 characters, with uppercase, lowercase, number and special character.',
  })
  password!: string;

  @ApiPropertyOptional({ enum: APP_ROLES, default: 'MEMBER' })
  role?: Role;

  @ApiPropertyOptional({ default: true })
  isActive?: boolean;
}
