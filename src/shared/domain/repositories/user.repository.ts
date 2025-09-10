import { User } from '../entities/user.entity';
import {
  BaseRepository,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface UserRepository extends BaseRepository<User> {
  /**
   * Find user by username
   */
  findByUsername(username: string): Promise<User | null>;

  /**
   * Find user by email
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Find users by partial username match
   */
  searchByUsername(query: string, limit?: number): Promise<User[]>;

  /**
   * Find users created after a specific date
   */
  findRecentUsers(
    since: Date,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<User>>;

  /**
   * Find users with MFA enabled
   */
  findUsersWithMFA(options?: PaginationOptions): Promise<PaginatedResult<User>>;

  /**
   * Check if username is available
   */
  isUsernameAvailable(username: string): Promise<boolean>;

  /**
   * Check if email is available
   */
  isEmailAvailable(email: string): Promise<boolean>;

  /**
   * Update user's last login timestamp
   */
  updateLastLogin(userId: string): Promise<void>;

  /**
   * Get user statistics
   */
  getUserStats(): Promise<UserStats>;

  /**
   * Find users by multiple usernames
   */
  findByUsernames(usernames: string[]): Promise<User[]>;

  /**
   * Find users by multiple emails
   */
  findByEmails(emails: string[]): Promise<User[]>;

  /**
   * Update user's password
   */
  updatePassword(userId: string, newPasswordHash: string): Promise<void>;

  /**
   * Enable MFA for user
   */
  enableMfa(userId: string, secret: string): Promise<void>;

  /**
   * Disable MFA for user
   */
  disableMfa(userId: string): Promise<void>;
}

export interface UserStats {
  totalUsers: number;
  usersWithMFA: number;
  recentUsers: number; // users created in last 30 days
  activeUsers: number; // users logged in within last 30 days
}
