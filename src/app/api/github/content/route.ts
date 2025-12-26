import { NextRequest, NextResponse } from "next/server";

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
        const { url, path, branch } = body;

        if (!url || !path) {
            return NextResponse.json(
                { error: "GitHub URL and file path are required" },
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
        const ref = branch || "main";

        // Fetch file content from GitHub
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
            { headers: getGitHubHeaders() }
        );

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json(
                    { error: "File not found" },
                    { status: 404 }
                );
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();

        // Check if it's a file (not directory)
        if (data.type !== "file") {
            return NextResponse.json(
                { error: "Path is not a file" },
                { status: 400 }
            );
        }

        // Get file extension for syntax highlighting
        const extension = path.split(".").pop()?.toLowerCase() || "";

        // Media file extensions
        const imageExtensions = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"];
        const videoExtensions = ["mp4", "webm", "mov", "avi", "mkv"];
        const pdfExtensions = ["pdf"];

        const isImage = imageExtensions.includes(extension);
        const isVideo = videoExtensions.includes(extension);
        const isPdf = pdfExtensions.includes(extension);
        const isMedia = isImage || isVideo || isPdf;

        // For media files, return raw URL instead of content
        if (isMedia) {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
            return NextResponse.json({
                success: true,
                name: data.name,
                path: data.path,
                size: data.size,
                extension,
                sha: data.sha,
                isMedia: true,
                mediaType: isImage ? "image" : isVideo ? "video" : "pdf",
                rawUrl,
            });
        }

        // Decode base64 content for text files
        let content: string;
        try {
            content = Buffer.from(data.content, "base64").toString("utf-8");
        } catch {
            return NextResponse.json(
                { error: "Unable to decode file content" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            name: data.name,
            path: data.path,
            size: data.size,
            content,
            extension,
            sha: data.sha,
            isMedia: false,
        });
    } catch (error) {
        console.error("GitHub Content API Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}