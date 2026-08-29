/// <reference path="../pb_data/types.d.ts" />

const lockedRules = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

function timestamps() {
  return [
    { name: "created", type: "autodate", onCreate: true },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
}

function relation(name, collectionId, required = true, cascadeDelete = true) {
  return {
    name,
    type: "relation",
    collectionId,
    maxSelect: 1,
    required,
    cascadeDelete,
  };
}

function createBase(app, config) {
  const collection = new Collection({
    type: "base",
    ...lockedRules,
    ...config,
    fields: [...config.fields, ...timestamps()],
  });
  app.save(collection);
  return collection;
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.listRule = null;
  users.viewRule = null;
  users.createRule = null;
  users.updateRule = null;
  users.deleteRule = null;
  users.passwordAuth.enabled = false;
  users.fields.add(
    new TextField({ name: "google_subject", required: true, max: 255, hidden: true }),
    new URLField({ name: "avatar_url" }),
    new NumberField({ name: "session_version", onlyInt: true, min: 1 }),
    new DateField({ name: "last_login_at" }),
  );
  users.addIndex("idx_users_google_subject", true, "google_subject", "");
  app.save(users);

  const accounts = createBase(app, {
    name: "telegram_accounts",
    fields: [
      relation("user", users.id),
      { name: "telegram_user_id", type: "text", required: true, max: 32 },
      { name: "username", type: "text", max: 64 },
      { name: "first_name", type: "text", max: 128 },
      { name: "last_name", type: "text", max: 128 },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["connected", "disconnected", "session_expired", "authorization_required", "temporarily_unavailable"],
      },
      { name: "status_detail", type: "text", max: 500 },
      { name: "last_sync_at", type: "date" },
      { name: "last_connected_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_telegram_accounts_user ON telegram_accounts (user)",
      "CREATE UNIQUE INDEX idx_telegram_accounts_tg_user ON telegram_accounts (telegram_user_id)",
    ],
  });

  const sessions = createBase(app, {
    name: "telegram_sessions",
    fields: [
      relation("user", users.id),
      relation("account", accounts.id),
      { name: "ciphertext", type: "text", required: true, max: 12000, hidden: true },
      { name: "iv", type: "text", required: true, max: 64, hidden: true },
      { name: "auth_tag", type: "text", required: true, max: 64, hidden: true },
      { name: "key_version", type: "number", required: true, onlyInt: true, min: 1 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_telegram_sessions_user ON telegram_sessions (user)",
      "CREATE UNIQUE INDEX idx_telegram_sessions_account ON telegram_sessions (account)",
    ],
  });

  const challenges = createBase(app, {
    name: "telegram_auth_challenges",
    fields: [
      relation("user", users.id),
      {
        name: "state",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["code_required", "password_required"],
      },
      { name: "ciphertext", type: "text", required: true, max: 16000, hidden: true },
      { name: "iv", type: "text", required: true, max: 64, hidden: true },
      { name: "auth_tag", type: "text", required: true, max: 64, hidden: true },
      { name: "key_version", type: "number", required: true, onlyInt: true, min: 1 },
      { name: "attempts", type: "number", onlyInt: true, min: 0, max: 10 },
      { name: "expires_at", type: "date", required: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_telegram_auth_challenges_user ON telegram_auth_challenges (user)"],
  });

  const chats = createBase(app, {
    name: "telegram_chats",
    fields: [
      relation("user", users.id),
      relation("account", accounts.id),
      { name: "telegram_peer_id", type: "text", required: true, max: 32 },
      { name: "peer_data", type: "text", max: 4000, hidden: true },
      { name: "title", type: "text", required: true, max: 255, presentable: true },
      { name: "username", type: "text", max: 64 },
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["group", "supergroup", "channel"] },
      { name: "participant_count", type: "number", onlyInt: true, min: 0 },
      { name: "can_send_text", type: "bool" },
      { name: "can_send_photo", type: "bool" },
      { name: "can_send_video", type: "bool" },
      { name: "active", type: "bool" },
      { name: "last_synced_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_telegram_chats_peer ON telegram_chats (account, telegram_peer_id)",
      "CREATE INDEX idx_telegram_chats_user_active ON telegram_chats (user, active)",
    ],
  });

  const campaigns = createBase(app, {
    name: "campaigns",
    fields: [
      relation("user", users.id),
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["text", "photo", "video"] },
      { name: "body", type: "text", max: 4096 },
      {
        name: "media",
        type: "file",
        maxSelect: 1,
        maxSize: 52428800,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"],
        protected: true,
      },
      { name: "media_mime", type: "text", max: 100 },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["draft", "queued", "sending", "completed", "partial", "failed", "cancelled", "flood_wait"],
      },
      { name: "idempotency_key", type: "text", required: true, max: 64 },
      { name: "total_count", type: "number", onlyInt: true, min: 0 },
      { name: "sent_count", type: "number", onlyInt: true, min: 0 },
      { name: "failed_count", type: "number", onlyInt: true, min: 0 },
      { name: "pending_count", type: "number", onlyInt: true, min: 0 },
      { name: "started_at", type: "date" },
      { name: "finished_at", type: "date" },
      { name: "last_error", type: "text", max: 500 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_campaigns_idempotency ON campaigns (user, idempotency_key)",
      "CREATE INDEX idx_campaigns_user_created ON campaigns (user, created)",
    ],
  });

  const deliveries = createBase(app, {
    name: "campaign_deliveries",
    fields: [
      relation("user", users.id),
      relation("campaign", campaigns.id),
      relation("chat", chats.id, false, false),
      { name: "telegram_peer_id", type: "text", required: true, max: 32 },
      { name: "chat_title", type: "text", required: true, max: 255 },
      { name: "chat_type", type: "select", required: true, maxSelect: 1, values: ["group", "supergroup", "channel"] },
      { name: "telegram_random_id", type: "text", required: true, max: 32 },
      { name: "telegram_message_id", type: "text", max: 32 },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["queued", "sending", "sent", "failed", "flood_wait", "unauthorized", "permission_denied", "cancelled"],
      },
      { name: "error_code", type: "text", max: 100 },
      { name: "error_message", type: "text", max: 500 },
      { name: "not_before", type: "date" },
      { name: "sent_at", type: "date" },
      { name: "views", type: "number", onlyInt: true, min: 0 },
      { name: "views_supported", type: "bool" },
      { name: "reactions", type: "number", onlyInt: true, min: 0 },
      { name: "reactions_supported", type: "bool" },
      { name: "replies", type: "number", onlyInt: true, min: 0 },
      { name: "replies_supported", type: "bool" },
      { name: "analytics_updated_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_campaign_deliveries_chat ON campaign_deliveries (campaign, telegram_peer_id)",
      "CREATE INDEX idx_campaign_deliveries_status ON campaign_deliveries (campaign, status)",
    ],
  });

  const jobs = createBase(app, {
    name: "telegram_jobs",
    fields: [
      relation("user", users.id),
      relation("account", accounts.id, false, true),
      relation("campaign", campaigns.id, false, true),
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["sync_chats", "send_campaign", "refresh_analytics", "disconnect"] },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["queued", "running", "waiting", "completed", "failed"] },
      { name: "idempotency_key", type: "text", required: true, max: 100 },
      { name: "not_before", type: "date" },
      { name: "lease_owner", type: "text", max: 100 },
      { name: "lease_expires_at", type: "date" },
      { name: "attempts", type: "number", onlyInt: true, min: 0, max: 20 },
      { name: "safe_error", type: "text", max: 500 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_telegram_jobs_idempotency ON telegram_jobs (idempotency_key)",
      "CREATE INDEX idx_telegram_jobs_queue ON telegram_jobs (status, not_before, created)",
    ],
  });

  createBase(app, {
    name: "activities",
    fields: [
      relation("user", users.id),
      relation("campaign", campaigns.id, false, true),
      relation("delivery", deliveries.id, false, true),
      { name: "type", type: "text", required: true, max: 100 },
      { name: "message", type: "text", required: true, max: 500 },
      { name: "tone", type: "select", required: true, maxSelect: 1, values: ["info", "success", "warning", "danger"] },
    ],
    indexes: ["CREATE INDEX idx_activities_user_created ON activities (user, created)"],
  });

  // Keep references alive for the migration validator.
  void sessions;
  void challenges;
  void jobs;
}, (app) => {
  [
    "activities",
    "telegram_jobs",
    "campaign_deliveries",
    "campaigns",
    "telegram_chats",
    "telegram_auth_challenges",
    "telegram_sessions",
    "telegram_accounts",
  ].forEach((name) => {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch {
      // Collection may already be absent during a partial local rollback.
    }
  });

  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("google_subject");
  users.fields.removeByName("avatar_url");
  users.fields.removeByName("session_version");
  users.fields.removeByName("last_login_at");
  users.removeIndex("idx_users_google_subject");
  users.passwordAuth.enabled = true;
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = "";
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = "id = @request.auth.id";
  app.save(users);
});
