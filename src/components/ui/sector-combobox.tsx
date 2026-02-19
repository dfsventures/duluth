"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Sector {
  id: string;
  name: string;
}

interface SectorComboboxProps {
  value: string;
  onChange: (value: string) => void;
  isAdmin?: boolean;
  id?: string;
  label?: string;
}

export function SectorCombobox({ value, onChange, isAdmin, id, label }: SectorComboboxProps) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Admin manage state
  const [manageOpen, setManageOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/sectors")
      .then((r) => r.json())
      .then((data) => setSectors(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sync input when value prop changes externally
  useEffect(() => {
    setInput(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = sectors.filter((s) =>
    s.name.toLowerCase().includes(input.toLowerCase())
  );
  const exactMatch = sectors.some(
    (s) => s.name.toLowerCase() === input.toLowerCase()
  );
  const showCreate = input.trim().length > 0 && !exactMatch;

  async function handleSelect(name: string) {
    onChange(name);
    setInput(name);
    setOpen(false);
  }

  async function handleCreate() {
    const name = input.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/sectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const sector = await res.json();
        setSectors((prev) =>
          [...prev.filter((s) => s.id !== sector.id), sector].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
        onChange(sector.name);
        setInput(sector.name);
      }
    } catch {}
    setOpen(false);
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/sectors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSectors((prev) =>
          prev.map((s) => (s.id === id ? updated : s)).sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
        // If current value was this sector, update it
        if (value === sectors.find((s) => s.id === id)?.name) {
          onChange(updated.name);
          setInput(updated.name);
        }
        setEditingId(null);
      }
    } catch {}
    setSavingEdit(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sectors/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSectors((prev) => prev.filter((s) => s.id !== id));
        setConfirmDeleteId(null);
      }
    } catch {}
    setDeletingId(null);
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}

      {/* Combobox input */}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Select or type a sector"
          className="input-field pr-8"
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { setOpen((v) => !v); inputRef.current?.focus(); }}
          className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Dropdown */}
        {open && !loading && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
            <ul className="max-h-52 overflow-y-auto py-1">
              {/* Clear option */}
              {value && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(""); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                </li>
              )}

              {filtered.length === 0 && !showCreate && (
                <li className="px-3 py-2 text-sm text-muted-foreground">No sectors found</li>
              )}

              {filtered.map((sector) => (
                <li key={sector.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(sector.name); }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted",
                      value === sector.name && "font-medium text-primary"
                    )}
                  >
                    {value === sector.name && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className={value === sector.name ? "" : "pl-5"}>{sector.name}</span>
                  </button>
                </li>
              ))}

              {showCreate && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleCreate(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary-50"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    Add &ldquo;{input.trim()}&rdquo;
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Admin sector management */}
      {isAdmin && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setManageOpen((v) => !v)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {manageOpen ? "Hide" : "Manage sectors"}
          </button>

          {manageOpen && (
            <div className="mt-2 rounded-md border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                All sectors
              </p>
              <ul className="space-y-1.5">
                {sectors.map((sector) => (
                  <li key={sector.id} className="flex items-center gap-2">
                    {editingId === sector.id ? (
                      <>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(sector.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="input-field h-7 flex-1 py-0 text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => handleRename(sector.id)}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {savingEdit ? "..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </>
                    ) : confirmDeleteId === sector.id ? (
                      <>
                        <span className="flex-1 text-xs">{sector.name}</span>
                        <span className="text-xs text-muted-foreground">Delete?</span>
                        <button
                          type="button"
                          disabled={deletingId === sector.id}
                          onClick={() => handleDelete(sector.id)}
                          className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                        >
                          {deletingId === sector.id ? "..." : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-xs">{sector.name}</span>
                        <button
                          type="button"
                          onClick={() => { setEditingId(sector.id); setEditName(sector.name); }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(sector.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
