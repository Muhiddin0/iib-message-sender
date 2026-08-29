export interface TelegramChatPermissionSource {
  chatType: string;
  isCreator: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  isMember: boolean;
  adminRights: { postMessages?: boolean } | null;
  permissions: {
    canSendText: boolean;
    canSendPhotos: boolean;
    canSendVideos: boolean;
  } | null;
  defaultPermissions: {
    canSendText: boolean;
    canSendPhotos: boolean;
    canSendVideos: boolean;
  } | null;
}

export function telegramChatPermissions(peer: TelegramChatPermissionSource) {
  if (peer.isBanned || !peer.isMember) return { text: false, photo: false, video: false };
  if (peer.chatType === "channel") {
    const canPost = peer.isCreator || Boolean(peer.adminRights?.postMessages);
    return { text: canPost, photo: canPost, video: canPost };
  }
  if (peer.chatType === "gigagroup") {
    const canPost = peer.isCreator || peer.isAdmin;
    return { text: canPost, photo: canPost, video: canPost };
  }
  if (peer.isCreator || peer.isAdmin) return { text: true, photo: true, video: true };
  const rules = peer.permissions ?? peer.defaultPermissions;
  return {
    text: rules?.canSendText ?? true,
    photo: rules?.canSendPhotos ?? true,
    video: rules?.canSendVideos ?? true,
  };
}

