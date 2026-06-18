import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, @InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    // Check if user is admin
    if (user.role === 'admin') {
      return true;
    }
    
    // For 'hod' required role: check if user has isHod=true in database
    if (requiredRoles.includes('hod')) {
      const dbUser = await this.userModel.findById(user.sub).select("_id isHod").lean();
      
      if (dbUser?.isHod === true) {
        return true;
      }
    }
    
    return false;
  }
}
