import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
  private readonly users=[
    {
      id:1,
      name:"Ali",
      email:"ali123@gmail.com",
      password:"123456789",
      role:"admin"
    },
    {
      id:2,
      name:"Sam",
      email:"sam453@gmail.com",
      password:"sam1234",
      role:"hod"
    }
  ]

  async findOne(email:string){
    return this.users.find(a => a.email===email); // will be replaced by db query
  }
}
