"use client";

import { useMemo, useState } from "react";
import type { Appointment, AppointmentStatus } from "@/lib/appointment-store";
import { formatSlotTaipei, intentLabel, meetTypeLabel, urgencyLabel } from "@/lib/booking";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "confirmed", label: "已預約" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" }
];

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: "已預約",
  completed: "已完成",
  cancelled: "已取消"
};

const HEAT_LABEL = {
  high: "高溫",
  mid: "中溫",
  low: "低溫"
};

export default function AppointmentBoard({
  initialRows,
  status
}: {
  initialRows: Appointment[];
  status: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const stats = useMemo(() => {
    const all = rows.length;
    const confirmed = rows.filter((row) => row.status === "confirmed").length;
    const high = rows.filter((row) => row.status === "confirmed" && row.aiHeat === "high").length;
    const completed = rows.filter((row) => row.status === "completed").length;
    const cancelled = rows.filter((row) => row.status === "cancelled").length;
    return { all, confirmed, high, completed, cancelled };
  }, [rows]);

  async function changeStatus(id: string, nextStatus: AppointmentStatus) {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "更新失敗");
      if (status === "all" || status === nextStatus) {
        setRows((current) =>
          current.map((row) => (row.id === id ? { ...row, status: nextStatus } : row))
        );
      } else {
        setRows((current) => current.filter((row) => row.id !== id));
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "更新失敗");
    } finally {
      setBusyId("");
    }
  }

  async function resetDemo() {
    setBusyId("reset");
    setMessage("");
    try {
      const response = await fetch("/api/appointments/reset", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "重設失敗");
      window.location.href = "/admin/appointments";
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "重設失敗");
      setBusyId("");
    }
  }

  return (
    <main className="admin-shell">
      <div className="admin-heading">
        <div>
          <h1>客戶預約</h1>
          <p>看需求、判溫度、更新處理狀態。課堂版資料只存在本機。</p>
        </div>
        <button className="button-secondary" disabled={Boolean(busyId)} onClick={resetDemo} type="button">
          {busyId === "reset" ? "重設中..." : "重設示範資料"}
        </button>
      </div>

      <div className="stat-grid">
        <Stat label="目前清單" value={stats.all} />
        <Stat label="待處理" value={stats.confirmed} />
        <Stat label="高溫客戶" value={stats.high} />
        <Stat label="已完成" value={stats.completed} />
        <Stat label="已取消" value={stats.cancelled} />
      </div>

      <div className="filter-row" aria-label="預約狀態篩選">
        {FILTERS.map((filter) => (
          <a
            data-active={status === filter.key}
            href={`/admin/appointments?status=${filter.key}`}
            key={filter.key}
          >
            {filter.label}
          </a>
        ))}
      </div>

      {message ? <div className="form-error">{message}</div> : null}

      {rows.length ? (
        <div className="appointment-list">
          {rows.map((row) => (
            <article className="appointment" data-status={row.status} key={row.id}>
              <div className="appointment-top">
                <div className="appointment-time">{formatSlotTaipei(row.slotIso)}</div>
                <div className="tag-row">
                  <span className={`tag ${row.aiHeat}`}>{HEAT_LABEL[row.aiHeat]}</span>
                  <span className={`tag ${row.status}`}>{STATUS_LABEL[row.status]}</span>
                  <span className="tag">{meetTypeLabel(row.meetType)}</span>
                </div>
              </div>

              <div className="appointment-contact">
                <strong>{row.name}</strong>
                <a href={`tel:${row.phone}`}>{row.phone}</a>
                <a href={`mailto:${row.email}`}>{row.email}</a>
              </div>

              <div className="appointment-body">
                <div className="detail-box">
                  <span className="box-label">客戶需求</span>
                  <div>{row.intent.map(intentLabel).join("、")} · {urgencyLabel(row.urgency)}</div>
                  <div>{row.note}</div>
                </div>
                <div className="suggestion-box">
                  <span className="box-label">建議下一步</span>
                  <div>{row.aiSuggestion}</div>
                  <div>{row.aiNextAction}</div>
                </div>
              </div>

              <div className="appointment-actions">
                {row.status !== "completed" ? (
                  <button disabled={busyId === row.id} onClick={() => changeStatus(row.id, "completed")} type="button">標記完成</button>
                ) : null}
                {row.status !== "confirmed" ? (
                  <button disabled={busyId === row.id} onClick={() => changeStatus(row.id, "confirmed")} type="button">恢復預約</button>
                ) : null}
                {row.status !== "cancelled" ? (
                  <button disabled={busyId === row.id} onClick={() => changeStatus(row.id, "cancelled")} type="button">取消預約</button>
                ) : null}
                {row.previewFile ? (
                  <a href={`/api/appointment/preview?file=${encodeURIComponent(row.previewFile)}`} target="_blank" rel="noreferrer">確認信預覽</a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">這個狀態目前沒有預約。</div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
