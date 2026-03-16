import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsQueryDto } from './dto/list-items-query.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemEntity } from './entities/item.entity';
import { PaginatedItemsEntity } from './entities/paginated-items.entity';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateItemDto, userId: string): Promise<ItemEntity> {
    const item = await this.prisma.item.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        createdById: userId,
      },
    });
    return ItemEntity.fromRecord(item);
  }

  async findAll(query: ListItemsQueryDto): Promise<PaginatedItemsEntity> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [items, totalItems] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.item.count({ where }),
    ]);

    return PaginatedItemsEntity.create({
      items: items.map(item => ItemEntity.fromRecord(item)),
      page,
      limit,
      totalItems,
    });
  }

  async findOne(id: string): Promise<ItemEntity> {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found.');
    return ItemEntity.fromRecord(item);
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemEntity> {
    await this.findOne(id);
    const updated = await this.prisma.item.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
      },
    });
    return ItemEntity.fromRecord(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.item.delete({ where: { id } });
  }
}
