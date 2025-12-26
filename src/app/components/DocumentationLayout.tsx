"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
    ChevronRight,
    ChevronDown,
    FolderOpen,
    Folder,
    File,
    Menu,
    X,
    Github,
    GitBranch,
    Loader2,
    Copy,
    Check,
    BookOpen,
    Sparkles,
} from "lucide-react";
import { RepoInfo, FileNode } from "../page";
import { CodeHighlighter } from "./CodeHighlighter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface DocumentationLayoutProps {
    repoInfo: RepoInfo;
    onBack: () => void;
}

interface FileContent {
    name: string;
    path: string;
    content?: string;
    extension: string;
    size: number;
    isMedia?: boolean;
    mediaType?: "image" | "video" | "pdf";
    rawUrl?: string;
}

interface ContentState {
    type: "welcome" | "file" | "chapter";
    fileNode?: FileNode;
    fileContent?: FileContent;
    chapterId?: string;
    chapterContent?: string;
    isLoading?: boolean;
    error?: string;
}

interface Chapter {
    id: string;
    title: string;
    description?: string;
    children?: Chapter[];
}

interface DocGenerationState {
    isGenerating: boolean;
    isGeneratingContent: boolean;
    currentGeneratingChapter?: string;
    chapters: Chapter[];
    generatedContent: Record<string, string>;
    error?: string;
}

// Map file extensions to language names for display
const extensionToLanguage: Record<string, string> = {
    js: "JavaScript",
    jsx: "JavaScript (JSX)",
    ts: "TypeScript",
    tsx: "TypeScript (TSX)",
    py: "Python",
    rb: "Ruby",
    java: "Java",
    go: "Go",
    rs: "Rust",
    c: "C",
    cpp: "C++",
    cs: "C#",
    php: "PHP",
    swift: "Swift",
    kt: "Kotlin",
    scala: "Scala",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "LESS",
    json: "JSON",
    xml: "XML",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    sql: "SQL",
    sh: "Shell",
    bash: "Bash",
    zsh: "Zsh",
    dockerfile: "Dockerfile",
    makefile: "Makefile",
    gradle: "Gradle",
    toml: "TOML",
    ini: "INI",
    cfg: "Config",
    env: "Environment",
    gitignore: "Git Ignore",
};

