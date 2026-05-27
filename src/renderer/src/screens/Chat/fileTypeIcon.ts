import type { LucideIcon } from "lucide-react";
import {
  Folder,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  FileAudio,
  File,
} from "lucide-react";

export type FileCategory =
  | "folder"
  | "text"
  | "code"
  | "document"
  | "image"
  | "archive"
  | "audio"
  | "unknown";

const CATEGORY_ICON: Record<FileCategory, LucideIcon> = {
  folder: Folder,
  text: FileText,
  code: FileCode,
  document: FileText,
  image: FileImage,
  archive: FileArchive,
  audio: FileAudio,
  unknown: File,
};

const EXT_MAP: Record<string, FileCategory> = {
  // text
  txt: "text", md: "text", markdown: "text", log: "text", csv: "text", tsv: "text",
  // code
  json: "code", yaml: "code", yml: "code", toml: "code", xml: "code",
  js: "code", jsx: "code", ts: "code", tsx: "code", mjs: "code", cjs: "code",
  py: "code", rs: "code", go: "code", sh: "code", bash: "code", zsh: "code",
  c: "code", cpp: "code", h: "code", java: "code", kt: "code", rb: "code",
  php: "code", swift: "code", scala: "code", lua: "code", r: "code", pl: "code",
  sql: "code", html: "code", htm: "code", css: "code", scss: "code", vue: "code",
  // document
  pdf: "document", doc: "document", docx: "document",
  xls: "document", xlsx: "document", ppt: "document", pptx: "document",
  // image
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", svg: "image",
  // archive
  zip: "archive", tar: "archive", gz: "archive", "7z": "archive", rar: "archive",
  // audio/video
  mp3: "audio", wav: "audio", m4a: "audio", flac: "audio",
  mp4: "audio", mov: "audio", avi: "audio", mkv: "audio",
};

export function getFileCategory(name: string): FileCategory {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
  return EXT_MAP[ext] ?? "unknown";
}

export function getFileIcon(name: string): LucideIcon {
  return CATEGORY_ICON[getFileCategory(name)];
}
