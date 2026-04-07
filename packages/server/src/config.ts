export interface AppConfig {
  port: number;
  host: string;
  databasePath: string;
  jwtSecret: string;
  dingtalk: {
    clientId: string;
    clientSecret: string;
    corpId: string;
    robotWebhook: string;
    robotSecret: string;
    conversationId: string;
  };
  baseUrl: string;
}

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export function getConfig(): AppConfig {
  return {
    port: parseInt(process.env.SERVER_PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    databasePath: process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'data', 'aireviews.db'),
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    dingtalk: {
      clientId: process.env.DINGTALK_CLIENT_ID || '',
      clientSecret: process.env.DINGTALK_CLIENT_SECRET || '',
      corpId: process.env.DINGTALK_CORP_ID || '',
      robotWebhook: process.env.DINGTALK_ROBOT_WEBHOOK || '',
      robotSecret: process.env.DINGTALK_ROBOT_SECRET || '',
      conversationId: process.env.DINGTALK_CONVERSATION_ID || '',
    },
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  };
}
