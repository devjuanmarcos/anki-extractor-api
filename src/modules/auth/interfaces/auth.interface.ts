import { Role } from '../../../common/types/role';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  type: 'refresh';
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
