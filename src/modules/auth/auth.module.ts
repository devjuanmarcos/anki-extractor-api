import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { config } from '../../config/config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

const accessTokenTtl = config.auth
  .accessTokenTtl as `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: config.auth.accessTokenSecret,
      signOptions: {
        expiresIn: accessTokenTtl,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
