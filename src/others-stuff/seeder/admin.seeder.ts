// src/database/seed.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { UserRoleEnum } from 'src/user/enum/UserRole.enum';

export async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

  try {
    // Check if admin already exists
    const existingAdmin = await userModel.findOne({
      role: 'admin',
      specialId: '00-ADM-001',
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists. Skipping seed.');
      await app.close();
      return;
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    await userModel.create({
      specialId: '00-ADM-001',
      name: 'System Administrator',
      fatherName: 'Administrator',
      cnic: '0000000000000',
      phone: '0000000000',
      address: 'Admin Office',
      role: UserRoleEnum.ADMIN,
      password: hashedPassword,
      isQrScanned: true,
    });

    // console.log('Admin user created successfully!');
    // console.log('Login Credentials:');
    // console.log('   Special ID: 00-ADM-001');
    // console.log('   Password: Admin@123');
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
  }

  await app.close();
  process.exit(0);
}


