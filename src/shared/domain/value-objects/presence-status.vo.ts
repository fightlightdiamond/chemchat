export enum PresenceStatusType {
  ONLINE = 'online',
  OFFLINE = 'offline',
  AWAY = 'away',
  BUSY = 'busy',
}

export interface DeviceInfo {
  deviceId: string;
  deviceType: 'web' | 'mobile' | 'desktop';
  userAgent?: string;
  lastSeen: Date;
}

export class PresenceStatus {
  constructor(
    public readonly status: PresenceStatusType,
    public readonly lastSeen: Date,
    public readonly devices: DeviceInfo[] = [],
    public readonly customMessage?: string,
  ) {
    this.validatePresenceStatus();
  }

  private validatePresenceStatus(): void {
    if (!Object.values(PresenceStatusType).includes(this.status)) {
      throw new Error('Invalid presence status type');
    }

    if (!this.lastSeen || !(this.lastSeen instanceof Date)) {
      throw new Error('Last seen date is required');
    }

    if (this.lastSeen > new Date()) {
      throw new Error('Last seen date cannot be in the future');
    }

    if (this.devices && !Array.isArray(this.devices)) {
      throw new Error('Devices must be an array');
    }

    if (this.devices.length > 10) {
      throw new Error('Maximum 10 devices allowed per user');
    }

    this.devices.forEach((device, index) => {
      this.validateDevice(device, index);
    });

    if (this.customMessage && this.customMessage.length > 100) {
      throw new Error('Custom status message must not exceed 100 characters');
    }
  }

  private validateDevice(device: DeviceInfo, index: number): void {
    if (!device || typeof device !== 'object') {
      throw new Error(`Device at index ${index} must be an object`);
    }

    if (!device.deviceId || typeof device.deviceId !== 'string') {
      throw new Error(`Device at index ${index} must have a valid device ID`);
    }

    if (!['web', 'mobile', 'desktop'].includes(device.deviceType)) {
      throw new Error(`Device at index ${index} must have a valid device type`);
    }

    if (!device.lastSeen || !(device.lastSeen instanceof Date)) {
      throw new Error(
        `Device at index ${index} must have a valid last seen date`,
      );
    }

    if (device.lastSeen > new Date()) {
      throw new Error(
        `Device at index ${index} last seen date cannot be in the future`,
      );
    }

    if (device.userAgent && typeof device.userAgent !== 'string') {
      throw new Error(`Device at index ${index} user agent must be a string`);
    }
  }

  public isOnline(): boolean {
    return this.status === PresenceStatusType.ONLINE;
  }

  public isOffline(): boolean {
    return this.status === PresenceStatusType.OFFLINE;
  }

  public isAway(): boolean {
    return this.status === PresenceStatusType.AWAY;
  }

  public isBusy(): boolean {
    return this.status === PresenceStatusType.BUSY;
  }

  public isAvailable(): boolean {
    return this.isOnline() && !this.isBusy();
  }

  public getActiveDevices(timeoutMinutes: number = 5): DeviceInfo[] {
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    return this.devices.filter((device) => device.lastSeen > cutoffTime);
  }

  public hasActiveDevices(timeoutMinutes: number = 5): boolean {
    return this.getActiveDevices(timeoutMinutes).length > 0;
  }

  public getDeviceById(deviceId: string): DeviceInfo | undefined {
    return this.devices.find((device) => device.deviceId === deviceId);
  }

  public withUpdatedStatus(
    newStatus: PresenceStatusType,
    lastSeen: Date = new Date(),
  ): PresenceStatus {
    return new PresenceStatus(
      newStatus,
      lastSeen,
      this.devices,
      this.customMessage,
    );
  }

  public withCustomMessage(message: string): PresenceStatus {
    if (message && message.length > 100) {
      throw new Error('Custom status message must not exceed 100 characters');
    }

    return new PresenceStatus(
      this.status,
      this.lastSeen,
      this.devices,
      message || undefined,
    );
  }

  public withUpdatedDevice(deviceInfo: DeviceInfo): PresenceStatus {
    const existingDeviceIndex = this.devices.findIndex(
      (d) => d.deviceId === deviceInfo.deviceId,
    );
    let updatedDevices: DeviceInfo[];

    if (existingDeviceIndex >= 0) {
      // Update existing device
      updatedDevices = [...this.devices];
      updatedDevices[existingDeviceIndex] = deviceInfo;
    } else {
      // Add new device
      if (this.devices.length >= 10) {
        throw new Error('Maximum 10 devices allowed per user');
      }
      updatedDevices = [...this.devices, deviceInfo];
    }

    return new PresenceStatus(
      this.status,
      this.lastSeen,
      updatedDevices,
      this.customMessage,
    );
  }

  public withRemovedDevice(deviceId: string): PresenceStatus {
    const updatedDevices = this.devices.filter(
      (device) => device.deviceId !== deviceId,
    );

    return new PresenceStatus(
      this.status,
      this.lastSeen,
      updatedDevices,
      this.customMessage,
    );
  }

  public getLastSeenText(): string {
    const now = new Date();
    const diffMs = now.getTime() - this.lastSeen.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (this.isOnline() && this.hasActiveDevices()) {
      return 'Online now';
    }

    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return this.lastSeen.toLocaleDateString();
    }
  }

  public toJSON() {
    return {
      status: this.status,
      lastSeen: this.lastSeen,
      devices: this.devices.map((device) => ({
        deviceId: device.deviceId,
        deviceType: device.deviceType,
        userAgent: device.userAgent,
        lastSeen: device.lastSeen,
      })),
      customMessage: this.customMessage,
      isOnline: this.isOnline(),
      isAvailable: this.isAvailable(),
      hasActiveDevices: this.hasActiveDevices(),
      lastSeenText: this.getLastSeenText(),
    };
  }

  public equals(other: PresenceStatus): boolean {
    return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
  }
}
