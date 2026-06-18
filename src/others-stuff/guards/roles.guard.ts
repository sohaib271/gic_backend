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
    
    // First check: if user has the exact role from JWT token
    if (requiredRoles.includes(user.role)) {
      return true;
    }
    
    // Second check: for HOD role, check database (handles "proff" with isHod=true)
    if (requiredRoles.includes('hod')) {
      const findU = await this.userModel.findById(user.sub).select("_id department isHod role").lean();
      if (findU?.isHod === true) {
        const req = context.switchToHttp().getRequest();
        const targetDept = req.query.department;
        
        // If department query param is provided, validate it matches
        if (targetDept) {
          return findU?.department?.toString() === targetDept.toString();
        }
        
        // No department param = allow (HOD can create announcements)
        return true;
      }
    }
    
    return false;
  }
}
