import { getPracticeDays, addPracticeDay } from "@/lib/store";
import { requireApprovedUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;

  return NextResponse.json(getPracticeDays(from, to));
}

export async function POST(request: NextRequest) {
  const user = requireApprovedUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { date, notes } = body as { date?: string; notes?: string };

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date is required in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const day = addPracticeDay(date, notes ?? "", user.username);
  return NextResponse.json(day, { status: 201 });
}
