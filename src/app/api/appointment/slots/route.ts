import { NextResponse } from "next/server";
import { bookedSlots } from "@/lib/appointment-store";
import { generateOpenSlots } from "@/lib/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const booked = await bookedSlots();
    return NextResponse.json({ ok: true, days: generateOpenSlots(new Date(), booked) });
  } catch (error) {
    console.error("[slots]", error);
    return NextResponse.json({ ok: false, days: [], error: "無法取得可預約時段。" }, { status: 500 });
  }
}
