import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';
import { asRecord } from '../../shared/common/input.util';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private statusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BadRequest';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'NotFound';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'ValidationFailed';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RateLimited';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'ServiceUnavailable';
      default:
        return 'InternalError';
    }
  }

  private normalizeErrorCode(raw: string, status: number): string {
    const trimmed = raw.trim();
    if (!trimmed) return this.statusToCode(status);
    const normalized = trimmed.replace(/[^a-z0-9]+/gi, '');
    const map: Record<string, string> = {
      BadRequest: 'BadRequest',
      Unauthorized: 'Unauthorized',
      Forbidden: 'Forbidden',
      NotFound: 'NotFound',
      Conflict: 'Conflict',
      UnprocessableEntity: 'ValidationFailed',
      TooManyRequests: 'RateLimited',
      ServiceUnavailable: 'ServiceUnavailable',
    };
    return map[normalized] || trimmed;
  }

  private formatMessage(message: unknown): string {
    if (Array.isArray(message)) {
      if (message.every((item) => typeof item === 'string')) {
        return message.join('; ');
      }
      try {
        return JSON.stringify(message);
      } catch (err) {
        logIgnoredError(
          err,
          'HttpErrorFilter formatMessage',
          undefined,
          'debug',
        );
        return 'Internal Server Error';
      }
    }
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      try {
        return JSON.stringify(message);
      } catch (err) {
        logIgnoredError(
          err,
          'HttpErrorFilter formatMessage',
          undefined,
          'debug',
        );
        return 'Internal Server Error';
      }
    }
    return typeof message === 'number'
      ? String(message)
      : 'Internal Server Error';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const req = ctx.getRequest<{
      requestId?: string;
      headers?: Record<string, string | string[] | undefined>;
      originalUrl?: string;
      url?: string;
    }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Internal Server Error';
    let code = 'InternalError';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const responseObj = asRecord(response);
        message =
          responseObj?.message ?? responseObj?.error ?? response ?? message;
        if (details === undefined) {
          if (responseObj?.details !== undefined) {
            details = responseObj.details;
          } else if (responseObj?.errors !== undefined) {
            details = responseObj.errors;
          } else if (Array.isArray(responseObj?.message)) {
            details = responseObj.message;
          }
        }
        const responseError = responseObj?.error;
        if (typeof responseError === 'string') {
          code = this.normalizeErrorCode(responseError, status);
        } else {
          code = this.statusToCode(status);
        }
      } else {
        message = exception.message || message;
        code = this.statusToCode(status);
      }
    } else if (
      exception &&
      typeof exception === 'object' &&
      'message' in exception
    ) {
      const exceptionMessage = (exception as { message?: unknown }).message;
      if (typeof exceptionMessage === 'string') {
        message = exceptionMessage;
      }
      code = this.statusToCode(status);
    }

    const body = {
      error: code,
      code,
      message: this.formatMessage(message),
      statusCode: status,
      requestId: req?.requestId || req?.headers?.['x-request-id'] || undefined,
      path: req?.originalUrl || req?.url,
      timestamp: new Date().toISOString(),
      ...(details !== undefined ? { details } : {}),
    };

    res.status(status).json(body);
  }
}
