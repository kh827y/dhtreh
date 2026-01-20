import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AppConfigService } from '../config/app-config.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

@Catch()
export class SentryFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(
    adapterHost: HttpAdapterHost,
    private readonly config: AppConfigService,
  ) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: any, host: ArgumentsHost) {
    try {
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      // репортим только 5xx
      if (status >= 500 && this.config.getSentryDsn()) {
        Sentry.captureException(exception);
      }
    } catch (err) {
      logIgnoredError(err, 'SentryFilter capture', undefined, 'debug');
    }
    super.catch(exception, host);
  }
}
