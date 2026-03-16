import { ApiProperty } from '@nestjs/swagger';
import { APP_ROLES } from '../../../common/types/role';
import type { Role } from '../../../common/types/role';

type UserShape = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export class UserEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: APP_ROLES })
  role!: Role;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromRecord(user: UserShape): UserEntity {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt ?? new Date(0),
      updatedAt: user.updatedAt ?? new Date(0),
    };
  }
}
