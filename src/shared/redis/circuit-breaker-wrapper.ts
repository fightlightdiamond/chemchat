import CircuitBreaker from 'opossum';

type Operation<T> = (client: any) => Promise<T>;

type CircuitBreakerEvent = 'open' | 'halfOpen' | 'close';

/**
 * A type-safe wrapper around the opossum CircuitBreaker
 */
export class SafeCircuitBreaker<T> {
  private breaker: CircuitBreaker<[Operation<T>], T>;

  constructor(
    private readonly action: (operation: Operation<T>) => Promise<T>,
    private readonly options: CircuitBreaker.Options,
  ) {
    // Create the circuit breaker with proper typing
    this.breaker = new CircuitBreaker(async (operation: Operation<T>) => {
      return this.action(operation);
    }, this.options) as unknown as CircuitBreaker<[Operation<T>], T>;
  }

  async fire(operation: Operation<T>): Promise<T> {
    const result = await this.breaker.fire(operation);
    // Ensure type safety by asserting the result type
    return result as T;
  }

  on(event: CircuitBreakerEvent, listener: () => void): this {
    this.breaker.on(event, listener);
    return this;
  }

  // Add any other CircuitBreaker methods you need to expose
  isOpen(): boolean {
    // Safe type assertion since we know the internal structure of CircuitBreaker
    const breaker = this.breaker as unknown as { opened: boolean };
    return breaker.opened;
  }

  isClosed(): boolean {
    return !this.isOpen();
  }
}

export default SafeCircuitBreaker;
