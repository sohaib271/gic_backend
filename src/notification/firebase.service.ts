import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

type ServiceAccount = Parameters<typeof cert>[0];

/**
 * FirebaseService
 * Sends FCM push notifications to registered device tokens.
 * Gracefully no-ops when FIREBASE_* env vars are not configured.
 */
@Injectable()
export class FirebaseService {
  private logger = new Logger('FirebaseService');
  private app: App | null = null;
  private configured = false;

  constructor(private readonly configService: ConfigService) {
    this.tryInit();
  }

  private tryInit() {
    try {
      const rawCredential = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (rawCredential) {
        // Full service-account JSON in a single env var
        const serviceAccount = JSON.parse(rawCredential) as ServiceAccount;
        this.app = initializeApp({
          credential: cert(serviceAccount),
        });
        this.configured = true;
        this.logger.log('Firebase initialized from FIREBASE_SERVICE_ACCOUNT');
      } else if (projectId && clientEmail && privateKey) {
        // Individual parts (private key must have \n encoded)
        const normalizedKey = privateKey.includes('\\n')
          ? privateKey.replace(/\\n/g, '\n')
          : privateKey;
        this.app = initializeApp({
          credential: cert({ projectId, clientEmail, privateKey: normalizedKey }),
        });
        this.configured = true;
        this.logger.log('Firebase initialized from individual env vars');
      } else {
        this.logger.warn(
          'FIREBASE_* env vars not configured. FCM push notifications will be skipped.',
        );
      }
    } catch (error) {
      this.logger.error(`Firebase init failed: ${error}`);
    }
  }

  isConfigured(): boolean {
    return this.configured && this.app !== null;
  }

  async sendToToken(
    token: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<void> {
    if (!this.isConfigured() || !this.app) return;
    try {
      await getMessaging(this.app).send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'high_priority_channel',
          },
        },
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `FCM send failed for token ${token.slice(0, 12)}...: ${error?.message || error}`,
      );
    }
  }

  async sendToTokens(
    tokens: string[],
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<void> {
    if (!this.isConfigured() || !this.app) return;
    const uniqueTokens = [...new Set(tokens)].filter(Boolean);
    if (uniqueTokens.length === 0) return;

    const chunkSize = 500;
    for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
      const chunk = uniqueTokens.slice(i, i + chunkSize);
      try {
        await getMessaging(this.app).sendEachForMulticast({
          tokens: chunk,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data || {},
          android: {
            priority: 'high',
            notification: {
              channelId: 'high_priority_channel',
            },
          },
          apns: {
            payload: {
              aps: { sound: 'default', badge: 1 },
            },
          },
        });
      } catch (error: any) {
        this.logger.warn(
          `FCM multicast send failed: ${error?.message || error}`,
        );
      }
    }
  }
}