"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// Map file extensions to language names
const extensionToLanguage: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    mts: "typescript",
    cts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    java: "java",
    go: "go",
    rs: "rust",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    kts: "kotlin",
    scala: "scala",
    html: "markup",
    htm: "markup",
    xml: "markup",
    svg: "markup",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    mdx: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    dockerfile: "docker",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    gitignore: "git",
    gitattributes: "git",
    env: "bash",
    graphql: "graphql",
    gql: "graphql",
    makefile: "makefile",
    vue: "javascript",
    svelte: "javascript",
};

interface CodeHighlighterProps {
    code: string;
    extension: string;
    showLineNumbers?: boolean;
}

export function CodeHighlighter({
    code,
    extension,
    showLineNumbers = true,
}: CodeHighlighterProps) {
    const language = extensionToLanguage[extension.toLowerCase()] || "text";

    return (
        <SyntaxHighlighter
            language={language}
            style={oneDark}
            showLineNumbers={showLineNumbers}
            customStyle={{
                margin: 0,
                borderRadius: 0,
                background: "#0d0d0d",
                fontSize: "0.875rem",
            }}
            lineNumberStyle={{
                minWidth: "3em",
                paddingRight: "1em",
                color: "#666",
                borderRight: "1px solid #333",
                marginRight: "1em",
            }}
            codeTagProps={{
                style: {
                    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
                },
            }}
        >
            {code}
        </SyntaxHighlighter>
    );
}
