import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod.validation.pipe';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsQueryDto } from './dto/list-items-query.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemEntity } from './entities/item.entity';
import { PaginatedItemsEntity } from './entities/paginated-items.entity';
import {
  createItemSchema,
  listItemsQuerySchema,
  updateItemSchema,
} from './schemas/item.schema';
import { ItemsService } from './items.service';

@ApiTags('Items')
@ApiBearerAuth('bearer')
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new item.' })
  @ApiCreatedResponse({ type: ItemEntity })
  async create(
    @Body(new ZodValidationPipe(createItemSchema)) dto: CreateItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ItemEntity> {
    return this.itemsService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List items with search and pagination.' })
  @ApiOkResponse({ type: PaginatedItemsEntity })
  async findAll(
    @Query(new ZodValidationPipe(listItemsQuerySchema))
    query: ListItemsQueryDto,
  ): Promise<PaginatedItemsEntity> {
    return this.itemsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an item by id.' })
  @ApiOkResponse({ type: ItemEntity })
  async findOne(@Param('id') id: string): Promise<ItemEntity> {
    return this.itemsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an item.' })
  @ApiOkResponse({ type: ItemEntity })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemDto,
  ): Promise<ItemEntity> {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an item.' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string): Promise<void> {
    return this.itemsService.remove(id);
  }
}
