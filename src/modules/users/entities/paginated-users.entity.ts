import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from './user.entity';

export class PaginatedUsersEntity {
  @ApiProperty({ type: [UserEntity] })
  items!: UserEntity[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  static create(input: {
    items: UserEntity[];
    page: number;
    limit: number;
    totalItems: number;
  }): PaginatedUsersEntity {
    return {
      ...input,
      totalPages: Math.max(1, Math.ceil(input.totalItems / input.limit)),
    };
  }
}
