"use client";

import { useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { FlashMessage } from "@/lib/use-flash-message";
import type { Member } from "./types";

export function MembersTab({
  companyId,
  members,
  setMembers,
  setMessage,
}: {
  companyId: string;
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  setMessage: (m: FlashMessage | null) => void;
}) {
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  async function handleAddMember() {
    if (!addMemberEmail.trim()) return;
    setAddingMember(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addMemberEmail.trim(), role: "MEMBER" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to add member");
      setMembers((prev) => {
        if (prev.find((m) => m.userId === data.userId)) return prev;
        return [...prev, data];
      });
      setAddMemberEmail("");
      setShowAddMember(false);
      setMessage({ type: "success", text: `${data.email} added as a member.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add member.",
      });
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingMemberId(userId);
    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to remove member");
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove member.",
      });
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleMemberRoleChange(userId: string, role: "OWNER" | "MEMBER" | "VIEWER") {
    setUpdatingRoleId(userId);
    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update role");
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, membershipRole: data.membershipRole } : m))
      );
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update role.",
      });
    } finally {
      setUpdatingRoleId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Members</h3>
        {!showAddMember && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddMember(true)}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Member
          </Button>
        )}
      </div>

      {showAddMember && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="mb-3 text-sm font-medium">Add member by email</p>
            <div className="flex gap-2">
              <Input
                id="member-email"
                label=""
                type="email"
                placeholder="founder@example.com"
                value={addMemberEmail}
                onChange={(e) => setAddMemberEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMember();
                }}
                className="flex-1"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowAddMember(false);
                  setAddMemberEmail("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={addingMember || !addMemberEmail.trim()}
                onClick={handleAddMember}
              >
                {addingMember ? "Adding..." : "Add Member"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No members"
          description="No users are associated with this company. Add a member by their email address."
        />
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <Card key={member.membershipId}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-48 flex-1 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
                    {member.name?.[0]?.toUpperCase() ??
                      member.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {member.name ?? member.email}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={member.userRoles.includes("ADMIN") ? "info" : "neutral"}>
                    {member.userRoles.includes("ADMIN") ? "Admin" : "Founder"}
                  </Badge>
                  {/* Membership role select (admins can set OWNER/MEMBER/VIEWER) */}
                  {!member.userRoles.includes("ADMIN") && (
                    <Select
                      value={member.membershipRole}
                      disabled={updatingRoleId === member.userId}
                      onChange={(e) =>
                        handleMemberRoleChange(
                          member.userId,
                          e.target.value as "OWNER" | "MEMBER" | "VIEWER"
                        )
                      }
                      className="w-auto"
                    >
                      <option value="OWNER">Owner</option>
                      <option value="MEMBER">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </Select>
                  )}
                  <button
                    onClick={() => handleRemoveMember(member.userId)}
                    disabled={removingMemberId === member.userId}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                    title="Remove member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
