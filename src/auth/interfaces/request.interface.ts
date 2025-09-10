import { DeviceFingerprint } from './token.interface';

export interface MfaCompleteRequest {
  mfaToken: string;
  mfaCode: string;
  deviceFingerprint: DeviceFingerprint;
}
