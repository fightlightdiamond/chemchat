import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(
    message: string,
    public readonly errors: Record<string, string[]>,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        errors,
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
