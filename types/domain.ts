export type TelegramConnectionStatus =
  | "connected"
  | "disconnected"
  | "session_expired"
  | "authorization_required"
  | "temporarily_unavailable";

export type TelegramAuthState = "idle" | "code_required" | "password_required" | "connected";
export type TelegramChatType = "group" | "supergroup" | "channel";
export type MessageKind = "text" | "photo" | "video";
export type CampaignMode = "compose" | "forward";
export type CampaignStatus =
  | "draft"
  | "queued"
  | "sending"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "flood_wait";

export type DeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "flood_wait"
  | "unauthorized"
  | "permission_denied"
  | "cancelled";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  sessionVersion: number;
}

export interface TelegramAccount {
  id: string;
  telegramUserId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  status: TelegramConnectionStatus;
  statusDetail: string | null;
  lastSyncAt: string | null;
  lastConnectedAt: string | null;
}

export interface TelegramChat {
  id: string;
  telegramPeerId: string;
  title: string;
  username: string | null;
  type: TelegramChatType;
  participantCount: number | null;
  canSendText: boolean;
  canSendPhoto: boolean;
  canSendVideo: boolean;
  active: boolean;
  lastSyncedAt: string | null;
}

export interface CampaignSummary {
  id: string;
  mode: CampaignMode;
  kind: MessageKind;
  body: string;
  sourceMessageLink: string | null;
  sourceMessageId: string | null;
  sourceChatTitle: string | null;
  status: CampaignStatus;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  created: string;
  finishedAt: string | null;
}

export interface Delivery {
  id: string;
  campaignId: string;
  chatTitle: string;
  chatType: TelegramChatType;
  status: DeliveryStatus;
  telegramMessageId: string | null;
  telegramMessageLink: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  views: number | null;
  reactions: number | null;
  replies: number | null;
}

export interface RecentMessageLink {
  id: string;
  campaignId: string;
  chatTitle: string;
  telegramMessageLink: string;
  sentAt: string | null;
}

export interface Activity {
  id: string;
  campaignId: string | null;
  type: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
  created: string;
}

export interface DashboardData {
  account: TelegramAccount | null;
  campaigns: CampaignSummary[];
  activities: Activity[];
  recentMessageLinks: RecentMessageLink[];
  totals: {
    campaigns: number;
    sent: number;
    failed: number;
    pending: number;
  };
}
