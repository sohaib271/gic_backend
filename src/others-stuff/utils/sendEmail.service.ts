import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null;
  private readonly from: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const user = this.configService.get<string>('EMAIL_USER')?.trim();
    // Google displays app passwords in four groups. The spaces are only for
    // readability and must not be sent as part of the SMTP credential.
    const pass = this.configService
      .get<string>('EMAIL_PASS')
      ?.replace(/\s+/g, '');

    if (!user || !pass) {
      this.logger.warn('EMAIL_USER and EMAIL_PASS not configured. Email sending will be skipped.');
      this.isConfigured = false;
      this.transporter = null;
      this.from = '';
      return;
    }

    this.isConfigured = true;
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
    if (!this.isConfigured || !this.transporter) {
      this.logger.warn(`Skipping email to ${to}: EMAIL_* env vars not configured`);
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
    });
  }
}
