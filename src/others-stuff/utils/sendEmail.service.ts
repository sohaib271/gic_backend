import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  constructor(private configService: ConfigService) {}

  async sendEmail(to: string, subject: string, html: string): Promise<void> {

    const transporter = nodemailer.createTransport(<SMTPTransport.Options>{
      host: "smtp.gmail.com",
   secure: false,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
    family: 4,
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      },
    });

    await transporter.sendMail({
      from: `"GIC " <${this.configService.get('EMAIL_USER')}>`,
      to,
      subject,
      html,
    });
  }
}