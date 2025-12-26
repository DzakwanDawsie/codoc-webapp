"use client";

import { useState } from "react";
import { GithubForm } from "./components/GithubForm";
import { DocumentationLayout } from "./components/DocumentationLayout";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
}

export interface RepoInfo {
  url: string;
  owner: string;
  repo: string;
  branch: string;
  tree: FileNode[];
}

export default function Home() {
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (url: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/tree", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch repository");
      }

      setRepoInfo({
        url,
        owner: data.owner,
        repo: data.repo,
        branch: data.branch,
        tree: data.tree,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setRepoInfo(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {!repoInfo ? (
        <GithubForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          error={error}
        />
      ) : (
        <DocumentationLayout
          repoInfo={repoInfo}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
