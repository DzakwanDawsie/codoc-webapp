import { NextRequest, NextResponse } from "next/server";
import { sendToGroq } from "../groq-client";

interface FileInfo {
    path: string;
    content: string;
}

interface Chapter {
    id: string;
    title: string;
    description?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { repoName, chapter, files } = body as {
            repoName: string;
            chapter: Chapter;
            files: FileInfo[];
        };

        if (!repoName || !chapter) {
            return NextResponse.json(
                { error: "Repository name and chapter are required" },
                { status: 400 }
            );
        }

        // Build context from files
        const fileContext = files
            ?.map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
            .join("\n\n") || "No specific files provided.";

        const prompt = `Generate detailed documentation content for the chapter "${chapter.title}" of the "${repoName}" project.

        Chapter description: ${chapter.description || "No description provided"}

        Relevant source code files:

        ${fileContext}

        Write comprehensive documentation in Markdown format that:
        1. Explains concepts clearly for developers
        2. Includes code examples where relevant
        3. Provides step-by-step instructions when applicable
        4. Uses proper markdown formatting (headers, code blocks, lists)
        5. Is practical and actionable

        Write the documentation content directly, starting with a brief introduction to this section.
        Do NOT include the chapter title as a header (it will be added separately).
        Write in English.`;

        const result = await sendToGroq({
            messages: [
                {
                    role: "system",
                    content: "You are a technical documentation writer. Write clear, helpful documentation in Markdown format.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.5,
            max_tokens: 4000,
        });

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            content: result.content,
            chapterId: chapter.id,
        });
    } catch (error) {
        console.error("Generate Content Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
