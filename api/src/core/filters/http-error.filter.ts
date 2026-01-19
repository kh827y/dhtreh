import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private formatMessage(message: unknown): string {
    if (Array.isArray(message)) {
      if (message.every((item) => typeof item === 'string')) {
        return message.join('; ');
      }
      try {
        return JSON.stringify(message);
      } catch {
        return 'Internal Server Error';
      }
    }
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      try {
        return JSON.stringify(message);
      } catch {
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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const responseObj = this.asRecord(response);
        message =
          responseObj?.message ?? responseObj?.error ?? response ?? message;
        if (
          typeof responseObj?.error === 'string' &&
          responseObj.error.trim()
        ) {
          code = responseObj.error;
        }
      } else {
        message = exception.message || message;
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
    }

    const body = {
      error: code,
      message: this.formatMessage(message),
      statusCode: status,
      requestId: req?.requestId || req?.headers?.['x-request-id'] || undefined,
      path: req?.originalUrl || req?.url,
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(body);
  }
}
