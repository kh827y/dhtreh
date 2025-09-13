import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import {
  PushProvider,
  SendPushParams,
  PushResult,
  BulkPushParams,
  BulkPushResult,
  TopicPushParams,
} from '../push-provider.interface';

/**
 * Firebase Cloud Messaging провайдер для push-уведомлений
 * Поддерживает Android и iOS
 */
@Injectable()
export class FcmProvider implements PushProvider {
  private app: admin.app.App;
  private messaging: admin.messaging.Messaging;

  constructor(private configService: ConfigService) {
    // Инициализация Firebase Admin SDK
    const serviceAccount = this.configService.get('FIREBASE_SERVICE_ACCOUNT');
    
    if (serviceAccount) {
      try {
        const account = typeof serviceAccount === 'string' 
          ? JSON.parse(serviceAccount) 
          : serviceAccount;

        this.app = admin.initializeApp({
          credential: admin.credential.cert(account),
        });
        
        this.messaging = admin.messaging(this.app);
      } catch (error) {
        console.error('Failed to initialize Firebase:', error);
        // Создаем mock объект для разработки
        this.messaging = null as any;
      }
    } else {
      console.warn('Firebase service account not configured');
      this.messaging = null as any;
    }
  }

  /**
   * Отправить push-уведомление на устройство
   */
  async sendPush(params: SendPushParams): Promise<PushResult> {
    if (!this.messaging) {
      return {
        success: false,
        error: 'Firebase not configured',
      };
    }

    try {
      const message: admin.messaging.Message = {
        token: params.token,
        notification: {
          title: params.title,
          body: params.body,
          imageUrl: params.image,
        },
        data: params.data,
        android: {
          priority: params.priority === 'high' ? 'high' : 'normal',
          ttl: params.ttl ? params.ttl * 1000 : undefined, // В миллисекундах
          collapseKey: params.collapseKey,
          notification: {
            icon: params.icon || 'ic_notification',
            sound: params.sound || 'default',
            tag: params.collapseKey,
            clickAction: params.clickAction || 'OPEN_APP',
            // Для Android 8+ (notification channels)
            channelId: 'loyalty_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: params.title,
                body: params.body,
              },
              badge: params.badge,
              sound: params.sound || 'default',
              contentAvailable: true,
              mutableContent: true,
            },
          },
          headers: {
            'apns-priority': params.priority === 'high' ? '10' : '5',
            'apns-expiration': params.ttl ? String(Math.floor(Date.now() / 1000 + params.ttl)) : '',
          },
        },
        webpush: {
          notification: {
            title: params.title,
            body: params.body,
            icon: params.icon,
            image: params.image,
            badge: params.icon,
            tag: params.collapseKey,
            requireInteraction: params.priority === 'high',
          },
          fcmOptions: {
            link: params.clickAction,
          },
        },
      };

      const response = await this.messaging.send(message);

      return {
        messageId: response,
        success: true,
      };
    } catch (error: any) {
      // Обработка ошибок FCM
      if (error.code === 'messaging/registration-token-not-registered') {
        return {
          success: false,
          error: 'Token expired or invalid',
          canonicalToken: undefined,
        };
      }

      if (error.code === 'messaging/invalid-registration-token') {
        return {
          success: false,
          error: 'Invalid token format',
        };
      }

      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Массовая отправка push-уведомлений
   */
  async sendBulkPush(params: BulkPushParams): Promise<BulkPushResult> {
    if (!this.messaging) {
      return {
        successCount: 0,
        failureCount: params.tokens.length,
        results: params.tokens.map(token => ({
          token,
          success: false,
          error: 'Firebase not configured',
        })),
      };
    }

    try {
      const messages: admin.messaging.Message[] = params.tokens.map(token => ({
        token,
        notification: {
          title: params.title,
          body: params.body,
          imageUrl: params.image,
        },
        data: params.data,
        android: {
          priority: params.priority === 'high' ? 'high' : 'normal',
          notification: {
            channelId: 'loyalty_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: params.title,
                body: params.body,
              },
              contentAvailable: true,
            },
          },
          headers: {
            'apns-priority': params.priority === 'high' ? '10' : '5',
          },
        },
      }));

      const response = await (this.messaging as any).sendAll(messages);

      const results = response.responses.map((res, index) => ({
        token: params.tokens[index],
        messageId: res.messageId,
        success: res.success,
        error: res.error?.message,
      }));

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        results,
      };
    } catch (error: any) {
      return {
        successCount: 0,
        failureCount: params.tokens.length,
        results: params.tokens.map(token => ({
          token,
          success: false,
          error: error.message || 'Unknown error',
        })),
      };
    }
  }

  /**
   * Подписать устройство на топик
   */
  async subscribeToTopic(token: string, topic: string): Promise<void> {
    if (!this.messaging) {
      throw new Error('Firebase not configured');
    }

    try {
      await this.messaging.subscribeToTopic([token], topic);
    } catch (error: any) {
      throw new Error(`Failed to subscribe to topic: ${error.message}`);
    }
  }

  /**
   * Отписать устройство от топика
   */
  async unsubscribeFromTopic(token: string, topic: string): Promise<void> {
    if (!this.messaging) {
      throw new Error('Firebase not configured');
    }

    try {
      await this.messaging.unsubscribeFromTopic([token], topic);
    } catch (error: any) {
      throw new Error(`Failed to unsubscribe from topic: ${error.message}`);
    }
  }

  /**
   * Отправить уведомление на топик
   */
  async sendToTopic(topic: string, params: TopicPushParams): Promise<PushResult> {
    if (!this.messaging) {
      return {
        success: false,
        error: 'Firebase not configured',
      };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: params.title,
          body: params.body,
          imageUrl: params.image,
        },
        data: params.data,
        android: {
          priority: params.priority === 'high' ? 'high' : 'normal',
          notification: {
            channelId: 'loyalty_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: params.title,
                body: params.body,
              },
              contentAvailable: true,
            },
          },
          headers: {
            'apns-priority': params.priority === 'high' ? '10' : '5',
          },
        },
      };

      const response = await this.messaging.send(message);

      return {
        messageId: response,
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }
}
