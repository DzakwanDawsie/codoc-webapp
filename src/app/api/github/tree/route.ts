import { NextRequest, NextResponse } from "next/server";

interface GitHubTreeItem {
    path: string;
    mode: string;
    type: "blob" | "tree" | "commit";
    sha: string;
    size?: number;
}

interface GitHubTreeResponse {
    sha: string;
    url: string;
    tree: GitHubTreeItem[];
    truncated: boolean;
}

interface FileNode {
    id: string;
    name: string;
    type: "file" | "folder";
    path: string;
    children?: FileNode[];
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    try {
        const parsedUrl = new URL(url);
        if (!parsedUrl.hostname.includes("github.com")) {
            return null;
        }
        const parts = parsedUrl.pathname.split("/").filter(Boolean);
        if (parts.length < 2) {
            return null;
        }
        return { owner: parts[0], repo: parts[1] };
    } catch {
        return null;
    }
}

function buildFileTree(items: GitHubTreeItem[]): FileNode[] {
    const root: FileNode[] = [];
    const nodeMap = new Map<string, FileNode>();

    // Sort items so folders come before files at the same level
    const sortedItems = [...items].sort((a, b) => {
        const aDepth = a.path.split("/").length;
        const bDepth = b.path.split("/").length;
        if (aDepth !== bDepth) return aDepth - bDepth;
        if (a.type === "tree" && b.type !== "tree") return -1;
        if (a.type !== "tree" && b.type === "tree") return 1;
        return a.path.localeCompare(b.path);
    });

    for (const item of sortedItems) {
        const pathParts = item.path.split("/");
        const name = pathParts[pathParts.length - 1];
        const parentPath = pathParts.slice(0, -1).join("/");

        const node: FileNode = {
            id: item.sha,
            name,
            type: item.type === "tree" ? "folder" : "file",
            path: item.path,
            children: item.type === "tree" ? [] : undefined,
        };

        nodeMap.set(item.path, node);

        if (parentPath === "") {
            root.push(node);
        } else {
            const parent = nodeMap.get(parentPath);
            if (parent && parent.children) {
                parent.children.push(node);
            }
        }
    }

    return root;
}

function getGitHubHeaders(): HeadersInit {
    const headers: HeadersInit = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "codoc-webapp",
    };

    const token = process.env.GITHUB_TOKEN;
    if (token && token !== "your_github_token_here") {
        headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { url } = body;

        if (!url) {
            return NextResponse.json(
                { error: "GitHub URL is required" },
                { status: 400 }
            );
        }

        const parsed = parseGitHubUrl(url);
        if (!parsed) {
            return NextResponse.json(
                { error: "Invalid GitHub URL" },
                { status: 400 }
            );
        }

        const { owner, repo } = parsed;
        const headers = getGitHubHeaders();

        // Get default branch
        const repoResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            { headers }
        );

        if (!repoResponse.ok) {
            if (repoResponse.status === 404) {
                return NextResponse.json(
                    { error: "Repository not found" },
                    { status: 404 }
                );
            }
            throw new Error(`GitHub API error: ${repoResponse.status}`);
        }

        const repoData = await repoResponse.json();
        const defaultBranch = repoData.default_branch;

        // Get branch info to get the tree SHA
        const branchResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/branches/${defaultBranch}`,
            { headers }
        );

        if (!branchResponse.ok) {
            throw new Error(`Failed to get branch info: ${branchResponse.status}`);
        }

        const branchData = await branchResponse.json();
        const treeSha = branchData.commit.commit.tree.sha;

        // Get the full tree recursively
        const treeResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
            { headers }
        );

        if (!treeResponse.ok) {
            throw new Error(`Failed to get tree: ${treeResponse.status}`);
        }

        const treeData: GitHubTreeResponse = await treeResponse.json();
        const fileTree = buildFileTree(treeData.tree);

        return NextResponse.json({
            success: true,
            owner,
            repo,
            branch: defaultBranch,
            tree: fileTree,
            truncated: treeData.truncated,
        });
    } catch (error) {
        console.error("GitHub API Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
