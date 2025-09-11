import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass, ClassConstructor } from 'class-transformer';

export function ValidateCommand() {
  return function (
    target: unknown,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      const command = args[0];

      if (command && typeof command === 'object' && command !== null) {
        // Get the constructor from the command object
        const CommandClass = (
          command as { constructor: ClassConstructor<unknown> }
        ).constructor;

        // Transform plain object to class instance if needed
        const commandInstance = plainToClass(CommandClass, command);

        // Validate the command
        const errors = await validate(commandInstance as object);

        if (errors.length > 0) {
          const errorMessages = errors
            .map((error) => Object.values(error.constraints || {}).join(', '))
            .join('; ');

          throw new BadRequestException(
            `Command validation failed: ${errorMessages}`,
          );
        }

        // Replace the command with validated instance
        args[0] = commandInstance;
      }

      return (await method.apply(this, args)) as unknown;
    };
  };
}
