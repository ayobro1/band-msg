import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPendingUsers } from "@/lib/store";

export async function GET(request: NextRequest) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  return NextResponse.json(getPendingUsers());
}
