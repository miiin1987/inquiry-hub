export type InquirySource = "gmail" | "line";

export type InquiryCategory =
  | "売買"
  | "賃貸"
  | "修繕依頼"
  | "クレーム"
  | "その他";

export type InquiryStatus =
  | "pending"
  | "classified"
  | "notified"
  | "failed";

export type NotificationChannel = "slack" | "line";

export type NotificationStatus = "pending" | "sent" | "failed";

export interface Inquiry {
  id: string;
  source: InquirySource;
  external_id: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_line_id: string | null;
  subject: string | null;
  content: string;
  category: InquiryCategory | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  status: InquiryStatus;
  received_at: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  inquiry_id: string;
  channel: NotificationChannel;
  destination: string;
  status: NotificationStatus;
  retry_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GmailSyncState {
  id: string;
  last_history_id: string | null;
  last_synced_at: string;
}

export interface ClassifyResult {
  category: InquiryCategory;
  confidence: number;
  reasoning: string;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
