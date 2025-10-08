import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<any>();
    const req = ctx.getRequest<any>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal Server Error';
    let code = 'InternalError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response) {
        message =
          (response as any).message || (response as any).error || response;
        code = (response as any).error || code;
      } else {
        message = exception.message || message;
      }
    } else if (exception && typeof exception.message === 'string') {
      message = exception.message;
    }

    const body = {
      error: code,
      message: Array.isArray(message) ? message.join('; ') : String(message),
      statusCode: status,
      requestId: req?.requestId || req?.headers?.['x-request-id'] || undefined,
      path: req?.originalUrl || req?.url,
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(body);
  }
}
