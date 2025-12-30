import { Permissions } from "./permission";

export const ROLE_PERMISSIONS:Record<string, Permissions[]>={
  admin:[
    Permissions.ADD_STUDENTS,
    Permissions.ADD_TEACHERS,
    Permissions.ASSIGN_CLASSES,
    Permissions.DELETE_STUDENTS,
    Permissions.DELETE_TEACHERS,
    Permissions.UPDATE_STUDENTS,
    Permissions.UPDATE_TEACHERS
  ],
  hod:[
    Permissions.ADD_STUDENTS,
    Permissions.MARK_ATTENDENCE
  ]
}