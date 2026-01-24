import { CanActivate, ExecutionContext, Injectable,UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/user/schema/user.schema';




@Injectable()
export class AuthGuard implements CanActivate {

  constructor(@InjectModel(User.name) private readonly userModel:Model<UserDocument>,private readonly jwtService:JwtService, private readonly configservice:ConfigService){}
  async canActivate(
    context: ExecutionContext,
  ):Promise<boolean>{
    const request=context.switchToHttp().getRequest();
    try {
      const token=this.extractTokenFromHeader(request);
      if(!token){
        throw new UnauthorizedException("No token from client"); 
      }
      const user=await this.verifyToken(token);
      if(!user){
        throw new UnauthorizedException("Session expired. Login again");
      }
      const dbToken=await this.userModel.findById({_id:user.sub},{verifyToken:1,_id:0});

      if(!dbToken?.verifyToken || (token!==dbToken?.verifyToken)){
          throw new UnauthorizedException("Couldn't verify user. Login again")
      }
      request['user']=user
   
    return true;
      
    } catch (error) {
  if (error instanceof UnauthorizedException) {
    throw error;
  }
  throw new UnauthorizedException('Invalid or expired token');
}
     
  }

  private extractTokenFromHeader(request:Request):string | undefined{
    const [type,token]=request.headers['authorization']?.split(' ');
    return type=='Bearer'?token:undefined;
  }

  private async verifyToken(token:string){
    const payload=await this.jwtService.verifyAsync(token,{
        secret:this.configservice.get('JWT_SECRET')

       });

      return payload;
  }
}