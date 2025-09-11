import { BaseCommand } from './base-command';
import { Logger } from '@nestjs/common';

export abstract class BaseCommandHandler<T extends BaseCommand, R = unknown> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract execute(command: T): Promise<R>;

  protected logCommandExecution(command: T): void {
    this.logger.log(`Executing command: ${command.constructor.name}`, {
      correlationId: command.correlationId,
      userId: command.userId,
      tenantId: command.tenantId,
    });
  }

  protected logCommandSuccess(command: T, result?: R): void {
    this.logger.log(
      `Command executed successfully: ${command.constructor.name}`,
      {
        correlationId: command.correlationId,
        userId: command.userId,
        tenantId: command.tenantId,
        result: result ? JSON.stringify(result) : undefined,
      },
    );
  }

  protected logCommandError(command: T, error: Error): void {
    this.logger.error(`Command execution failed: ${command.constructor.name}`, {
      correlationId: command.correlationId,
      userId: command.userId,
      tenantId: command.tenantId,
      error: error.message,
      stack: error.stack,
    });
  }
}
