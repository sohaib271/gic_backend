# GIC College Management System — Backend

A NestJS REST API for managing school data including students, faculty, classes, and attendance with JWT authentication and role-based access control.

---

## Tech Stack

- **NestJS** with TypeScript
- **MongoDB** via **Mongoose**
- **JWT & HTTP-Only Cookies** — Secure, cross-site authentication.
- **Multer** — file uploads (Excel bulk upload)
- **xlsx** — Excel parsing
- **qrcode** — QR code generation
- **bcrypt** — password hashing
- **class-validator** — DTO validation

---

### Required environment variables

Create a `.env` file in the root:

```env
MONGODB_URI=mongodb://localhost:27017/gic_school
JWT_SECRET=your-jwt-secret
QR_SECRET=your-qr-hmac-secret
PORT=3000
```

---

## Project Structure

```
src/
├── auth/                
├── user/                # Students, professors, staff CRUD + bulk upload
│   ├── dto/
│   ├── schema/
│   └── user.service.ts
├── class/               # Classes, teacher/student assignment, struck-off, schedule
│   ├── dto/
│   ├── schema/
│   │   ├── class.schema.ts
│   │   ├── assignes.schema.ts
│   │   └── struckoff.schema.ts
│   └── class.service.ts
├── attendence/          # Student attendance marking and history
│   ├── dto/
│   ├── schema/
│   └── attendence.service.ts
├── teacher/             # Teacher attendance, QR generation
│   ├── dto/
│   ├── schema/
│   └── teacher.service.ts
├── department/          # Departments
└── others-stuff/
    └── guards/          # AuthGuard, RolesGuard, AdminGuard
```

---

## API Overview

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Login, returns JWT |

### Users
| Method | Endpoint | Roles | Description |
|---|---|---|---|
| POST | `/users/student` | admin, hod | Create student |
| POST | `/users/professor` | admin, hod | Create professor |
| POST | `/users/students/bulk-upload` | admin, hod | Bulk upload via Excel |
| GET | `/users` | admin, proff | Get all users (filter by role/department) |
| GET | `/users/me` | all | Get logged-in user |
| PUT | `/users/:id` | all | Update user (email/password locked) |
| DELETE | `/users/:id` | admin | Delete user |
| GET | `/users/get-schedule/:teacherId` | admin, proff | Get teacher's weekly schedule |
| GET | `/users/student/:studentId/timetable` | admin, student | Get student timetable |

### Classes
| Method | Endpoint | Roles | Description |
|---|---|---|---|
| POST | `/class/create` | admin, hod | Create class |
| GET | `/class/all` | admin, hod | Get all classes (filter by category) | Get all classes by department (for  HOD)
| GET | `/class/my-classes` | proff | Get teacher's assigned classes |
| GET | `/class/get-class-info/:classId` | admin, proff | Class details |
| POST | `/class/assign-teacher-to-class/:id` | admin, hod | Assign teacher |
| PATCH | `/class/:id/assignes/:teacherId` | admin, hod | Update teacher's subject/schedule |
| PATCH | `/class/:id/assignes/:teacherId/schedule` | admin, hod | Replace schedule |
| POST | `/class/:id/assignes/:teacherId/schedule` | admin, hod | Append schedule |
| PATCH | `/class/remove-teacher-from-class/:classId/:teacherId` | admin, hod | Remove teacher |
| POST | `/class/add-student-in-class/:classId/:studentId` | admin, hod | Enroll student |
| PATCH | `/class/remove-student-from-class/:classId/:studentId` | admin, hod | Remove student |
| POST | `/class/struck-off-student/:classId/:studentId` | admin, proff | Struck off student |
| PATCH | `/class/unstruck-off-student/:studentId` | admin, hod | Reinstate student |
| GET | `/class/struck-off-students` | admin, hod, proff | List all struck off |
| GET | `/class/identify-struck-off-student/:studentId` | admin, hod, proff | Student struck off status + history |

### Attendance (Students)
| Method | Endpoint | Roles | Description |
|---|---|---|---|
| POST | `/attendance/mark` | admin, proff | Mark single student |
| POST | `/attendance/mark-bulk` | admin, proff | Mark entire class |
| PATCH | `/attendance/update/:attendanceId` | admin, proff | Update record |
| GET | `/attendance/class/:classId` | admin, proff | Class attendance by date |
| GET | `/attendance/class/:classId/by-teacher` | admin, proff | Class attendance by teacher + date |
| GET | `/attendance/student/:classId/:studentId` | admin, proff, student | Student summary |
| GET | `/attendance/my-history` | proff | Teacher's marked attendance history |

### Teacher Attendance
| Method | Endpoint | Roles | Description |
|---|---|---|---|
| POST | `/teacher/mark-attendance` | proff | Check in / check out via QR |
| GET | `/teacher/today-status` | proff | Today's check-in/out status |
| GET | `/teacher/qr` | admin, proff | Generate shared attendance QR |
| GET | `/teacher/attendance` | proff | Own attendance history |
| GET | `/teacher/attendance/:teacherId` | admin, proff | Specific teacher's history |
| GET | `/teacher/attendance-records` | admin | All teacher attendance records |
| GET | `/teacher/my-assigned-students` | proff | Students assigned to teacher |

---

## Attendance Rules

- Teachers can only mark attendance **on the scheduled day** and **within lecture hours + 30-minute grace period**
- Bulk attendance blocks if already marked for that class/date/lecture
- Individual update blocked outside lecture window or for past dates
- All dates stored as **UTC midnight** to avoid timezone drift
- Current time compared in **PKT (UTC+5)** for schedule validation

---

## QR Attendance Flow

1. Admin opens Faculty QR panel → backend generates a signed HMAC-SHA256 payload with 1-minute expiry
2. Professor opens QR Scanner → selects check-in or check-out → scans QR
3. Frontend parses payload, checks expiry, gets GPS coordinates
4. Sends `{ type, gps, qrPayload, qrSignature }` to `/teacher/mark-attendance`
5. Backend verifies signature, checks duplicate, enforces check-in before check-out, saves record

---

## Struck Off Flow

1. `POST /class/struck-off-student/:classId/:studentId` — creates/updates `StruckOff` document, sets `currentStatus`, pushes to `history`, marks `user.struckOff = true`
2. `PATCH /class/unstruck-off-student/:studentId` — stamps `end` date on matching history entry, clears `currentStatus`, sets `user.struckOff = false`, pushes reinstatement log

---

## Timezone Notes

The server may run in UTC while the school operates in PKT (UTC+5). All date parsing uses `Date.UTC()` and `getUTCDay()` to avoid local-time shifts. Current time is derived by adding the PKT offset to UTC minutes rather than relying on `new Date().getHours()`.