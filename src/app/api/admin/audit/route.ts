import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAuditLogs } from "@/lib/store";

export async function GET(request: NextRequest) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const parsed = limitParam ? Number(limitParam) : 100;
  const limit = Number.isFinite(parsed) ? parsed : 100;

  return NextResponse.json(getAuditLogs(limit));
}
