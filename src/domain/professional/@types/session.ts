export interface ISessionProps {
  userId: string;
  token: string;
  ip?: string;
  device?: string;
  latitude?: string;
  longitude?: string;
  isActive: boolean;
  createdAt: Date;
  lastSeenAt?: Date;
}
