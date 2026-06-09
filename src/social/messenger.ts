import { createLogger } from "../cli/logger"
import type { SocialMessage, MessagePriority } from "./types"
import { socialStore } from "./social-store"

const log = createLogger("social-messenger")

export class Messenger {
  sendMessage(params: {
    senderId: string
    recipientId: string
    subject: string
    body: string
    priority?: MessagePriority
    replyTo?: string
  }): SocialMessage {
    const msg = socialStore.createMessage({
      senderId: params.senderId,
      recipientId: params.recipientId,
      subject: params.subject,
      body: params.body,
      priority: params.priority || "normal",
      status: "pending",
      replyTo: params.replyTo || "",
      metadata: "{}",
    })

    log.info(`Message sent: ${msg.id.slice(0, 12)} → ${params.recipientId.slice(0, 12)}`)
    return msg
  }

  markDelivered(messageId: string): void {
    socialStore.updateMessageStatus(messageId, "delivered")
  }

  markRead(messageId: string): void {
    socialStore.updateMessageStatus(messageId, "read")
  }

  markFailed(messageId: string): void {
    socialStore.updateMessageStatus(messageId, "failed")
  }

  getPendingMessages(recipientId: string): SocialMessage[] {
    return socialStore.getPendingMessages(recipientId)
  }

  getConversation(peerId: string, limit = 50): SocialMessage[] {
    return socialStore.getMessagesForPeer(peerId, limit)
  }

  getUnreadCount(recipientId: string): number {
    return socialStore.getPendingMessages(recipientId).length
  }
}

export const messenger = new Messenger()