function getLanguageName(extension: string): string {
    return extensionToLanguage[extension.toLowerCase()] || extension.toUpperCase();
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentationLayout({
    repoInfo,
    onBack,
}: DocumentationLayoutProps) {
    const [activeContent, setActiveContent] = useState<ContentState>({
        type: "welcome",
    });
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
        new Set()
    );
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
    const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    // AI Documentation Generation State
    const [docState, setDocState] = useState<DocGenerationState>({
        isGenerating: false,
        isGeneratingContent: false,
        chapters: [],
        generatedContent: {},
    });

    // Calculate file statistics
    const stats = useMemo(() => {
        let fileCount = 0;
        let folderCount = 0;

        const countNodes = (nodes: FileNode[]) => {
            for (const node of nodes) {
                if (node.type === "folder") {
                    folderCount++;
                    if (node.children) countNodes(node.children);
                } else {
                    fileCount++;
                }
            }
        };

        countNodes(repoInfo.tree);
        return { fileCount, folderCount };
    }, [repoInfo.tree]);

    const toggleFolder = (folderId: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    };

    // Collect key files from repository for context
    const collectKeyFiles = useCallback(async (): Promise<{ path: string; content: string }[]> => {
        const keyFilePatterns = [
            "README.md", "readme.md", "README",
            "package.json", "composer.json", "requirements.txt", "Cargo.toml", "go.mod",
            "index.js", "index.ts", "main.js", "main.ts", "app.js", "app.ts",
            "src/index.js", "src/index.ts", "src/main.js", "src/main.ts", "src/App.tsx", "src/App.jsx",
            ".env.example", "docker-compose.yml", "Dockerfile",
        ];

        const files: { path: string; content: string }[] = [];

        // Find matching files in the tree
        const findFiles = (nodes: FileNode[]): FileNode[] => {
            const matches: FileNode[] = [];
            for (const node of nodes) {
                if (node.type === "file") {
                    const fileName = node.name.toLowerCase();
                    const filePath = node.path.toLowerCase();
                    if (keyFilePatterns.some(p => fileName === p.toLowerCase() || filePath === p.toLowerCase())) {
                        matches.push(node);
                    }
                } else if (node.children) {
                    matches.push(...findFiles(node.children));
                }
            }
            return matches;
        };

        const keyNodes = findFiles(repoInfo.tree).slice(0, 8); // Limit to 8 files

        // Fetch content for each key file
        for (const node of keyNodes) {
            try {
                const response = await fetch("/api/github/content", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        url: repoInfo.url,
                        path: node.path,
                        branch: repoInfo.branch,
                    }),
                });
                const data = await response.json();
                if (response.ok && data.content) {
                    files.push({ path: node.path, content: data.content });
                }
            } catch {
                // Skip files that fail to load
            }
        }

        return files;
    }, [repoInfo]);

    // Helper function to flatten all chapters (including children)
    const flattenChapters = useCallback((chapters: Chapter[]): Chapter[] => {
        const result: Chapter[] = [];
        for (const chapter of chapters) {
            result.push(chapter);
            if (chapter.children) {
                result.push(...flattenChapters(chapter.children));
            }
        }
        return result;
    }, []);

    // Generate content for a single chapter (internal use for batch generation)
    const generateSingleChapterContent = useCallback(async (
        chapter: Chapter,
        keyFiles: { path: string; content: string }[]
    ): Promise<string | null> => {
        try {
            const response = await fetch("/api/groq/generate-content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repoName: repoInfo.repo,
                    chapter: { id: chapter.id, title: chapter.title, description: chapter.description },
                    files: keyFiles,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error(`Failed to generate content for ${chapter.title}:`, data.error);
                return null;
            }

            return data.content;
        } catch (error) {
            console.error(`Error generating content for ${chapter.title}:`, error);
            return null;
        }
    }, [repoInfo.repo]);

    // Generate documentation outline and all chapter content
    const generateDocumentation = useCallback(async () => {
        setDocState(prev => ({ ...prev, isGenerating: true, error: undefined }));

        try {
            const keyFiles = await collectKeyFiles();

            if (keyFiles.length === 0) {
                throw new Error("No key files found to generate documentation");
            }

            // Step 1: Generate outline
            const response = await fetch("/api/groq/generate-outline", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repoName: repoInfo.repo,
                    files: keyFiles,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to generate documentation");
            }

            const chapters: Chapter[] = data.chapters || [];

            setDocState(prev => ({
                ...prev,
                isGenerating: false,
                isGeneratingContent: true,
                chapters,
            }));

            // Step 2: Generate content for all chapters
            const allChapters = flattenChapters(chapters);
            const generatedContent: Record<string, string> = {};

            for (const chapter of allChapters) {
                // Update current generating chapter for UI feedback
                setDocState(prev => ({
                    ...prev,
                    currentGeneratingChapter: chapter.title,
                }));

                const content = await generateSingleChapterContent(chapter, keyFiles);
                if (content) {
                    generatedContent[chapter.id] = content;
                    // Update state incrementally so user can see progress
                    setDocState(prev => ({
                        ...prev,
                        generatedContent: {
                            ...prev.generatedContent,
                            [chapter.id]: content,
                        },
                    }));
                }
            }

            // Mark content generation as complete
            setDocState(prev => ({
                ...prev,
                isGeneratingContent: false,
                currentGeneratingChapter: undefined,
            }));

        } catch (error) {
            setDocState(prev => ({
                ...prev,
                isGenerating: false,
                isGeneratingContent: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }));
        }
    }, [repoInfo, collectKeyFiles, flattenChapters, generateSingleChapterContent]);

    // Auto-generate documentation when component mounts
    useEffect(() => {
        generateDocumentation();
    }, [generateDocumentation]);

    // Generate content for a specific chapter
    const generateChapterContent = useCallback(async (chapter: Chapter) => {
        // Check if already cached
        if (docState.generatedContent[chapter.id]) {
            setActiveContent({
                type: "chapter",
                chapterId: chapter.id,
                chapterContent: docState.generatedContent[chapter.id],
            });
            return;
        }

        setActiveContent({
            type: "chapter",
            chapterId: chapter.id,
            isLoading: true,
        });
        setLeftSidebarOpen(false);

        try {
            const keyFiles = await collectKeyFiles();

            const response = await fetch("/api/groq/generate-content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repoName: repoInfo.repo,
                    chapter: { id: chapter.id, title: chapter.title, description: chapter.description },
                    files: keyFiles,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to generate content");
            }

            // Cache the generated content
            setDocState(prev => ({
                ...prev,
                generatedContent: {
                    ...prev.generatedContent,
                    [chapter.id]: data.content,
                },
            }));

            setActiveContent({
                type: "chapter",
                chapterId: chapter.id,
                chapterContent: data.content,
            });
        } catch (error) {
            setActiveContent({
                type: "chapter",
                chapterId: chapter.id,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }, [repoInfo, collectKeyFiles, docState.generatedContent]);

    // Find chapter by ID (including children)
    const findChapter = useCallback((chapters: Chapter[], id: string): Chapter | undefined => {
        for (const chapter of chapters) {
            if (chapter.id === id) return chapter;
            if (chapter.children) {
                const found = findChapter(chapter.children, id);
                if (found) return found;
            }
        }
        return undefined;
    }, []);

    const handleChapterClick = (chapterId: string) => {
        const chapter = findChapter(docState.chapters, chapterId);
        if (chapter) {
            generateChapterContent(chapter);
        }
    };

    const fetchFileContent = useCallback(async (fileNode: FileNode) => {
        setActiveContent({
            type: "file",
            fileNode,
            isLoading: true,
        });
        setRightSidebarOpen(false);

        try {
            const response = await fetch("/api/github/content", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url: repoInfo.url,
                    path: fileNode.path,
                    branch: repoInfo.branch,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch file content");
            }

            setActiveContent({
                type: "file",
                fileNode,
                fileContent: {
                    name: data.name,
                    path: data.path,
                    content: data.content,
                    extension: data.extension,
                    size: data.size,
                    isMedia: data.isMedia,
                    mediaType: data.mediaType,
                    rawUrl: data.rawUrl,
                },
                isLoading: false,
            });
        } catch (error) {
            setActiveContent({
                type: "file",
                fileNode,
                error: error instanceof Error ? error.message : "Unknown error",
                isLoading: false,
            });
        }
    }, [repoInfo.url, repoInfo.branch]);

    const handleFileClick = (fileNode: FileNode) => {
        fetchFileContent(fileNode);
    };

    const handleCopyCode = async () => {
        if (activeContent.fileContent?.content) {
            await navigator.clipboard.writeText(activeContent.fileContent.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const renderFileTree = (nodes: FileNode[], depth = 0) => {
        const sortedNodes = [...nodes].sort((a, b) => {
            if (a.type === "folder" && b.type !== "folder") return -1;
            if (a.type !== "folder" && b.type === "folder") return 1;
            return a.name.localeCompare(b.name);
        });

        return sortedNodes.map((node) => {
            if (node.type === "folder") {
                const isExpanded = expandedFolders.has(node.path);
                return (
                    <div key={node.path}>
                        <button
                            onClick={() => toggleFolder(node.path)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-[#1a1a1a] rounded transition text-sm cursor-pointer"
                            style={{ paddingLeft: `${depth * 12 + 12}px` }}
                        >
                            {isExpanded ? (
                                <ChevronDown className="w-4 h-4 flex-shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 flex-shrink-0" />
                            )}
                            {isExpanded ? (
                                <FolderOpen className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                            ) : (
                                <Folder className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                            )}
                            <span className="truncate">{node.name}</span>
                        </button>
                        {isExpanded && node.children && (
                            <div>{renderFileTree(node.children, depth + 1)}</div>
                        )}
                    </div>
                );
            } else {
                const isActive =
                    activeContent.type === "file" &&
                    activeContent.fileNode?.path === node.path;
                return (
                    <button
                        key={node.path}
                        onClick={() => handleFileClick(node)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded transition text-sm cursor-pointer ${isActive
                            ? "bg-[#114541] text-white"
                            : "text-gray-300 hover:bg-[#1a1a1a]"
                            }`}
                        style={{ paddingLeft: `${depth * 12 + 32}px` }}
                    >
                        <File className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{node.name}</span>
                    </button>
                );
            }
        });
    };

    const renderChapters = (chapterList: Chapter[], depth = 0) => {
        return chapterList.map((chapter) => {
            const isGenerated = !!docState.generatedContent[chapter.id];
            const isCurrentlyGenerating = docState.currentGeneratingChapter === chapter.title;

            return (
                <div key={chapter.id}>
                    <button
                        onClick={() => handleChapterClick(chapter.id)}
                        className={`w-full text-left px-3 py-1.5 rounded transition text-sm cursor-pointer flex items-center justify-between gap-2 ${isGenerated
                            ? "text-gray-300 hover:bg-[#1a1a1a]"
                            : "text-gray-500 hover:bg-[#1a1a1a]"
                            }`}
                        style={{ paddingLeft: `${depth * 12 + 12}px` }}
                    >
                        <span className="truncate">{chapter.title}</span>
                        {isCurrentlyGenerating && (
                            <Loader2 className="w-3 h-3 animate-spin text-purple-400 flex-shrink-0" />
                        )}
                        {isGenerated && !isCurrentlyGenerating && (
                            <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                        )}
                    </button>
                    {chapter.children && (
                        <div>{renderChapters(chapter.children, depth + 1)}</div>
                    )}
                </div>
            );
        });
    };

    const renderContent = () => {
        // Chapter content rendering
        if (activeContent.type === "chapter") {
            const chapter = findChapter(docState.chapters, activeContent.chapterId || "");

            // Loading state
            if (activeContent.isLoading) {
                return (
                    <div className="prose prose-invert max-w-none">
                        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                            <BookOpen className="w-8 h-8" />
                            {chapter?.title || "Loading..."}
                        </h1>
                        <div className="flex items-center justify-center gap-3 py-12 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span>Generating content...</span>
                        </div>
                    </div>
                );
            }

            // Error state
            if (activeContent.error) {
                return (
                    <div className="prose prose-invert max-w-none">
                        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                            <BookOpen className="w-8 h-8" />
                            {chapter?.title || "Error"}
                        </h1>
                        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
                            <p className="text-red-400">{activeContent.error}</p>
                        </div>
                    </div>
                );
            }

            // Content loaded
            if (activeContent.chapterContent) {
                return (
                    <div className="prose prose-invert max-w-none">
                        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                            <BookOpen className="w-8 h-8" />
                            {chapter?.title}
                        </h1>
                        <div className="markdown-content">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    h1: ({ children }) => <h2 className="text-2xl font-bold text-white mt-8 mb-4">{children}</h2>,
                                    h2: ({ children }) => <h2 className="text-2xl font-bold text-white mt-8 mb-4">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-xl font-semibold text-white mt-6 mb-3">{children}</h3>,
                                    h4: ({ children }) => <h4 className="text-lg font-semibold text-white mt-4 mb-2">{children}</h4>,
                                    p: ({ children }) => <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc list-inside text-gray-300 mb-4 space-y-1">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-1">{children}</ol>,
                                    li: ({ children }) => <li className="text-gray-300">{children}</li>,
                                    code: ({ className, children }) => {
                                        const isBlock = className?.includes('language-');
                                        if (isBlock) {
                                            return (
                                                <pre className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-4 overflow-x-auto my-4">
                                                    <code className="text-gray-300 text-sm">{children}</code>
                                                </pre>
                                            );
                                        }
                                        return <code className="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-emerald-400">{children}</code>;
                                    },
                                    pre: ({ children }) => <div className="my-4">{children}</div>,
                                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                                    em: ({ children }) => <em className="text-gray-400 italic">{children}</em>,
                                    a: ({ href, children }) => <a href={href} className="text-emerald-400 hover:text-emerald-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                                    blockquote: ({ children }) => <blockquote className="border-l-4 border-emerald-500 pl-4 my-4 text-gray-400 italic">{children}</blockquote>,
                                    table: ({ children }) => <table className="w-full border-collapse my-4">{children}</table>,
                                    th: ({ children }) => <th className="border border-gray-700 bg-[#1a1a1a] px-4 py-2 text-left text-white">{children}</th>,
                                    td: ({ children }) => <td className="border border-gray-700 px-4 py-2 text-gray-300">{children}</td>,
                                    hr: () => <hr className="border-gray-700 my-6" />,
                                }}
                            >
                                {activeContent.chapterContent}
                            </ReactMarkdown>
                        </div>
                    </div>
                );
            }
        }

        if (activeContent.type === "file" && activeContent.fileNode) {
            const file = activeContent.fileNode;

            // Loading state
            if (activeContent.isLoading) {
                return (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
                            {file.path.split("/").map((part, index, arr) => (
                                <span key={index} className="flex items-center gap-2">
                                    <span className={index === arr.length - 1 ? "text-white" : ""}>
                                        {part}
                                    </span>
                                    {index < arr.length - 1 && <ChevronRight className="w-4 h-4" />}
                                </span>
                            ))}
                        </div>
                        <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg overflow-hidden">
                            <div className="bg-[#1a1a1a] border-b border-gray-800 px-4 py-3">
                                <span className="text-gray-300 text-sm font-medium flex items-center gap-2">
                                    <File className="w-4 h-4" />
                                    {file.name}
                                </span>
                            </div>
                            <div className="p-12 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                            </div>
                        </div>
                    </div>
                );
            }

            // Error state
            if (activeContent.error) {
                return (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
                            {file.path.split("/").map((part, index, arr) => (
                                <span key={index} className="flex items-center gap-2">
                                    <span className={index === arr.length - 1 ? "text-white" : ""}>
                                        {part}
                                    </span>
                                    {index < arr.length - 1 && <ChevronRight className="w-4 h-4" />}
                                </span>
                            ))}
                        </div>
                        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-center">
                            <p className="text-red-400">{activeContent.error}</p>
                        </div>
                    </div>
                );
            }

            // Content loaded
            if (activeContent.fileContent) {
                const { content, extension, size, isMedia, mediaType, rawUrl } = activeContent.fileContent;
                const lines = content ? content.split("\n") : [];

                // Render media files
                if (isMedia && rawUrl) {
                    return (
                        <div className="space-y-4">
                            {/* File Path Breadcrumb */}
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
                                {file.path.split("/").map((part, index, arr) => (
                                    <span key={index} className="flex items-center gap-2">
                                        <span className={index === arr.length - 1 ? "text-white" : ""}>
                                            {part}
                                        </span>
                                        {index < arr.length - 1 && <ChevronRight className="w-4 h-4" />}
                                    </span>
                                ))}
                            </div>

                            <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg overflow-hidden">
                                {/* File header */}
                                <div className="bg-[#1a1a1a] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-gray-300 text-sm font-medium flex items-center gap-2">
                                            <File className="w-4 h-4" />
                                            {file.name}
                                        </span>
                                        <span className="text-emerald-400 text-xs uppercase font-medium">
                                            {mediaType}
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                            {formatFileSize(size)}
                                        </span>
                                    </div>
                                    <a
                                        href={rawUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-gray-400 hover:text-white text-sm cursor-pointer transition"
                                    >
                                        Open in new tab →
                                    </a>
                                </div>

                                {/* Media content */}
                                <div className="p-4 flex items-center justify-center bg-[#111] min-h-[300px]">
                                    {mediaType === "image" && (
                                        <img
                                            src={rawUrl}
                                            alt={file.name}
                                            className="max-w-full max-h-[70vh] object-contain rounded"
                                        />
                                    )}
                                    {mediaType === "video" && (
                                        <video
                                            src={rawUrl}
                                            controls
                                            className="max-w-full max-h-[70vh] rounded"
                                        >
                                            Your browser does not support video playback.
                                        </video>
                                    )}
                                    {mediaType === "pdf" && (
                                        <iframe
                                            src={rawUrl}
                                            className="w-full h-[70vh] rounded border border-gray-700"
                                            title={file.name}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }

                // Render markdown files
                if (extension === "md" && content) {
                    return (
                        <div className="space-y-4">
                            {/* File Path Breadcrumb */}
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
                                {file.path.split("/").map((part, index, arr) => (
                                    <span key={index} className="flex items-center gap-2">
                                        <span className={index === arr.length - 1 ? "text-white" : ""}>
                                            {part}
                                        </span>
                                        {index < arr.length - 1 && <ChevronRight className="w-4 h-4" />}
                                    </span>
                                ))}
                            </div>

                            <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg overflow-hidden">
                                {/* File header */}
                                <div className="bg-[#1a1a1a] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-gray-300 text-sm font-medium flex items-center gap-2">
                                            <BookOpen className="w-4 h-4" />
                                            {file.name}
                                        </span>
                                        <span className="text-emerald-400 text-xs uppercase font-medium">
                                            Markdown
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                            {formatFileSize(size)}
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleCopyCode}
                                        className="flex items-center gap-1 text-gray-400 hover:text-white text-sm cursor-pointer transition"
                                    >
                                        {copied ? (
                                            <>
                                                <Check className="w-4 h-4 text-green-400" />
                                                <span className="text-green-400">Copied!</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-4 h-4" />
                                                Copy
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Markdown content */}
                                <div className="p-6">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            h1: ({ children }) => <h1 className="text-3xl font-bold text-white mt-6 mb-4">{children}</h1>,
                                            h2: ({ children }) => <h2 className="text-2xl font-bold text-white mt-8 mb-4">{children}</h2>,
                                            h3: ({ children }) => <h3 className="text-xl font-semibold text-white mt-6 mb-3">{children}</h3>,
                                            h4: ({ children }) => <h4 className="text-lg font-semibold text-white mt-4 mb-2">{children}</h4>,
                                            p: ({ children }) => <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>,
                                            ul: ({ children }) => <ul className="list-disc list-inside text-gray-300 mb-4 space-y-1">{children}</ul>,
                                            ol: ({ children }) => <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-1">{children}</ol>,
                                            li: ({ children }) => <li className="text-gray-300">{children}</li>,
                                            code: ({ className, children }) => {
                                                const isBlock = className?.includes('language-');
                                                if (isBlock) {
                                                    return (
                                                        <pre className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4 overflow-x-auto my-4">
                                                            <code className="text-gray-300 text-sm">{children}</code>
                                                        </pre>
                                                    );
                                                }
                                                return <code className="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-emerald-400">{children}</code>;
                                            },
                                            pre: ({ children }) => <div className="my-4">{children}</div>,
                                            strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                                            em: ({ children }) => <em className="text-gray-400 italic">{children}</em>,
                                            a: ({ href, children }) => <a href={href} className="text-emerald-400 hover:text-emerald-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                                            blockquote: ({ children }) => <blockquote className="border-l-4 border-emerald-500 pl-4 my-4 text-gray-400 italic">{children}</blockquote>,
                                            table: ({ children }) => <table className="w-full border-collapse my-4">{children}</table>,
                                            th: ({ children }) => <th className="border border-gray-700 bg-[#1a1a1a] px-4 py-2 text-left text-white">{children}</th>,
                                            td: ({ children }) => <td className="border border-gray-700 px-4 py-2 text-gray-300">{children}</td>,
                                            hr: () => <hr className="border-gray-700 my-6" />,
                                            img: ({ src, alt }) => <img src={src} alt={alt} className="max-w-full rounded-lg my-4" />,
                                        }}
                                    >
                                        {content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    );
                }

                // Render code/text files
                return (
                    <div className="space-y-4">
                        {/* File Path Breadcrumb */}
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
                            {file.path.split("/").map((part, index, arr) => (
                                <span key={index} className="flex items-center gap-2">
                                    <span className={index === arr.length - 1 ? "text-white" : ""}>
                                        {part}
                                    </span>
                                    {index < arr.length - 1 && <ChevronRight className="w-4 h-4" />}
                                </span>
                            ))}
                        </div>

                        <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg overflow-hidden">
                            {/* File header */}
                            <div className="bg-[#1a1a1a] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <span className="text-gray-300 text-sm font-medium flex items-center gap-2">
                                        <File className="w-4 h-4" />
                                        {file.name}
                                    </span>
                                    <span className="text-gray-500 text-xs">
                                        {getLanguageName(extension)}
                                    </span>
                                    <span className="text-gray-500 text-xs">
                                        {formatFileSize(size)}
                                    </span>
                                    <span className="text-gray-500 text-xs">
                                        {lines.length} lines
                                    </span>
                                </div>
                                <button
                                    onClick={handleCopyCode}
                                    className="flex items-center gap-1 text-gray-400 hover:text-white text-sm cursor-pointer transition"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4 text-green-400" />
                                            <span className="text-green-400">Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            Copy
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Code content with syntax highlighting */}
                            <CodeHighlighter
                                code={content || ""}
                                extension={extension}
                                showLineNumbers={true}
                            />
                        </div>
                    </div>
                );
            }
        }

        // Welcome / default view
        return (
            <div className="prose prose-invert max-w-none">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-4 flex items-center gap-3">
                        <Github className="w-10 h-10" />
                        {repoInfo.repo}
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Successfully loaded repository from GitHub
                    </p>
                </div>

                {/* Repository Info Card */}
                <div className="grid gap-4 md:grid-cols-2 mb-8">
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                        <div className="text-gray-400 text-sm mb-1">Owner</div>
                        <div className="text-white font-medium">{repoInfo.owner}</div>
                    </div>
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                        <div className="text-gray-400 text-sm mb-1">Branch</div>
                        <div className="text-white font-medium flex items-center gap-2">
                            <GitBranch className="w-4 h-4 text-green-400" />
                            {repoInfo.branch}
                        </div>
                    </div>
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                        <div className="text-gray-400 text-sm mb-1">Total Files</div>
                        <div className="text-white font-medium">{stats.fileCount}</div>
                    </div>
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
                        <div className="text-gray-400 text-sm mb-1">Total Folders</div>
                        <div className="text-white font-medium">{stats.folderCount}</div>
                    </div>
                </div>

                <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 text-gray-300">
                    <strong className="text-emerald-400">Tip:</strong> Click on a file in the right panel to view its source code.
                </div>
            </div>
        );
    };

    return (
        <div className="h-screen flex flex-col bg-[#0a0a0a]">
            {/* Header */}
            <header className="h-16 border-b border-gray-800 bg-[#0d0d0d] flex items-center justify-between px-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="text-gray-400 hover:text-white transition cursor-pointer"
                    >
                        ← Kembali
                    </button>
                    <div className="text-gray-500">|</div>
                    <div className="text-gray-400 text-sm truncate max-w-md flex items-center gap-2">
                        <Github className="w-4 h-4" />
                        {repoInfo.owner}/{repoInfo.repo}
                    </div>
                </div>
                <div className="flex items-center gap-2 lg:hidden">
                    <button
                        onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
                        className="p-2 text-gray-400 hover:text-white transition cursor-pointer"
                    >
                        {leftSidebarOpen ? (
                            <X className="w-5 h-5" />
                        ) : (
                            <Menu className="w-5 h-5" />
                        )}
                    </button>
                    <button
                        onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                        className="p-2 text-gray-400 hover:text-white transition cursor-pointer"
                    >
                        {rightSidebarOpen ? (
                            <X className="w-5 h-5" />
                        ) : (
                            <Menu className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Chapters */}
                <aside
                    className={`${leftSidebarOpen
                        ? "fixed inset-0 z-40 lg:relative pt-16 lg:pt-0"
                        : "hidden"
                        } lg:block w-full lg:w-64 bg-[#0d0d0d] border-r border-gray-800 overflow-y-auto flex-shrink-0`}
                >
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-white font-semibold">Documentation</h2>
                        </div>

                        {/* Generate Documentation Button */}
                        {docState.chapters.length === 0 && !docState.isGenerating && (
                            <button
                                onClick={generateDocumentation}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-medium transition mb-4 cursor-pointer"
                            >
                                <Sparkles className="w-4 h-4" />
                                Generate with AI
                            </button>
                        )}

                        {/* Loading State - Outline Generation */}
                        {docState.isGenerating && (
                            <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Generating outline...</span>
                            </div>
                        )}

                        {/* Loading State - Content Generation */}
                        {docState.isGeneratingContent && (
                            <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-3 mb-4">
                                <div className="flex items-center gap-2 text-purple-300 text-sm mb-1">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Generating content...</span>
                                </div>
                                {docState.currentGeneratingChapter && (
                                    <p className="text-purple-400 text-xs truncate">
                                        {docState.currentGeneratingChapter}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Error State */}
                        {docState.error && (
                            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-4">
                                <p className="text-red-400 text-sm">{docState.error}</p>
                                <button
                                    onClick={generateDocumentation}
                                    className="text-red-300 text-sm underline mt-2 cursor-pointer"
                                >
                                    Try again
                                </button>
                            </div>
                        )}

                        {/* Generated Chapters */}
                        {docState.chapters.length > 0 && renderChapters(docState.chapters)}
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a]">
                    <div className="max-w-4xl mx-auto">{renderContent()}</div>
                </main>

                {/* Right Sidebar - File Structure */}
                <aside
                    className={`${rightSidebarOpen
                        ? "fixed inset-0 z-40 lg:relative pt-16 lg:pt-0"
                        : "hidden"
                        } lg:block w-full lg:w-72 bg-[#0d0d0d] border-l border-gray-800 overflow-y-auto flex-shrink-0`}
                >
                    <div className="p-4">
                        <h2 className="text-white font-semibold mb-2">Project Structure</h2>
                        <p className="text-gray-500 text-xs mb-4">
                            {stats.fileCount} files, {stats.folderCount} folders
                        </p>
                        {renderFileTree(repoInfo.tree)}
                    </div>
                </aside>
            </div>
        </div>
    );
}
