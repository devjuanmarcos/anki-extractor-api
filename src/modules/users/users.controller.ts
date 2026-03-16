import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod.validation.pipe';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { PaginatedUsersEntity } from './entities/paginated-users.entity';
import { UserEntity } from './entities/user.entity';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from './schemas/user.schema';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create a new user from an authenticated admin session.',
  })
  @ApiCreatedResponse({ type: UserEntity })
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
  ): Promise<UserEntity> {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List users with search and pagination.' })
  @ApiOkResponse({ type: PaginatedUsersEntity })
  async findAll(
    @Query(new ZodValidationPipe(listUsersQuerySchema))
    query: ListUsersQueryDto,
  ): Promise<PaginatedUsersEntity> {
    return this.usersService.findAll(query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated user profile.' })
  @ApiOkResponse({ type: UserEntity })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserEntity> {
    return this.usersService.findPublicById(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile.' })
  @ApiOkResponse({ type: UserEntity })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<UserEntity> {
    return this.usersService.updateOwnProfile(user.id, dto);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get a user by id.' })
  @ApiOkResponse({ type: UserEntity })
  async findOne(@Param('id') id: string): Promise<UserEntity> {
    return this.usersService.findPublicById(id);
  }

  @Patch(':id/role')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a user role.' })
  @ApiOkResponse({ type: UserEntity })
  async updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserRoleSchema)) dto: UpdateUserRoleDto,
  ): Promise<UserEntity> {
    return this.usersService.updateRole(id, dto);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Activate or deactivate a user.' })
  @ApiOkResponse({ type: UserEntity })
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserStatusSchema))
    dto: UpdateUserStatusDto,
  ): Promise<UserEntity> {
    return this.usersService.updateStatus(id, dto);
  }
}
