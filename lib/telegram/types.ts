import type { TelegramChatType } from "@/types/domain";

export interface TelegramPhoneAuthChallengePayload {
  method?: "phone";
  session: string;
  phone: string;
  phoneCodeHash: string;
  resendAvailableAt?: string;
}

export interface TelegramQrAuthChallengePayload {
  method: "qr";
  session: string;
}

export type TelegramAuthChallengePayload =
  | TelegramPhoneAuthChallengePayload
  | TelegramQrAuthChallengePayload;

export interface TelegramIdentity {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
}

export interface TelegramRemoteChat {
  telegramPeerId: string;
  title: string;
  username: string | null;
  type: TelegramChatType;
  participantCount: number | null;
  canSendText: boolean;
  canSendPhoto: boolean;
  canSendVideo: boolean;
}

export interface TelegramMessageMetrics {
  views: number | null;
  reactions: number | null;
  replies: number | null;
}
