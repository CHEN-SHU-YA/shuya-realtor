import { NextResponse } from "next/server";
import {
  INTENT_KEYS,
  MEET_TYPE_KEYS,
  URGENCY_KEYS,
  formatSlotTaipei,
  isValidSlot
} from "@/lib/booking";
import {
  SlotConflictError,
  attachPreview,
  createAppointment
} from "@/lib/appointment-store";
import { gradeLead } from "@/lib/grading";
import { createEmailPreview } from "@/lib/appointment-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim();
    const meetType = String(body.meetType || "").trim();
    const urgency = String(body.urgency || "").trim();
    const note = String(body.note || "").trim();
    const slotIso = String(body.slotIso || "").trim();
    const intent = Array.isArray(body.intent) ? body.intent.map(String) : [];

    if (!name || name.length > 80) return bad("請填寫姓名。");
    if (!/^[0-9+() -]{8,20}$/.test(phone)) return bad("電話格式看起來不正確。");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) return bad("Email 格式看起來不正確。");
    if (!MEET_TYPE_KEYS.includes(meetType)) return bad("請選擇見面方式。");
    if (!intent.length || !intent.every((key: string) => INTENT_KEYS.includes(key))) return bad("請至少選擇一個需求。");
    if (!URGENCY_KEYS.includes(urgency)) return bad("請選擇預計處理時間。");
    if (!note || note.length > 2000) return bad("請填寫需求說明。");
    if (!isValidSlot(slotIso)) return bad("這個時段目前不能預約，請重新選擇。");

    const grade = gradeLead(intent, urgency, note);
    const appointment = await createAppointment({
      name,
      phone,
      email,
      meetType,
      urgency,
      intent,
      note,
      slotIso,
      aiHeat: grade.heat,
      aiSuggestion: grade.suggestion,
      aiSummary: grade.summary,
      aiNextAction: grade.nextAction
    });

    let previewFile: string | null = null;
    try {
      previewFile = await createEmailPreview(appointment);
      await attachPreview(appointment.id, previewFile);
    } catch (error) {
      console.error("[preview]", error);
    }

    return NextResponse.json({
      ok: true,
      id: appointment.id,
      slotLabel: formatSlotTaipei(appointment.slotIso),
      previewFile
    });
  } catch (error) {
    if (error instanceof SlotConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error("[create]", error);
    return NextResponse.json({ ok: false, error: "系統忙碌，請稍後重試。" }, { status: 500 });
  }
}
