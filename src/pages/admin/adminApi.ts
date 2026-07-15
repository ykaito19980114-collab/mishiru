// 管理API クライアント（x-admin-token ヘッダ）
import type { Claim, Lead, Report, Article } from "../../../shared/types";

const KEY = "openlab_admin_token";
export const getAdminToken = () => sessionStorage.getItem(KEY) || "";
export const setAdminToken = (t: string) => sessionStorage.setItem(KEY, t);

async function req<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-admin-token": getAdminToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message || `HTTP ${res.status}`);
  return res.json();
}

export const adminApi = {
  health: () => req<any>("/api/health"),
  kpi: () => req<any>("/api/admin/kpi"),

  labs: (params: Record<string, string>) =>
    req<{ data: any[]; total: number; summary: { totalLabs: number; noUrl: number } }>(`/api/admin/labs?${new URLSearchParams(params).toString()}`),

  claims: () => req<{ claims: Claim[] }>("/api/admin/claims"),
  updateClaim: (id: string, patch: Partial<Claim>) => req<{ claim: Claim }>(`/api/admin/claims/${id}`, "PATCH", patch),
  setLabStatus: (id: string, status: string) => req<{ lab: any }>(`/api/admin/labs/${id}/status`, "POST", { status }),

  leads: (status?: string) => req<{ leads: Lead[] }>(`/api/admin/leads${status ? `?status=${status}` : ""}`),
  addLead: (body: Partial<Lead>) => req<{ lead: Lead }>("/api/admin/leads", "POST", body),
  updateLead: (id: string, patch: Partial<Lead>) => req<{ lead: Lead }>(`/api/admin/leads/${id}`, "PATCH", patch),

  reports: () => req<{ reports: Report[] }>("/api/admin/reports"),
  generateReport: (body: { labId?: string; labName?: string; researcher?: string; sourceUrl?: string }) =>
    req<{ report: Report }>("/api/admin/reports/generate", "POST", body),
  updateReport: (id: string, patch: Partial<Report>) => req<{ report: Report }>(`/api/admin/reports/${id}`, "PATCH", patch),

  articles: () => req<{ articles: Article[] }>("/api/admin/articles"),
  addArticle: (body: Partial<Article>) => req<{ article: Article }>("/api/admin/articles", "POST", body),
  updateArticle: (id: string, patch: Partial<Article>) => req<{ article: Article }>(`/api/admin/articles/${id}`, "PATCH", patch),

  cards: () => req<{ cards: { id: string; title: string; stats: { saves: number; likes: number; skips: number; deep: number } }[] }>("/api/admin/cards"),
};
