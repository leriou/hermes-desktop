import { useState, memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy } from "lucide-react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import lua from "react-syntax-highlighter/dist/esm/languages/prism/lua";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import shell from "react-syntax-highlighter/dist/esm/languages/prism/shell-session";
import xml from "react-syntax-highlighter/dist/esm/languages/prism/xml-doc";
import powershell from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import { useI18n } from "./useI18n";

const LANG_MAP: Record<string, typeof bash> = {
  bash, c, cpp, css, diff, go, java, javascript, json, kotlin,
  lua, markdown, python, ruby, rust, sql, swift, typescript, yaml,
  shell, xml, powershell,
  sh: bash, zsh: bash, ts: typescript, js: javascript, py: python,
  yml: yaml, makefile: bash, dockerfile: bash, toml: yaml, proto: cpp,
  rb: ruby, kt: kotlin, rs: rust,
};
for (const [name, lang] of Object.entries(LANG_MAP)) {
  SyntaxHighlighter.registerLanguage(name, lang);
}

function DiffView({ code }: { code: string }): React.JSX.Element {
  const lines = code.split("\n");
  return (
    <div className="chat-diff-content">
      {lines.map((line, i) => {
        let cls = "chat-diff-line";
        if (line.startsWith("+")) cls += " chat-diff-add";
        else if (line.startsWith("-")) cls += " chat-diff-remove";
        else if (line.startsWith("@@")) cls += " chat-diff-hunk";
        return (
          <div key={i} className={cls}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

const MAX_RENDER_LINES = 80;

const CodeBlock = memo(function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const code = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const isDiff = language === "diff";

  const lines = code.split("\n");
  const truncated = !expanded && lines.length > MAX_RENDER_LINES;
  const displayCode = truncated ? lines.slice(0, MAX_RENDER_LINES).join("\n") : code;

  function handleCopy(): void {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">
          {isDiff ? "diff" : language || "code"}
        </span>
        <button className="chat-code-copy" onClick={handleCopy}>
          {copied ? t("common.copied") : <Copy size={13} />}
        </button>
      </div>
      {isDiff ? (
        <DiffView code={displayCode} />
      ) : (
        <SyntaxHighlighter
          style={oneDark}
          language={LANG_MAP[language] ? language : "text"}
          PreTag="div"
          showLineNumbers
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "13px",
            padding: "12px",
            background: "transparent",
          }}
        >
          {displayCode}
        </SyntaxHighlighter>
      )}
      {truncated && (
        <button
          className="chat-code-expand"
          onClick={() => setExpanded(true)}
        >
          {lines.length} lines — show all
        </button>
      )}
    </div>
  );
});

const MD_COMPONENTS: Record<string, React.ComponentType<any>> = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (!href) return;
        try {
          const url = new URL(href, "https://placeholder.invalid");
          if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
            return;
          }
        } catch {
          return;
        }
        window.hermesAPI.openExternal(href);
      }}
    >
      {children}
    </a>
  ),
  code: ({
    className,
    children,
    ...props
  }: {
    className?: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const isInline =
      !className &&
      typeof children === "string" &&
      !children.includes("\n");
    if (isInline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
};

const AgentMarkdown = memo(function AgentMarkdown({
  children,
}: {
  children: string;
  streaming?: boolean;
}): React.JSX.Element {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {children}
    </Markdown>
  );
});

export { AgentMarkdown };
export default AgentMarkdown;
