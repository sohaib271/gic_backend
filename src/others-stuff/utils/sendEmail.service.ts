import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const user = this.configService.get<string>('EMAIL_USER')?.trim();
    // Google displays app passwords in four groups. The spaces are only for
    // readability and must not be sent as part of the SMTP credential.
    const pass = this.configService
      .get<string>('EMAIL_PASS')
      ?.replace(/\s+/g, '');

    if (!user || !pass) {
      throw new Error('EMAIL_USER and EMAIL_PASS must be configured');
    }

    this.from = `"GIC" <${user}>`;
    this.transporter = nodemailer.createTransport(<SMTPTransport.Options>{
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
    });
  }
}
