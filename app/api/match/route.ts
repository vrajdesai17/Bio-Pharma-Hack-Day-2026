import { NextRequest, NextResponse } from "next/server";
import { extractProfile } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const condition = body?.condition;
  const profileText = body?.profileText;

  if (typeof condition !== "string" || typeof profileText !== "string" || !condition.trim() || !profileText.trim()) {
    return NextResponse.json({ error: "condition and profileText are required" }, { status: 400 });
  }

  try {
    const { profile, stubbed } = await extractProfile(profileText);
    return NextResponse.json({ condition, profile, stubbed });
  } catch (err) {
    console.error("extractProfile failed:", err);
    return NextResponse.json({ error: "Failed to extract profile" }, { status: 502 });
  }
}
