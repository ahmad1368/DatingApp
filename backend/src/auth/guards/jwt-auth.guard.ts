import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthenticatedUser {
  id: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing authentication token.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = { id: payload.sub } as AuthenticatedUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }

    return true;
  }
}
