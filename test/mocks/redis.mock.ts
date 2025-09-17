import { jest } from '@jest/globals';

export class MockRedisService {
  private store = new Map<string, any>();
  private pubsubChannels = new Map<string, Set<Function>>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.store.set(key, value);
    if (ttl) {
      setTimeout(() => this.store.delete(key), ttl * 1000);
    }
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0', 10);
    const newValue = current + 1;
    this.store.set(key, newValue.toString());
    return newValue;
  }

  async expire(key: string, ttl: number): Promise<number> {
    if (this.store.has(key)) {
      setTimeout(() => this.store.delete(key), ttl * 1000);
      return 1;
    }
    return 0;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.store.get(key) as Map<string, string>;
    return hash?.get(field) || null;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    let hash = this.store.get(key) as Map<string, string>;
    if (!hash) {
      hash = new Map();
      this.store.set(key, hash);
    }
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  async hdel(key: string, field: string): Promise<number> {
    const hash = this.store.get(key) as Map<string, string>;
    if (hash?.has(field)) {
      hash.delete(field);
      return 1;
    }
    return 0;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.store.get(key) as Set<string>;
    if (!set) {
      set = new Set();
      this.store.set(key, set);
    }
    let added = 0;
    members.forEach(member => {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    });
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.store.get(key) as Set<string>;
    if (!set) return 0;
    
    let removed = 0;
    members.forEach(member => {
      if (set.has(member)) {
        set.delete(member);
        removed++;
      }
    });
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.store.get(key) as Set<string>;
    return set ? Array.from(set) : [];
  }

  async publish(channel: string, message: string): Promise<number> {
    const subscribers = this.pubsubChannels.get(channel);
    if (subscribers) {
      subscribers.forEach(callback => callback(message));
      return subscribers.size;
    }
    return 0;
  }

  async subscribe(channel: string, callback: Function): Promise<void> {
    let subscribers = this.pubsubChannels.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      this.pubsubChannels.set(channel, subscribers);
    }
    subscribers.add(callback);
  }

  async unsubscribe(channel: string, callback?: Function): Promise<void> {
    const subscribers = this.pubsubChannels.get(channel);
    if (subscribers) {
      if (callback) {
        subscribers.delete(callback);
      } else {
        subscribers.clear();
      }
    }
  }

  async flushall(): Promise<void> {
    this.store.clear();
    this.pubsubChannels.clear();
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  // Circuit breaker mock
  async exec<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
}

export const createMockRedisService = () => new MockRedisService();
