import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from './app-config.service';

@Injectable()
export class ConfigCheckService implements OnModuleInit {
  private readonly logger = new Logger(ConfigCheckService.name);

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    const nodeEnv = (this.config.getString('NODE_ENV') || '').toLowerCase();
    if (nodeEnv === 'test') return;

    const isProd = nodeEnv === 'production';
    const get = (key: string) => this.config.getString(key);
    const hasValue = (key: string) => {
      const value = get(key);
      return typeof value === 'string' && value.trim() !== '';
    };

    const requiredAlways = ['DATABASE_URL', 'ADMIN_KEY'];
    const requiredInProd = [
      'QR_JWT_SECRET',
      'ADMIN_SESSION_SECRET',
      'PORTAL_JWT_SECRET',
      'PORTAL_REFRESH_SECRET',
      'CORS_ORIGINS',
      'API_KEY',
    ];
    const recommendedInProd = ['API_BASE_URL', 'MINIAPP_BASE_URL'];

    const missingRequired = requiredAlways.filter((key) => !hasValue(key));
    const missingProd = isProd
      ? requiredInProd.filter((key) => !hasValue(key))
      : [];
    const missingRecommended = isProd
      ? recommendedInProd.filter((key) => !hasValue(key))
      : [];

    if (missingRequired.length || missingProd.length) {
      const allMissing = [...missingRequired, ...missingProd];
      this.logger.warn(`Missing required env vars: ${allMissing.join(', ')}`);
    }

    if (missingRecommended.length) {
      this.logger.warn(
        `Missing recommended env vars for production: ${missingRecommended.join(
          ', ',
        )}`,
      );
    }

    if (isProd) {
      const placeholders: Record<string, string[]> = {
        ADMIN_KEY: [
          'change_me_admin_key',
          'generate_strong_random_key_here',
          'admin123',
        ],
        API_KEY: [
          'change_me_api_key',
          'generate_strong_api_key_here',
          'test-api-key',
          'test-key',
        ],
        QR_JWT_SECRET: [
          'change_me_qr_secret',
          'generate_strong_jwt_secret_here',
          'dev_change_me',
        ],
        ADMIN_SESSION_SECRET: [
          'change_me_session_secret',
          'generate_strong_session_secret_here',
          'dev_change_me_session',
        ],
        PORTAL_JWT_SECRET: [
          'change_me_portal_jwt_secret',
          'generate_strong_portal_jwt_secret_here',
          'change_me_portal',
        ],
        PORTAL_REFRESH_SECRET: [
          'change_me_portal_refresh_secret',
          'generate_strong_portal_refresh_secret_here',
          'change_me_portal_refresh',
        ],
      };

      const insecure = Object.keys(placeholders).filter((key) => {
        const value = get(key);
        if (!value) return false;
        const normalized = value.trim();
        return placeholders[key].some((p) => p === normalized);
      });
      if (insecure.length) {
        this.logger.warn(
          `Insecure placeholder values detected for: ${insecure.join(', ')}`,
        );
      }

      const cors = get('CORS_ORIGINS') || '';
      if (cors && /localhost|127\.0\.0\.1/i.test(cors)) {
        this.logger.warn(
          'CORS_ORIGINS contains localhost in production; check allowed origins.',
        );
      }
    }
  }
}
