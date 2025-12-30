import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthGuard implements CanActivate {

  constructor(private readonly jwtService:JwtService, private readonly configservice:ConfigService,private readonly userService:UserService){}
  async canActivate(
    context: ExecutionContext,
  ):Promise<boolean>{
    const request=context.switchToHttp().getRequest();
     const token=this.extractTokenFromHeader(request);
      if(!token){
        throw new UnauthorizedException(); 
      }
    try {
      const payload=await this.jwtService.verifyAsync(token,{
        secret:this.configservice.get('JWT_SECRET')
      });
      const user=await this.userService.findOne(payload.email);
      request['user']=user
    } catch (error) {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request:Request):string | undefined{
    const [type,token]=request.headers['authorization']?.split(' ');
    return type=='Bearer'?token:undefined;
  }
}
