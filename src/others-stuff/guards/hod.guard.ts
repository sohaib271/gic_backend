import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class HodGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
   const user=request.user;


    if (!user || user.role !== 'proff') {
      throw new ForbiddenException('Only hods can access this resource');
    }

    return true;
  }
}