import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DATABASE_FILE = path.join(DATA_DIR, "appointments.json");
const SEED_FILE = path.join(DATA_DIR, "appointments.seed.json");

export type AppointmentStatus = "confirmed" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  name: string;
  phone: string;
  email: string;
  meetType: string;
  intent: string[];
  urgency: string | null;
  note: string;
  slotIso: string;
  status: AppointmentStatus;
  aiHeat: "high" | "mid" | "low";
  aiSuggestion: string;
  aiSummary: string;
  aiNextAction: string;
  previewFile: string | null;
  createdAt: string;
};

export class SlotConflictError extends Error {
  constructor() {
    super("這個時段剛剛被預約，請重新選擇。");
    this.name = "SlotConflictError";
  }
}

let writeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(operation: () => Promise<T>) {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function readJson(file: string): Promise<Appointment[]> {
  const raw = await fs.readFile(file, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as Appointment[]) : [];
}

export async function readAppointments(): Promise<Appointment[]> {
  try {
    return await readJson(DATABASE_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return readJson(SEED_FILE);
  }
}

async function writeAppointments(rows: Appointment[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${DATABASE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await fs.rename(temporary, DATABASE_FILE);
}

export async function bookedSlots() {
  const rows = await readAppointments();
  return new Set(rows.filter((row) => row.status === "confirmed").map((row) => row.slotIso));
}

export async function listAppointments(status = "all") {
  const rows = await readAppointments();
  const filtered = status === "all" ? rows : rows.filter((row) => row.status === status);
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type CreateAppointmentInput = Omit<Appointment, "id" | "status" | "previewFile" | "createdAt">;

export async function createAppointment(input: CreateAppointmentInput) {
  return withLock(async () => {
    const rows = await readAppointments();
    if (rows.some((row) => row.status === "confirmed" && row.slotIso === input.slotIso)) {
      throw new SlotConflictError();
    }
    const appointment: Appointment = {
      ...input,
      id: crypto.randomUUID(),
      status: "confirmed",
      previewFile: null,
      createdAt: new Date().toISOString()
    };
    rows.push(appointment);
    await writeAppointments(rows);
    return appointment;
  });
}

export async function attachPreview(id: string, previewFile: string) {
  return withLock(async () => {
    const rows = await readAppointments();
    const appointment = rows.find((row) => row.id === id);
    if (!appointment) return;
    appointment.previewFile = previewFile;
    await writeAppointments(rows);
  });
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  return withLock(async () => {
    const rows = await readAppointments();
    const appointment = rows.find((row) => row.id === id);
    if (!appointment) return null;
    appointment.status = status;
    await writeAppointments(rows);
    return appointment;
  });
}

export async function resetDemoAppointments() {
  return withLock(async () => {
    try {
      await fs.unlink(DATABASE_FILE);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  });
}
