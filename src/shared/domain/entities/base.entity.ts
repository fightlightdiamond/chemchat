export abstract class BaseEntity {
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(createdAt?: Date, updatedAt?: Date) {
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  /**
   * Check if this entity was created after the given date
   */
  public isCreatedAfter(date: Date): boolean {
    return this.createdAt > date;
  }

  /**
   * Check if this entity was updated after the given date
   */
  public isUpdatedAfter(date: Date): boolean {
    return this.updatedAt > date;
  }

  /**
   * Get the age of this entity in milliseconds
   */
  public getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  /**
   * Check if this entity was modified (updated after creation)
   */
  public isModified(): boolean {
    return this.updatedAt.getTime() !== this.createdAt.getTime();
  }

  /**
   * Get time since last update in milliseconds
   */
  public getTimeSinceLastUpdate(): number {
    return Date.now() - this.updatedAt.getTime();
  }

  /**
   * Abstract method that must be implemented by concrete entities
   * to provide JSON serialization
   */
  public abstract toJSON(): Record<string, any>;

  /**
   * Abstract method for entity validation
   * Should be called in constructor of concrete entities
   */
  protected abstract validate(): void;

  /**
   * Helper method to validate required string fields
   */
  protected validateRequiredString(
    value: string | null | undefined,
    fieldName: string,
    minLength: number = 1,
    maxLength?: number,
  ): void {
    if (!value || value.trim().length === 0) {
      throw new Error(`${fieldName} is required`);
    }

    if (value.trim().length < minLength) {
      throw new Error(
        `${fieldName} must be at least ${minLength} characters long`,
      );
    }

    if (maxLength && value.length > maxLength) {
      throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
    }
  }

  /**
   * Helper method to validate UUIDs
   */
  protected validateUUID(
    value: string | null | undefined,
    fieldName: string,
  ): void {
    if (!value) {
      throw new Error(`${fieldName} is required`);
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new Error(`${fieldName} must be a valid UUID`);
    }
  }

  /**
   * Helper method to validate dates
   */
  protected validateDate(
    date: Date | null | undefined,
    fieldName: string,
    required: boolean = true,
  ): void {
    if (required && !date) {
      throw new Error(`${fieldName} is required`);
    }

    if (date && (isNaN(date.getTime()) || date.getTime() < 0)) {
      throw new Error(`${fieldName} must be a valid date`);
    }
  }

  /**
   * Helper method to validate that a date is not in the future
   */
  protected validateDateNotFuture(date: Date, fieldName: string): void {
    if (date > new Date()) {
      throw new Error(`${fieldName} cannot be in the future`);
    }
  }

  /**
   * Helper method to validate that one date is after another
   */
  protected validateDateOrder(
    earlierDate: Date,
    laterDate: Date,
    earlierFieldName: string,
    laterFieldName: string,
  ): void {
    if (laterDate <= earlierDate) {
      throw new Error(`${laterFieldName} must be after ${earlierFieldName}`);
    }
  }
}
