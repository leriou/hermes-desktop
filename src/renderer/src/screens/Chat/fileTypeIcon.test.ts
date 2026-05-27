import { describe, it, expect } from "vitest";
import {
  getFileCategory,
  getFileIcon,
  type FileCategory,
} from "./fileTypeIcon";

const CASES: [string, FileCategory][] = [
  // text
  ["readme.txt", "text"],
  ["notes.md", "text"],
  ["debug.log", "text"],
  ["data.csv", "text"],
  // code
  ["app.tsx", "code"],
  ["index.js", "code"],
  ["main.py", "code"],
  ["lib.rs", "code"],
  ["main.go", "code"],
  ["run.sh", "code"],
  ["config.json", "code"],
  ["values.yaml", "code"],
  // document
  ["report.pdf", "document"],
  ["resume.docx", "document"],
  ["budget.xlsx", "document"],
  ["slides.pptx", "document"],
  // image
  ["photo.png", "image"],
  ["shot.jpg", "image"],
  ["avatar.webp", "image"],
  ["anim.gif", "image"],
  ["logo.svg", "image"],
  // archive
  ["backup.zip", "archive"],
  ["data.tar", "archive"],
  ["pkg.gz", "archive"],
  ["big.7z", "archive"],
  // audio/video
  ["song.mp3", "audio"],
  ["voice.wav", "audio"],
  ["clip.mp4", "audio"],
  ["movie.mov", "audio"],
  // unknown
  ["data.bin", "unknown"],
  ["noext", "unknown"],
  ["", "unknown"],
];

describe("fileTypeIcon", () => {
  describe("getFileCategory", () => {
    it.each(CASES)("%s → %s", (name, expected) => {
      expect(getFileCategory(name)).toBe(expected);
    });

    it("handles uppercase extensions", () => {
      expect(getFileCategory("IMG.PNG")).toBe("image");
      expect(getFileCategory("SCRIPT.PY")).toBe("code");
    });
  });

  describe("getFileIcon", () => {
    it("returns a component for known types", () => {
      const Icon = getFileIcon("test.ts");
      expect(Icon).toBeDefined();
      expect(Icon.$$typeof).toBeTruthy();
    });

    it("returns a component for unknown types", () => {
      const Icon = getFileIcon("unknown.xyz");
      expect(Icon).toBeDefined();
      expect(Icon.$$typeof).toBeTruthy();
    });
  });
});
