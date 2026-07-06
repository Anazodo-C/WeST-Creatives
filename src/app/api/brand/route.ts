import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";

/**
 * Persists a creator's brand profile (name, colors, industry, target
 * audience, goal, emotion, voice profile, style prefix) — previously the
 * `brand_profiles` table existed in the schema but nothing ever read or
 * wrote it; every dashboard submission re-typed these fields fresh each
 * time. One profile per ownerId (upsert), so a creator's brand data is
 * remembered across sessions and prefills the dashboard's brand fields
 * instead of starting blank every time.
 */
const bodySchema = z.object({
  ownerId: z.string().min(1),
  name: z.string().optional().default(""),
  colors: z.array(z.string()).optional().default([]),
  industry: z.string().optional().default(""),
  targetAudience: z.string().optional().default(""),
  goal: z.string().optional().default(""),
  emotion: z.string().optional().default(""),
  voiceProfile: z.string().optional().default(""),
  stylePrefix: z.string().optional().default(""),
});

export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get("ownerId");
  if (!ownerId) {
    return NextResponse.json({ error: "ownerId is required" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const row = await db.get<Record<string, unknown>>(
      "SELECT * FROM brand_profiles WHERE ownerId = ? LIMIT 1",
      [ownerId]
    );
    if (!row) {
      return NextResponse.json({ profile: null });
    }
    return NextResponse.json({
      profile: {
        ...row,
        colors: row.colors ? JSON.parse(row.colors as string) : [],
      },
    });
  } catch (err) {
    console.error("[brand] GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load brand profile." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const db = await getDb();
    const existing = await db.get<{ id: string }>("SELECT id FROM brand_profiles WHERE ownerId = ? LIMIT 1", [
      data.ownerId,
    ]);

    if (existing) {
      await db.run(
        `UPDATE brand_profiles SET name = ?, colors = ?, industry = ?, targetAudience = ?, goal = ?, emotion = ?, voiceProfile = ?, stylePrefix = ? WHERE id = ?`,
        [
          data.name,
          JSON.stringify(data.colors),
          data.industry,
          data.targetAudience,
          data.goal,
          data.emotion,
          data.voiceProfile,
          data.stylePrefix,
          existing.id,
        ]
      );
      return NextResponse.json({ id: existing.id, updated: true });
    }

    const id = randomUUID();
    await db.run(
      `INSERT INTO brand_profiles (id, ownerId, name, colors, industry, targetAudience, goal, emotion, voiceProfile, stylePrefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.ownerId,
        data.name,
        JSON.stringify(data.colors),
        data.industry,
        data.targetAudience,
        data.goal,
        data.emotion,
        data.voiceProfile,
        data.stylePrefix,
      ]
    );
    return NextResponse.json({ id, updated: false });
  } catch (err) {
    console.error("[brand] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save brand profile." },
      { status: 500 }
    );
  }
}
