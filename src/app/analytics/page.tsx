"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Trophy } from "lucide-react";

interface Summary {
  totals: {
    contentCount: number;
    totalSpend: number;
    developerEarnings: number;
    platformRevenue: number;
    transactionCount: number;
  };
  leaderboard: {
    id: string;
    name: string;
    type: string;
    score: number;
    transactionCount: number;
    priceUsdc: number;
  }[];
  byModality: { modality: string; count: number; spend: number }[];
  recent: { id: string; modality: string; costUsdc: number; createdAt: string }[];
}

const COLORS = ["#39ff88", "#1f8f4d", "#2a2b2e", "#9a9ba0", "#0f5c30"];

export default function AnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/analytics/summary")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <div className="mx-auto max-w-6xl px-6 py-24 text-center text-muted">Loading analytics…</div>;
  }

  const statCards = [
    { label: "Content generated", value: data.totals.contentCount },
    { label: "Total spend (USDC)", value: data.totals.totalSpend.toFixed(3) },
    { label: "Developer earnings", value: data.totals.developerEarnings.toFixed(3) },
    { label: "Platform revenue", value: data.totals.platformRevenue.toFixed(3) },
    { label: "Transactions", value: data.totals.transactionCount },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Analytics</h1>
      <p className="mt-2 text-muted">Agent activity, spend, and the marketplace leaderboard.</p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        {statCards.map((s) => (
          <div key={s.label} className="neon-border rounded-2xl bg-surface p-4">
            <div className="text-2xl font-extrabold text-neon">{s.value}</div>
            <div className="mt-1 text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="neon-border rounded-2xl bg-surface p-6">
          <h2 className="font-bold">Spend by modality</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byModality}>
                <XAxis dataKey="modality" stroke="#9a9ba0" fontSize={12} />
                <YAxis stroke="#9a9ba0" fontSize={12} />
                <Tooltip contentStyle={{ background: "#111214", border: "1px solid #2a2b2e" }} />
                <Bar dataKey="spend" fill="#39ff88" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="neon-border rounded-2xl bg-surface p-6">
          <h2 className="font-bold">Requests by modality</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.byModality}
                  dataKey="count"
                  nameKey="modality"
                  outerRadius={90}
                  label
                >
                  {data.byModality.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#111214", border: "1px solid #2a2b2e" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-10 neon-border rounded-2xl bg-surface p-6">
        <h2 className="flex items-center gap-2 font-bold">
          <Trophy size={18} className="text-neon" /> Leaderboard
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="pb-2">Agent</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Score</th>
                <th className="pb-2">Transactions</th>
                <th className="pb-2">Price (USDC)</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map((a, i) => (
                <tr key={a.id} className="border-t border-border-subtle">
                  <td className="py-2.5 font-medium">
                    <span className="mr-2 text-muted">#{i + 1}</span>
                    {a.name}
                  </td>
                  <td className="py-2.5 capitalize text-muted">{a.type}</td>
                  <td className="py-2.5 text-neon">{a.score}</td>
                  <td className="py-2.5 text-muted">{a.transactionCount}</td>
                  <td className="py-2.5 text-muted">{a.priceUsdc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
