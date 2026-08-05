"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { INTENTS, MEET_TYPES, URGENCIES, type OpenDay } from "@/lib/booking";

type SubmissionResult = {
  id: string;
  slotLabel: string;
  previewFile: string | null;
};

export default function BookingForm() {
  const [days, setDays] = useState<OpenDay[]>([]);
  const [activeDate, setActiveDate] = useState("");
  const [slotIso, setSlotIso] = useState("");
  const [meetType, setMeetType] = useState("");
  const [intent, setIntent] = useState<string[]>([]);
  const [urgency, setUrgency] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);

  async function loadSlots() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/appointment/slots", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "無法讀取時段");
      const nextDays = Array.isArray(payload.days) ? payload.days : [];
      setDays(nextDays);
      setActiveDate((current) => current || nextDays[0]?.date || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法讀取時段");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSlots();
  }, []);

  const activeDay = useMemo(
    () => days.find((day) => day.date === activeDate),
    [activeDate, days]
  );

  function toggleIntent(key: string) {
    setIntent((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!slotIso) return setError("請先選擇日期與時段。");
    if (!meetType) return setError("請選擇見面方式。");
    if (!name.trim() || !phone.trim() || !email.trim()) return setError("請填妥姓名、電話與 Email。");
    if (!intent.length) return setError("請至少選擇一個需求。");
    if (!urgency) return setError("請選擇預計處理時間。");
    if (!note.trim()) return setError("請簡單描述需求。");

    setSubmitting(true);
    try {
      const response = await fetch("/api/appointment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotIso,
          meetType,
          intent,
          urgency,
          name,
          phone,
          email,
          note
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setSlotIso("");
          await loadSlots();
        }
        throw new Error(payload.error || "預約未完成，請稍後重試。");
      }
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "預約未完成，請稍後重試。");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <main className="booking-shell">
        <div className="page-heading">
          <Link href="/card">回電子名片</Link>
          <h1>預約完成</h1>
          <p>資料已寫入本機預約後台，課堂版不會真的寄信或通知客戶。</p>
        </div>
        <div className="form-success">
          <strong>已保留時段：</strong>
          <br />
          {result.slotLabel}
        </div>
        <div className="choice-row">
          <Link className="button" href="/admin/appointments">查看預約後台</Link>
          {result.previewFile ? (
            <a
              className="button-secondary"
              href={`/api/appointment/preview?file=${encodeURIComponent(result.previewFile)}`}
              target="_blank"
              rel="noreferrer"
            >
              查看確認信預覽
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="booking-shell">
      <div className="page-heading">
        <Link href="/card">回電子名片</Link>
        <h1>線上預約諮詢</h1>
        <p>選一個方便的時段，留下你想處理的問題，房仲會依需求先做準備。</p>
      </div>

      <form onSubmit={submit}>
        <section className="booking-section">
          <div className="section-heading">
            <span className="section-number">1</span>
            <h2>選擇時間</h2>
            <small>台灣時間</small>
          </div>
          {loading ? <div className="loading-line">正在整理可預約時段...</div> : null}
          {!loading && days.length === 0 ? <div className="loading-line">目前沒有可預約時段。</div> : null}
          {days.length ? (
            <>
              <div className="choice-row date-row">
                {days.map((day) => (
                  <button
                    className="choice"
                    data-active={activeDate === day.date}
                    key={day.date}
                    onClick={() => {
                      setActiveDate(day.date);
                      setSlotIso("");
                    }}
                    type="button"
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <div className="slot-grid">
                {activeDay?.slots.map((slot) => (
                  <button
                    className="choice"
                    data-active={slotIso === slot.iso}
                    key={slot.iso}
                    onClick={() => setSlotIso(slot.iso)}
                    type="button"
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="booking-section">
          <div className="section-heading">
            <span className="section-number">2</span>
            <h2>見面方式</h2>
          </div>
          <div className="meet-grid">
            {MEET_TYPES.map((option) => (
              <button
                className="meet-choice"
                data-active={meetType === option.key}
                key={option.key}
                onClick={() => setMeetType(option.key)}
                type="button"
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="booking-section">
          <div className="section-heading">
            <span className="section-number">3</span>
            <h2>聯絡資料</h2>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="name">姓名</label>
              <input id="name" autoComplete="name" maxLength={80} onChange={(event) => setName(event.target.value)} value={name} />
            </div>
            <div className="field">
              <label htmlFor="phone">電話</label>
              <input id="phone" autoComplete="tel" inputMode="tel" maxLength={20} onChange={(event) => setPhone(event.target.value)} value={phone} />
            </div>
            <div className="field full">
              <label htmlFor="email">Email</label>
              <input id="email" autoComplete="email" inputMode="email" maxLength={160} onChange={(event) => setEmail(event.target.value)} value={email} />
            </div>
          </div>
        </section>

        <section className="booking-section">
          <div className="section-heading">
            <span className="section-number">4</span>
            <h2>諮詢需求</h2>
          </div>
          <div className="field">
            <label>想處理什麼</label>
            <div className="choice-row">
              {INTENTS.map((option) => (
                <button
                  className="choice"
                  data-active={intent.includes(option.key)}
                  key={option.key}
                  onClick={() => toggleIntent(option.key)}
                  title={option.hint}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <label>預計何時處理</label>
            <div className="choice-row">
              {URGENCIES.map((option) => (
                <button
                  className="choice"
                  data-active={urgency === option.key}
                  key={option.key}
                  onClick={() => setUrgency(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="note">需求說明</label>
            <textarea
              id="note"
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：屏東市自住透天，屋齡約 30 年，想先了解目前行情與賣掉大概實拿多少。"
              value={note}
            />
          </div>
        </section>

        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <button className="button booking-submit" disabled={submitting} type="submit">
          {submitting ? "正在建立預約..." : "確認預約"}
        </button>
        <p className="privacy-note">教學模式：資料只存在這個專案資料夾，不會傳到外部服務。</p>
      </form>
    </main>
  );
}
