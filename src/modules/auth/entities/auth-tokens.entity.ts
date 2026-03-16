import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../../users/entities/user.entity';

export class AuthTokensEntity {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  access_token!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  refresh_token!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: '15m' })
  accessTokenExpiresIn!: string;

  @ApiProperty({ example: '7d' })
  refreshTokenExpiresIn!: string;

  @ApiProperty({ type: UserEntity })
  user!: UserEntity;

  static create(input: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
    user: UserEntity;
  }): AuthTokensEntity {
    return {
      ...input,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      tokenType: 'Bearer',
    };
  }
}
