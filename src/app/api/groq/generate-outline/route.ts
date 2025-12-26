import { NextRequest, NextResponse } from "next/server";
import { sendToGroq } from "../groq-client";

interface FileInfo {
    path: string;
    content: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { repoName, files } = body as { repoName: string; files: FileInfo[] };

        if (!repoName || !files || files.length === 0) {
            return NextResponse.json(
                { error: "Repository name and files are required" },
                { status: 400 }
            );
        }

        // Build context from files
        const fileContext = files
            .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``)
            .join("\n\n");

        const prompt = `Analyze this repository "${repoName}" and generate a documentation outline.

        Based on these key files:

        ${fileContext}

        Generate a JSON array of documentation chapters. Each chapter should have:
        - id: a unique slug (e.g., "getting-started")
        - title: human-readable title
        - description: brief description of what this chapter covers
        - children: optional array of sub-chapters with same structure (id, title, description)

        Focus on practical documentation that helps developers understand and use this project.
        Include chapters like: Getting Started, Installation, Project Structure, Key Features, API Reference, Configuration, etc.

        IMPORTANT: Return ONLY valid JSON array, no markdown, no explanation.

        Example format:
        [
        {
            "id": "getting-started",
            "title": "Getting Started",
            "description": "Introduction and quick start guide",
            "children": [
            {"id": "installation", "title": "Installation", "description": "How to install"},
            {"id": "quick-start", "title": "Quick Start", "description": "First steps"}
            ]
        }
        ]`;

        const result = await sendToGroq({
            messages: [
                {
                    role: "system",
                    content: "You are a technical documentation expert. Generate structured documentation outlines in JSON format only.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.3,
            max_tokens: 2000,
        });

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            );
        }

        // Parse JSON from response (handle potential markdown wrapping)
        let chapters;
        try {
            const content = result.content!;
            // Try to extract JSON from markdown code blocks if present
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
            chapters = JSON.parse(jsonStr);
        } catch {
            console.error("Failed to parse Groq response:", result.content);
            throw new Error("Failed to parse documentation outline");
        }

        return NextResponse.json({
            success: true,
            chapters,
        });
    } catch (error) {
        console.error("Generate Outline Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
