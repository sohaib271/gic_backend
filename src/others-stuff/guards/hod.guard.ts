import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/user/schema/user.schema';

@Injectable()
export class HodGuard implements CanActivate {
  constructor(@InjectModel(User.name) private userModel:Model<UserDocument>){}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
   const user=request.user;
    const isMatch=await this.userModel.exists({_id:user.sub,role:"proff",isHod:true});
    
    if (!isMatch) {
      throw new ForbiddenException('Only hods can access this resource');
    }

    return true;
  }
}
