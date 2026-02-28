import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import {
  addMessage,
  addAttachment,
  updateAttachmentMessageId,
  channelExists,
  canAccessChannel,
  getUploadsDir,
} from "@/lib/store";
import { sendPushNotifications } from "@/lib/push";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export async function POST(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const channelId = formData.get("channel_id") as string | null;

    if (!file || !channelId) {
      return NextResponse.json(
        { error: "file and channel_id are required" },
        { status: 400 }
      );
    }

    if (!channelExists(channelId)) {
      return NextResponse.json({ error: "channel not found" }, { status: 404 });
    }

    if (!canAccessChannel(channelId, user.username, user.role)) {
      return NextResponse.json({ error: "access denied" }, { status: 403 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only images and videos are allowed" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File must be under 500 MB" },
        { status: 400 }
      );
    }

    // Save file to disk
    const ext = path.extname(file.name) || ".bin";
    const diskName = `${crypto.randomUUID()}${ext}`;
    const uploadsDir = getUploadsDir();
    const filePath = path.join(uploadsDir, diskName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Create attachment record with placeholder message_id (30-day expiry)
    const placeholderMsgId = "pending";
    const attachmentId = addAttachment(
      placeholderMsgId,
      file.name,
      file.type,
      file.size,
      diskName,
      30
    );

    // Create the message with attachment
    const msg = addMessage(
      "", // no text content for attachment-only messages
      channelId,
      user.username,
      attachmentId
    );

    // Update attachment with real message_id
    updateAttachmentMessageId(attachmentId, msg.id);

    // Push notification in background
    sendPushNotifications(user.username, channelId, "").catch(() => {});

    return NextResponse.json(msg, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
