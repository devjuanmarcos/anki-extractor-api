import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { hashPassword } from '../../common/utils/password.util';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { PaginatedUsersEntity } from './entities/paginated-users.entity';
import { UserEntity } from './entities/user.entity';

type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'MEMBER';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async countUsers(): Promise<number> {
    return this.prisma.user.count();
  }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const record = await this.createUser(dto);
    return UserEntity.fromRecord(record);
  }

  async createUser(input: {
    name: string;
    email: string;
    password: string;
    role?: 'ADMIN' | 'MEMBER';
    isActive?: boolean;
  }): Promise<UserRecord> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.findByEmail(email);

    if (existing) {
      throw new ConflictException('Email is already in use.');
    }

    return this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash: await hashPassword(input.password),
        role: input.role ?? 'MEMBER',
        isActive: input.isActive ?? true,
      },
    });
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByIdOrThrow(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  async findPublicById(id: string): Promise<UserEntity> {
    const user = await this.findByIdOrThrow(id);
    return UserEntity.fromRecord(user);
  }

  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsersEntity> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.search
        ? {
            OR: [
              {
                name: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return PaginatedUsersEntity.create({
      items: items.map(item => UserEntity.fromRecord(item)),
      page,
      limit,
      totalItems,
    });
  }

  async updateOwnProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<UserEntity> {
    const user = await this.findByIdOrThrow(id);
    const email = dto.email?.trim().toLowerCase();

    if (email && email !== user.email) {
      const emailOwner = await this.findByEmail(email);

      if (emailOwner && emailOwner.id !== id) {
        throw new ConflictException('Email is already in use.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(email ? { email } : {}),
        ...(dto.password
          ? { passwordHash: await hashPassword(dto.password) }
          : {}),
      },
    });

    return UserEntity.fromRecord(updated);
  }

  async updateRole(id: string, dto: UpdateUserRoleDto): Promise<UserEntity> {
    await this.findByIdOrThrow(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        role: dto.role,
      },
    });

    return UserEntity.fromRecord(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
  ): Promise<UserEntity> {
    await this.findByIdOrThrow(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: dto.isActive,
      },
    });

    return UserEntity.fromRecord(updated);
  }
}
