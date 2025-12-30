import { Permissions } from "./permission";
import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY='permissions';

export const Permission=(...permissions:Permissions[])=>SetMetadata(permissions,PERMISSION_KEY);