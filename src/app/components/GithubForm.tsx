"use client";

import { useState } from "react";
import { Github, FileCode, Loader2 } from "lucide-react";
import Image from "next/image";

interface GithubFormProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export function GithubForm({ onSubmit, isLoading, error }: GithubFormProps) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onSubmit(url);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6">
            <Image
              src="/logo.png"
              alt="Code Documentator Logo"
              width={80}
              height={80}
              className="rounded-2xl"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Code Documentator
          </h1>
          <p className="text-gray-400 text-lg">
            Enter your GitHub project link to generate code documentation.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="github-url"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Link GitHub Repository
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Github className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="url"
                id="github-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/username/repository"
                className="block w-full pl-12 pr-4 py-4 bg-[#1a1a1a] border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#114541] focus:border-transparent transition disabled:opacity-50"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#114541] hover:bg-[#1a5a55] disabled:bg-[#0d3330] disabled:cursor-not-allowed text-white font-medium py-4 px-6 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading Repository...
              </>
            ) : (
              <>
                <FileCode className="w-5 h-5" />
                Generate Documentation
              </>
            )}
          </button>
        </form>

        {/* Example Repositories */}
        <div className="mt-12 p-6 bg-[#1a1a1a] border border-gray-800 rounded-xl">
          <h3 className="text-white font-medium mb-3">Example Repository:</h3>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setUrl("https://github.com/facebook/react")}
              disabled={isLoading}
              className="w-full text-left px-4 py-2 text-gray-400 hover:text-emerald-400 hover:bg-[#252525] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition text-sm cursor-pointer"
            >
              https://github.com/facebook/react
            </button>
            <button
              type="button"
              onClick={() => setUrl("https://github.com/vercel/next.js")}
              disabled={isLoading}
              className="w-full text-left px-4 py-2 text-gray-400 hover:text-emerald-400 hover:bg-[#252525] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition text-sm cursor-pointer"
            >
              https://github.com/vercel/next.js
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
