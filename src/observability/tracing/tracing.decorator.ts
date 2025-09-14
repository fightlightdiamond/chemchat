import { SetMetadata, Logger } from '@nestjs/common';

export const TRACING_METADATA_KEY = 'tracing';

export interface TracingOptions {
  operationName?: string;
  attributes?: Record<string, string | number | boolean>;
  skipTracing?: boolean;
}

/**
 * Decorator to enable automatic tracing for methods
 */
export const Traced = (options: TracingOptions = {}) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const operationName = options.operationName || `${className}.${propertyName}`;
    const logger = new Logger(`${className}.${propertyName}`);

    descriptor.value = async function (...args: any[]) {
      if (options.skipTracing) {
        return originalMethod.apply(this, args);
      }

      const startTime = Date.now();
      const correlationId = this.correlationId || 'unknown';

      logger.debug(`Starting operation: ${operationName}`, {
        correlationId,
        component: className,
        operation: propertyName,
        argumentCount: args.length,
        ...options.attributes,
      });

      try {
        const result = await originalMethod.apply(this, args);

        const duration = Date.now() - startTime;
        logger.debug(`Operation completed: ${operationName} (${duration}ms)`, {
          correlationId,
          duration,
          resultType: result ? typeof result : 'void',
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Operation failed: ${operationName} (${duration}ms)`, {
          correlationId,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    };

    // Set metadata for the decorator
    SetMetadata(TRACING_METADATA_KEY, options)(target, propertyName, descriptor);
    return descriptor;
  };
};

/**
 * Class decorator to enable tracing for all methods in a class
 */
export const TracedClass = (options: TracingOptions = {}) => {
  return <T extends new (...args: any[]) => any>(constructor: T) => {
    const className = constructor.name;
    const logger = new Logger(className);
    
    // Get all method names
    const methodNames = Object.getOwnPropertyNames(constructor.prototype)
      .filter(name => name !== 'constructor' && typeof constructor.prototype[name] === 'function');

    // Apply tracing to each method
    methodNames.forEach(methodName => {
      const originalMethod = constructor.prototype[methodName];
      const operationName = options.operationName || `${className}.${methodName}`;

      constructor.prototype[methodName] = async function (...args: any[]) {
        if (options.skipTracing) {
          return originalMethod.apply(this, args);
        }

        const startTime = Date.now();
        const correlationId = this.correlationId || 'unknown';

        logger.debug(`Starting operation: ${operationName}`, {
          correlationId,
          component: className,
          operation: methodName,
          ...options.attributes,
        });

        try {
          const result = await originalMethod.apply(this, args);

          const duration = Date.now() - startTime;
          logger.debug(`Operation completed: ${operationName} (${duration}ms)`, {
            correlationId,
            duration,
          });

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error(`Operation failed: ${operationName} (${duration}ms)`, {
            correlationId,
            duration,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }
      };
    });

    return constructor;
  };
};
