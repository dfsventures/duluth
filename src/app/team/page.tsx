"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Trash2, AlertCircle, CheckCircle2, X, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useCompany } from "@/context/company-context";

interface Member {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  userRoles: string[];
  membershipRole: "OWNER" | "MEMBER" | "VIEWER";
}

interface Company {
  id: string;
  name: string;
  membershipRole: "OWNER" | "MEMBER" | "VIEWER";
}

const ROLE_OPTIONS = [
  { value: "MEMBER", label: "Editor" },
  { value: "VIEWER", label: "Viewer" },
] as const;

function roleBadge(role: "OWNER" | "MEMBER" | "VIEWER") {
  if (role === "OWNER") return <Badge variant="success">Owner</Badge>;
  if (role === "MEMBER") return <Badge variant="info">Editor</Badge>;
  return <Badge variant="neutral">Viewer</Badge>;
}

export default function TeamPage() {
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "VIEWER">("MEMBER");
  const [inviting, setInviting] = useState(false);

  // Remove
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Role change
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (companyLoading) return;
    try {
      if (!selectedCompany) {
        setLoading(false);
        return;
      }

      const membersRes = await fetch(`/api/companies/${selectedCompany.id}/members`);
      if (!membersRes.ok) throw new Error("Failed to load members");
      const membersData: Member[] = await membersRes.json();

      setCompany({
        id: selectedCompany.id,
        name: selectedCompany.name,
        membershipRole: (selectedCompany.membershipRole as "OWNER" | "MEMBER" | "VIEWER") ?? "VIEWER",
      });
      setMembers(membersData);
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Failed to load team data." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, companyLoading, selectedCompany?.id]);

  async function handleInvite() {
    if (!company || !inviteEmail.trim()) return;
    setInviting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to send invite");
      setMembers((prev) => {
        if (prev.find((m) => m.userId === data.userId)) return prev;
        return [...prev, data];
      });
      setInviteEmail("");
      setShowInvite(false);
      setMessage({ type: "success", text: `Invite sent to ${data.email}.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to send invite." });
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: Member) {
    if (!company) return;
    setRemovingId(member.userId);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to remove member");
      }
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
      setMessage({ type: "success", text: `${member.name ?? member.email} removed from team.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to remove member." });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRoleChange(member: Member, newRole: "MEMBER" | "VIEWER") {
    if (!company) return;
    setUpdatingRoleId(member.userId);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update role");
      setMembers((prev) =>
        prev.map((m) => (m.userId === member.userId ? { ...m, membershipRole: data.membershipRole } : m))
      );
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update role." });
    } finally {
      setUpdatingRoleId(null);
    }
  }

  const isOwner = company?.membershipRole === "OWNER";

  return (
    <AppShell>
      <PageHeader
        title="Team"
        description={company ? `Manage who has access to ${company.name}` : "Manage team access"}
        action={
          isOwner && !showInvite ? (
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Invite Member
            </Button>
          ) : undefined
        }
      />

      {message && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-acacia/30 bg-acacia/10 text-acacia"
              : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="mb-3 text-sm font-medium">Invite a teammate</p>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                label=""
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                className="flex-1"
              />
              <div className="relative">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "MEMBER" | "VIEWER")}
                  className="h-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowInvite(false);
                  setInviteEmail("");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={inviting || !inviteEmail.trim()} onClick={handleInvite}>
                {inviting ? "Sending..." : "Send Invite"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No team members"
          description="Invite teammates to collaborate on your company updates."
        />
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const isPending = !member.name;
            const isOwnerRow = member.membershipRole === "OWNER";
            return (
              <Card key={member.membershipId}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
                      {(member.name?.[0] ?? member.email[0]).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{member.name ?? member.email}</p>
                        {isPending && (
                          <Badge variant="neutral">Invite pending</Badge>
                        )}
                      </div>
                      {member.name && (
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Role: owners see badge only; OWNER can change MEMBER/VIEWER via select */}
                    {isOwner && !isOwnerRow ? (
                      <div className="relative">
                        <select
                          value={member.membershipRole}
                          disabled={updatingRoleId === member.userId}
                          onChange={(e) =>
                            handleRoleChange(member, e.target.value as "MEMBER" | "VIEWER")
                          }
                          className="appearance-none rounded-md border border-input bg-background px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    ) : (
                      roleBadge(member.membershipRole)
                    )}

                    {/* Remove button: only OWNER can remove, and can't remove other OWNERs */}
                    {isOwner && !isOwnerRow && (
                      <button
                        onClick={() => handleRemove(member)}
                        disabled={removingId === member.userId}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        title="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
