export type UserRole = 'member' | 'supervisor';

export interface User {
  id: string;
  name: string;
  avatarUrl: string | null;
  dingtalkUserId: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface UserInfo {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
}
