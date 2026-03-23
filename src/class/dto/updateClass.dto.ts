import { IsOptional, IsString } from "class-validator";

export class UpdateClassDto{
  @IsString()
    @IsOptional()
    session?:string;
  
    @IsString()
    @IsOptional()
    class?:string;
  
}