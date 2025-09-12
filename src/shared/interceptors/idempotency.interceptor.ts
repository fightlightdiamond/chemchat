import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  IdempotencyService,
  IdempotentCommand,
} from '../services/idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const handler = context.getHandler();
    const args = context.getArgs();

    // Assume the first argument is the command for CQRS handlers
    const command = args[0] as IdempotentCommand;

    if (!command || typeof command !== 'object') {
      return next.handle();
    }

    // Check for idempotency
    const idempotencyResult = await this.idempotencyService.checkIdempotency(
      command,
      handler,
    );

    if (idempotencyResult.isDuplicate) {
      // Return cached result or throw conflict exception
      if (idempotencyResult.cachedResult !== undefined) {
        return new Observable((subscriber) => {
          subscriber.next(idempotencyResult.cachedResult);
          subscriber.complete();
        });
      } else {
        throw new ConflictException('Duplicate request detected');
      }
    }

    // Continue with execution and record success
    return next.handle().pipe(
      tap(() => {
        // Record successful execution for future idempotency checks
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.idempotencyService.recordExecution(command, handler);
      }),
      catchError((error: unknown) => {
        // Don't record failed executions
        return throwError(() => error);
      }),
    );
  }
}
