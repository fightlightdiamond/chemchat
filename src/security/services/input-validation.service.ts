import { Injectable } from '@nestjs/common';
import { validate, ValidationError, ValidatorOptions } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { ValidationException } from '../exceptions/validation.exception';

export interface ValidationResult<T> {
  isValid: boolean;
  errors: ValidationError[];
  validatedObject: T;
}

@Injectable()
export class InputValidationService {
  private readonly defaultValidatorOptions: ValidatorOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    skipMissingProperties: false,
    validationError: {
      target: false,
      value: true,
    },
  };

  async validate<T extends object>(
    type: new () => T,
    object: object,
    options: ValidatorOptions = {},
  ): Promise<ValidationResult<T>> {
    const mergedOptions = { ...this.defaultValidatorOptions, ...options };
    const objectToValidate = plainToClass(type, object);
    const errors = await validate(objectToValidate, mergedOptions);

    return {
      isValid: errors.length === 0,
      errors,
      validatedObject: objectToValidate,
    };
  }

  async validateAndThrow<T extends object>(
    type: new () => T,
    object: object,
    options?: ValidatorOptions,
  ): Promise<T> {
    const { isValid, errors, validatedObject } = await this.validate(
      type,
      object,
      options,
    );

    if (!isValid) {
      throw new ValidationException(
        'Validation failed',
        this.formatErrors(errors),
      );
    }

    return validatedObject;
  }

  formatErrors(errors: ValidationError[]): Record<string, string[]> {
    const formattedErrors: Record<string, string[]> = {};

    const processError = (
      error: ValidationError,
      propertyPath = '',
    ): void => {
      const currentPath = propertyPath
        ? `${propertyPath}.${error.property}`
        : error.property;

      if (error.constraints) {
        formattedErrors[currentPath] = Object.values(error.constraints);
      }

      if (error.children && error.children.length > 0) {
        error.children.forEach((childError) =>
          processError(childError, currentPath),
        );
      }
    };

    errors.forEach((error) => processError(error));
    return formattedErrors;
  }

  sanitizeInput<T extends object>(
    type: new () => T,
    object: object,
  ): T {
    // Strip out any properties not defined in the DTO
    const instance = new type();
    const allowedProperties = Object.keys(instance);
    
    const sanitized: Record<string, any> = {};
    for (const key of allowedProperties) {
      if (key in object) {
        sanitized[key] = object[key];
      }
    }
    
    return sanitized as T;
  }

  escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  sanitizeObject<T extends object>(obj: T): T {
    const sanitized = { ...obj };
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = this.escapeHtml(sanitized[key] as string) as any;
      }
    }
    return sanitized;
  }
}
