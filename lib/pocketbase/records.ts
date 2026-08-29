import type { RecordModel } from "pocketbase";

import type {
  CampaignStatus,
  DeliveryStatus,
  MessageKind,
  TelegramChatType,
  TelegramConnectionStatus,
} from "@/types/domain";

export interface UserRecord extends RecordModel {
  email: string;
  verified: boolean;
  name: string;
  google_subject: string;
  avatar_url: string;
  session_version: number;
}

export interface TelegramAccountRecord extends RecordModel {
  user: string;
  telegram_user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  status: TelegramConnectionStatus;
  status_detail: string;
  last_sync_at: string;
  last_connected_at: string;
}

export interface TelegramSessionRecord extends RecordModel {
  user: string;
  account: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version: number;
}

export interface TelegramChallengeRecord extends RecordModel {
  user: string;
  state: "code_required" | "password_required";
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version: number;
  attempts: number;
  expires_at: string;
}

export interface TelegramChatRecord extends RecordModel {
  user: string;
  account: string;
  telegram_peer_id: string;
  peer_data: string;
  title: string;
  username: string;
  type: TelegramChatType;
  participant_count: number;
  can_send_text: boolean;
  can_send_photo: boolean;
  can_send_video: boolean;
  active: boolean;
  last_synced_at: string;
}

export interface CampaignRecord extends RecordModel {
  user: string;
  kind: MessageKind;
  body: string;
  media: string;
  media_mime: string;
  source_message_link: string;
  source_message_id: string;
  source_chat_title: string;
  status: CampaignStatus;
  idempotency_key: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  started_at: string;
  finished_at: string;
  last_error: string;
}

export interface DeliveryRecord extends RecordModel {
  user: string;
  campaign: string;
  chat: string;
  telegram_peer_id: string;
  chat_title: string;
  chat_type: TelegramChatType;
  telegram_random_id: string;
  telegram_message_id: string;
  telegram_message_link: string;
  status: DeliveryStatus;
  error_code: string;
  error_message: string;
  not_before: string;
  sent_at: string;
  views: number;
  views_supported: boolean;
  reactions: number;
  reactions_supported: boolean;
  replies: number;
  replies_supported: boolean;
  analytics_updated_at: string;
}

export interface TelegramJobRecord extends RecordModel {
  user: string;
  account: string;
  campaign: string;
  type: "sync_chats" | "send_campaign" | "refresh_analytics" | "disconnect";
  status: "queued" | "running" | "waiting" | "completed" | "failed";
  idempotency_key: string;
  not_before: string;
  lease_owner: string;
  lease_expires_at: string;
  attempts: number;
  safe_error: string;
}

export interface ActivityRecord extends RecordModel {
  user: string;
  campaign: string;
  delivery: string;
  type: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
}
