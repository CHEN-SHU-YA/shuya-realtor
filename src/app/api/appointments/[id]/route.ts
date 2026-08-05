import { NextResponse } from "next/server";
import { updateAppointmentStatus, type AppointmentStatus } from "@/lib/appointment-store";

const STATUS: AppointmentStatus[] = ["confirmed", "completed", "cancelled"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "") as AppointmentStatus;
  if (!STATUS.includes(status)) {
    return NextResponse.json({ ok: false, error: "不支援的預約狀態。" }, { status: 400 });
  }

  const appointment = await updateAppointmentStatus(id, status);
  if (!appointment) {
    return NextResponse.json({ ok: false, error: "找不到這筆預約。" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, appointment });
}
