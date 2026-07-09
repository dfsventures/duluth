"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  ImageIcon,
  Heading2,
  Heading3,
  Minus,
  Undo,
  Redo,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  companyId?: string; // for image uploads
  /**
   * "boxed" (default) is byte-identical to the original editor — bordered
   * container, permanent toolbar. "chromeless" (WS20) drops the box and
   * restyles the toolbar as a slim, borderless bar that dims until the
   * editor is focused; it keeps every button (nothing moved into a bubble
   * or floating menu — Part 8 decision Q18 = B). Templates/notes callers
   * never pass this, so they render exactly as before.
   */
  variant?: "boxed" | "chromeless";
  /**
   * Additive extensions spread in after the built-ins (Part 7, JC9) — e.g.
   * the fund-report editor's portfolio-company mention extension. Defaults
   * to empty, so every existing caller is unaffected.
   */
  extraExtensions?: AnyExtension[];
}

export function RichEditor({
  value,
  onChange,
  placeholder = "Write your update here...",
  className,
  companyId,
  variant = "boxed",
  extraExtensions = [],
}: RichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Image.configure({
        HTMLAttributes: { class: "max-w-full rounded-md my-4" },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline", target: "_blank" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      ...extraExtensions,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    editorProps: {
      attributes: {
        class:
          variant === "chromeless"
            ? "prose max-w-none min-h-[50vh] focus:outline-none"
            : "prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none",
      },
    },
  });

  // TipTap only reads `content` at creation; sync later external `value` changes
  // (e.g. template prefill) into the editor. The getHTML() guard keeps edits that
  // originated inside the editor from resetting the cursor.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!editor || !companyId) return;

      // Get presigned upload URL
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: file.name,
          mimeType: file.type,
          isInternal: false,
        }),
      });

      if (!res.ok) return;
      const { uploadUrl, document } = await res.json();

      // Upload to S3/R2
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      // Insert image into editor using the download endpoint
      const imageUrl = `/api/documents/${document.id}/view`;
      editor.chain().focus().setImage({ src: imageUrl, alt: file.name }).run();
    },
    [editor, companyId]
  );

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    active,
    disabled,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded p-1.5 text-sm transition-colors",
        active
          ? "bg-primary-100 text-primary-700"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      {children}
    </button>
  );

  const chromeless = variant === "chromeless";

  return (
    <div className={cn(chromeless ? "" : "rounded-md border border-input bg-background", className)}>
      {/* Toolbar — chromeless: borderless, slim, and persistent (always in the
          DOM, never a selection/bubble popup) but dims to a quiet baseline
          until the editor is focused, matching "slim persistent toolbar,
          appearing on focus" (Part 8, Q18 = B). */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-0.5 transition-opacity",
          chromeless
            ? cn("mb-3 gap-1", focused ? "opacity-100" : "opacity-50 hover:opacity-90")
            : "border-b p-2"
        )}
      >
        {/* Undo / Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Quote"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Divider"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Link & Image */}
        <ToolbarButton
          onClick={setLink}
          active={editor.isActive("link")}
          title="Add link"
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>

        {companyId && (
          <>
            <ToolbarButton
              onClick={() => fileInputRef.current?.click()}
              title="Insert image"
            >
              <ImageIcon className="h-4 w-4" />
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Prose styles */}
      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h2 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
        .ProseMirror h3 { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
        .ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        .ProseMirror li { margin: 0.2rem 0; }
        .ProseMirror blockquote { border-left: 3px solid #3BBFA0; padding-left: 1rem; color: #64748B; margin: 0.75rem 0; }
        .ProseMirror hr { border: none; border-top: 1px solid #E2E8F0; margin: 1rem 0; }
        .ProseMirror p { margin: 0.5rem 0; }
        .ProseMirror strong { font-weight: 600; }
        .ProseMirror .portco-mention { color: #44688E; text-decoration: underline; text-decoration-color: #44688E; font-weight: 500; }
      `}</style>
    </div>
  );
}
