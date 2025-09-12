declare module 'opossum' {
  interface Options {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
  }

  type EventCallback = () => void;
  type Operation<T extends unknown[], R> = (...args: T) => Promise<R>;

  interface CircuitBreaker<T extends unknown[], R> {
    fire(...args: T): Promise<R>;
    on(event: 'open' | 'halfOpen' | 'close', listener: EventCallback): this;
  }

  // Export the CircuitBreaker as a callable/constructable type
  interface CircuitBreakerConstructor {
    new <T extends unknown[], R>(
      action: Operation<T, R>,
      options?: Options,
    ): CircuitBreaker<T, R>;
  }

  const CircuitBreaker: CircuitBreakerConstructor;
  export = CircuitBreaker;
  export { Options };
}
