import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getApprovedUsers } from "@/lib/store";

export async function GET(request: NextRequest) {
  const admin = requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const users = getApprovedUsers();
  return NextResponse.json(users);
}
