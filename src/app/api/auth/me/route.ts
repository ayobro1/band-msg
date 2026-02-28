import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) {
    return user;
  }
  return NextResponse.json(user);
}
