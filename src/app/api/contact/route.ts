import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "chukwumanazodo@gmail.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const bodySchema = z.object({
  email: z.string().email(),
  message: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, message } = parsed.data;
  const db = await getDb();
  let delivered = false;

  if (RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.CONTACT_FROM_EMAIL ?? "West Creatives <onboarding@resend.dev>",
        to: CONTACT_EMAIL,
        replyTo: email,
        subject: `New contact form message from ${email}`,
        text: message,
      });
      delivered = true;
    } catch (err) {
      // Fall through — message is still saved locally below, and the API
      // still returns success so the submitter isn't blocked by our email
      // provider being down or misconfigured.
      console.error("Resend delivery failed:", err);
    }
  }

  await db.run(
    `INSERT INTO contact_messages (id, email, message, delivered, createdAt) VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), email, message, delivered ? 1 : 0, new Date().toISOString()]
  );

  return NextResponse.json({
    ok: true,
    delivered,
    note: delivered
      ? undefined
      : `RESEND_API_KEY not set — message saved to the local database instead of emailed to ${CONTACT_EMAIL}. Add a free key from resend.com to enable real delivery.`,
  });
}
