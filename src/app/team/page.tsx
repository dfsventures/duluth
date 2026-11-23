"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useCompany } from "@/context/company-context";
import { useFlashMessage } from "@/lib/use-flash-message";
import { TableSkeleton } from "@/components/ui/skeleton";
import { V2_FORM_BLOCK, V2_UNBOX } from "@/lib/founder-look";

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
  const [, setMessage] = useFlashMessage();

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
  }, [companyLoading, selectedCompany, setMessage]);

  // loadData is rebuilt when the company context settles, so this runs once
  // the company is known (fresh load/refresh), not just on sidebar navigation.
  useEffect(() => {
    loadData();
  }, [loadData]);

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


      {/* Invite form */}
      {showInvite && (
        <Card className={`mb-4 ${V2_FORM_BLOCK} v2:mb-8`}>
          <CardContent className="pt-4 v2:pt-0">
            <p className="mb-3 text-sm font-medium v2:text-row">Invite a teammate</p>
            <div className="flex gap-2 max-md:v2:flex-col">
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
              <Select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "MEMBER" | "VIEWER")}
                className="w-auto"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
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
        <TableSkeleton rows={4} cols={3} />
      ) : members.length === 0 ? (
        <EmptyState eyebrow="Team"
          icon={<Users className="h-8 w-8" />}
          title="No team members"
          description="Invite teammates to collaborate on your company updates."
        />
      ) : (
        // New look: hairline rows (as Updates), a 28px initial, name and email on one line on desktop.
        <div className="space-y-2 v2:space-y-0 v2:divide-y v2:divide-row-divider v2:border-y v2:border-row-divider">
          {members.map((member) => {
            const isPending = !member.name;
            const isOwnerRow = member.membershipRole === "OWNER";
            return (
              <Card key={member.membershipId} className={V2_UNBOX}>
                <CardContent className="flex flex-wrap items-center gap-3 py-3 v2:min-h-14 v2:py-2">
                  <div className="min-w-48 flex-1 flex items-center gap-3 v2:min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium v2:h-7 v2:w-7 v2:bg-muted v2:text-meta v2:text-secondary">
                      {(member.name?.[0] ?? member.email[0]).toUpperCase()}
                    </div>
                    <div className="v2:min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium v2:truncate v2:text-row">{member.name ?? member.email}</p>
                        {isPending && (
                          <Badge variant="neutral">Invite pending</Badge>
                        )}
                      </div>
                      {member.name && (
                        <p className="text-sm text-muted-foreground v2:truncate v2:text-meta">{member.email}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {/* Role: owners see badge only; OWNER can change MEMBER/VIEWER via select */}
                    {isOwner && !isOwnerRow ? (
                      <Select
                        value={member.membershipRole}
                        disabled={updatingRoleId === member.userId}
                        onChange={(e) =>
                          handleRoleChange(member, e.target.value as "MEMBER" | "VIEWER")
                        }
                        className="w-auto"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      roleBadge(member.membershipRole)
                    )}

                    {/* Remove button: only OWNER can remove, and can't remove other OWNERs */}
                    {isOwner && !isOwnerRow && (
                      <button
                        onClick={() => handleRemove(member)}
                        disabled={removingId === member.userId}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40 v2:grid v2:h-8 v2:w-8 v2:place-items-center v2:rounded-ctl v2:hover:bg-row-hover max-md:v2:h-11 max-md:v2:w-11"
                        title="Remove member"
                        aria-label={`Remove ${member.name ?? member.email}`}
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
