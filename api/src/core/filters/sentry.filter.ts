import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: any, host: ArgumentsHost) {
    try {
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      // репортим только 5xx
      if (status >= 500 && process.env.SENTRY_DSN) {
        Sentry.captureException(exception);
      }
    } catch {}
    super.catch(exception, host);
  }
}
