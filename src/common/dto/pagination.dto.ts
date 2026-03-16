import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Current page number.',
    example: 1,
    default: 1,
    minimum: 1,
  })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items returned per page.',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  limit?: number = 20;

  toPrismaPagination() {
    const page = this.page && this.page > 0 ? this.page : 1;
    const limit = this.limit && this.limit > 0 ? Math.min(this.limit, 100) : 20;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }
}
