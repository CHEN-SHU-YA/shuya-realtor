import { NextResponse } from "next/server";
import { resetDemoAppointments } from "@/lib/appointment-store";

export async function POST() {
  try {
    await resetDemoAppointments();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reset]", error);
    return NextResponse.json({ ok: false, error: "重設示範資料失敗。" }, { status: 500 });
  }
}
