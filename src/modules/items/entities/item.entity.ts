import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

type ItemShape = {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

export class ItemEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  createdById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromRecord(item: ItemShape): ItemEntity {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      createdById: item.createdById,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
