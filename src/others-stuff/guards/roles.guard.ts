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
    const findU = await this.userModel.findById(user.sub).select("_id department isHod role").lean();
    const req = context.switchToHttp().getRequest();
    const targetDept = req.query.department;

    return requiredRoles.some((role) => {
      if (role === "hod") {
        // For HOD: if department is specified in query, check it matches
        // If no department specified, just check user is HOD
        const isHod = findU?.isHod === true;
        if (!isHod) return false;
        
        // If department query param is provided, validate it matches
        if (targetDept) {
          return findU?.department?.toString() === targetDept.toString();
        }
        
        // No department param = allow (HOD can create announcements)
        return true;
      }
      return user.role === role;
    });
  }
}
