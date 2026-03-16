import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OperationMessageEntity } from '../../common/entities/operation-message.entity';
import { ZodValidationPipe } from '../../common/pipes/zod.validation.pipe';
import { UserEntity } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthTokensEntity } from './entities/auth-tokens.entity';
import type { AuthenticatedUser } from './interfaces/auth.interface';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './schemas/auth.schema';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  @ApiOperation({
    summary: 'Register a new user and immediately create a session.',
  })
  @ApiCreatedResponse({
    description:
      'The first registered user becomes ADMIN automatically. All subsequent users become MEMBER.',
    type: AuthTokensEntity,
  })
  async register(@Body() dto: RegisterDto): Promise<AuthTokensEntity> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  @ApiOperation({ summary: 'Authenticate with email and password.' })
  @ApiOkResponse({ type: AuthTokensEntity })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  async login(@Body() dto: LoginDto): Promise<AuthTokensEntity> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  @ApiOperation({
    summary: 'Exchange a valid refresh token for a new session.',
  })
  @ApiOkResponse({ type: AuthTokensEntity })
  @ApiUnauthorizedResponse({ description: 'Invalid or revoked refresh token.' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensEntity> {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  @ApiOperation({ summary: 'Revoke a refresh token and finish the session.' })
  @ApiOkResponse({ type: OperationMessageEntity })
  async logout(@Body() dto: RefreshTokenDto): Promise<OperationMessageEntity> {
    return this.authService.logout(dto);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Return the authenticated user.' })
  @ApiOkResponse({ type: UserEntity })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserEntity> {
    return this.authService.me(user.id);
  }
}
