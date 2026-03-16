import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { config } from '../../config/config';
import { OperationMessageEntity } from '../../common/entities/operation-message.entity';
import { PrismaService } from '../../common/services/prisma.service';
import { parseDurationToMs } from '../../common/utils/duration.util';
import { comparePassword } from '../../common/utils/password.util';
import { generateTokenId, hashToken } from '../../common/utils/token.util';
import { UserEntity } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthTokensEntity } from './entities/auth-tokens.entity';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/auth.interface';

const accessTokenTtl = config.auth
  .accessTokenTtl as `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;
const refreshTokenTtl = config.auth
  .refreshTokenTtl as `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensEntity> {
    const email = dto.email.trim().toLowerCase();

    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('Email is already in use.');
    }

    const usersCount = await this.usersService.countUsers();
    const role = usersCount === 0 ? 'ADMIN' : 'MEMBER';
    const user = await this.usersService.createUser({
      name: dto.name,
      email,
      password: dto.password,
      role,
      isActive: true,
    });

    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensEntity> {
    const user = await this.usersService.findByEmail(
      dto.email.trim().toLowerCase(),
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive.');
    }

    const passwordMatches = await comparePassword(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueSession(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokensEntity> {
    let payload: RefreshTokenPayload;

    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(dto.refreshToken, {
        secret: config.auth.refreshTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });

    if (!storedToken || storedToken.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Refresh token has expired or was revoked.',
      );
    }

    if (storedToken.tokenHash !== hashToken(dto.refreshToken)) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('User is inactive.');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(storedToken.user);
  }

  async logout(dto: RefreshTokenDto): Promise<OperationMessageEntity> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(
        dto.refreshToken,
        {
          secret: config.auth.refreshTokenSecret,
        },
      );

      await this.prisma.refreshToken.updateMany({
        where: {
          jti: payload.jti,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      return OperationMessageEntity.create('Session finished.');
    }

    return OperationMessageEntity.create('Session finished.');
  }

  async me(userId: string): Promise<UserEntity> {
    const user = await this.usersService.findByIdOrThrow(userId);
    return UserEntity.fromRecord(user);
  }

  private async issueSession(user: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: 'ADMIN' | 'MEMBER';
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<AuthTokensEntity> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      type: 'refresh',
      jti: generateTokenId(),
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: config.auth.accessTokenSecret,
      expiresIn: accessTokenTtl,
    });
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: config.auth.refreshTokenSecret,
      expiresIn: refreshTokenTtl,
    });

    await this.prisma.refreshToken.create({
      data: {
        jti: refreshPayload.jti,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(
          Date.now() + parseDurationToMs(config.auth.refreshTokenTtl),
        ),
        userId: user.id,
      },
    });

    return AuthTokensEntity.create({
      user: UserEntity.fromRecord(user),
      accessToken,
      refreshToken,
      accessTokenExpiresIn: config.auth.accessTokenTtl,
      refreshTokenExpiresIn: config.auth.refreshTokenTtl,
    });
  }
}
