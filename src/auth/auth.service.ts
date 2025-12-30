import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { LoginDto } from './dto/userDto';

@Injectable()
export class AuthService {
  constructor(private readonly configService:ConfigService,private readonly jwtservice:JwtService,private readonly userService:UserService){}

  async signIn(loginDto:LoginDto){
    const msg="Invalid Credentials";
    const user=await this.userService.findOne(loginDto.email);
    if(!user) return {msg};
    if(user?.password!==loginDto.password) return {msg};

    const payload={id:user.id,role:user.role,email:user.email};
    const token=await this.jwtservice.signAsync(payload);

    return {token};
  }


}
