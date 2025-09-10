export class User {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly displayName: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly tenantId: string,
    public readonly isActive: boolean = true,
    public readonly mfaEnabled: boolean = false,
    public readonly mfaSecret?: string,
    public readonly lastLoginAt?: Date,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
  ) {
    this.validateUser();
  }

  private validateUser(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error('User ID is required');
    }

    if (
      !this.username ||
      this.username.length < 3 ||
      this.username.length > 50
    ) {
      throw new Error('Username must be between 3 and 50 characters');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(this.username)) {
      throw new Error(
        'Username can only contain letters, numbers, underscores, and hyphens',
      );
    }

    if (
      !this.displayName ||
      this.displayName.length < 1 ||
      this.displayName.length > 100
    ) {
      throw new Error('Display name must be between 1 and 100 characters');
    }

    if (!this.email || !this.isValidEmail(this.email)) {
      throw new Error('Valid email is required');
    }

    if (!this.passwordHash || this.passwordHash.length === 0) {
      throw new Error('Password hash is required');
    }

    if (this.mfaEnabled && (!this.mfaSecret || this.mfaSecret.length === 0)) {
      throw new Error('MFA secret is required when MFA is enabled');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
  }

  public enableMFA(secret: string): User {
    if (!secret || secret.length === 0) {
      throw new Error('MFA secret is required');
    }

    return new User(
      this.id,
      this.username,
      this.displayName,
      this.email,
      this.passwordHash,
      this.tenantId,
      this.isActive,
      true,
      secret,
      this.lastLoginAt,
      this.createdAt,
      new Date(),
    );
  }

  public disableMFA(): User {
    return new User(
      this.id,
      this.username,
      this.displayName,
      this.email,
      this.passwordHash,
      this.tenantId,
      this.isActive,
      false,
      undefined,
      this.lastLoginAt,
      this.createdAt,
      new Date(),
    );
  }

  public updateDisplayName(newDisplayName: string): User {
    if (
      !newDisplayName ||
      newDisplayName.length < 1 ||
      newDisplayName.length > 100
    ) {
      throw new Error('Display name must be between 1 and 100 characters');
    }

    return new User(
      this.id,
      this.username,
      newDisplayName,
      this.email,
      this.passwordHash,
      this.tenantId,
      this.isActive,
      this.mfaEnabled,
      this.mfaSecret,
      this.lastLoginAt,
      this.createdAt,
      new Date(),
    );
  }

  public updatePassword(newPasswordHash: string): User {
    if (!newPasswordHash || newPasswordHash.length === 0) {
      throw new Error('Password hash is required');
    }

    return new User(
      this.id,
      this.username,
      this.displayName,
      this.email,
      newPasswordHash,
      this.tenantId,
      this.isActive,
      this.mfaEnabled,
      this.mfaSecret,
      this.lastLoginAt,
      this.createdAt,
      new Date(),
    );
  }

  public updateEmail(newEmail: string): User {
    if (!newEmail || !this.isValidEmail(newEmail)) {
      throw new Error('Valid email is required');
    }

    return new User(
      this.id,
      this.username,
      this.displayName,
      newEmail,
      this.passwordHash,
      this.tenantId,
      this.isActive,
      this.mfaEnabled,
      this.mfaSecret,
      this.lastLoginAt,
      this.createdAt,
      new Date(),
    );
  }

  public isPasswordValid(hashedPassword: string): boolean {
    return this.passwordHash === hashedPassword;
  }

  public getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  public isRecentlyCreated(thresholdMs: number = 24 * 60 * 60 * 1000): boolean {
    return this.getAge() < thresholdMs;
  }

  public getSecurityLevel(): 'basic' | 'enhanced' {
    return this.mfaEnabled ? 'enhanced' : 'basic';
  }

  public toJSON() {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      email: this.email,
      mfaEnabled: this.mfaEnabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      securityLevel: this.getSecurityLevel(),
      isRecentlyCreated: this.isRecentlyCreated(),
    };
  }
}
