import { NextRequest, NextResponse } from "next/server";
import { getAttachment, getUploadsDir } from "@/lib/store";
import { requireApprovedUser } from "@/lib/auth";
import fs from "node:fs";
import path from "node:path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const att = getAttachment(id);

  if (!att) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Check expiry
  if (new Date(att.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "attachment expired" },
      { status: 410 }
    );
  }

  const uploadsDir = getUploadsDir();
  const filePath = path.isAbsolute(att.path)
    ? att.path
    : path.join(uploadsDir, att.path);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new Response(buffer, {
    headers: {
      "Content-Type": att.mime_type,
      "Content-Length": String(att.size),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${att.filename}"`,
    },
  });
}
