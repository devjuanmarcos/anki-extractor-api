import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../types/role';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: Role } }>();
    const role = request.user?.role;

    if (!role) {
      throw new ForbiddenException('Authenticated user not found.');
    }

    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException(
        `Access denied. Allowed roles: ${requiredRoles.join(', ')}.`,
      );
    }

    return true;
  }
}
