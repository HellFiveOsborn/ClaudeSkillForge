'use client';

import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Github, Download, FileArchive, Loader2, CheckCircle2, AlertCircle, Send, Bot, User, Settings, X } from 'lucide-react';

const EXAMPLES = [
  { name: 'React', url: 'https://github.com/facebook/react' },
  { name: 'Next.js', url: 'https://github.com/vercel/next.js' },
  { name: 'TailwindCSS', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'LangChain', url: 'https://github.com/langchain-ai/langchain' },
  { name: 'Express', url: 'https://github.com/expressjs/express' },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'analyzing' | 'success' | 'error'>('idle');
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [skillMarkdown, setSkillMarkdown] = useState('');
  const [repoName, setRepoName] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-flash-lite-latest');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const savedModel = localStorage.getItem('claude-skill-forge-model');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    const savedKey = localStorage.getItem('claude-skill-forge-apikey');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('claude-skill-forge-model', model);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('claude-skill-forge-apikey', key);
  };

  const handleGenerate = async (targetUrl = url) => {
    if (!targetUrl) return;

    try {
      setStatus('fetching');
      setLoadingStep(1);
      setError('');
      setSkillMarkdown('');

      // 1. Fetch repo data
      const res = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch repository data');
      }

      const repoData = await res.json();
      setRepoName(repoData.metadata.name);
      setLoadingStep(2);

      // 2. Prepare prompt for Gemini
      setStatus('analyzing');
      setLoadingStep(3);

      const prompt = `
You are an expert software architect and technical writer. Your task is to analyze the provided GitHub repository data and generate a comprehensive, ready-to-use SKILL.md file for Claude Code.

Repository Name: ${repoData.metadata.name}
Description: ${repoData.metadata.description}
Language: ${repoData.metadata.language}

README Content:
${repoData.readme.substring(0, 15000)} // Truncated for context limits

Key Files Content:
${repoData.files.map((f: any) => `--- ${f.path} ---\n${f.content.substring(0, 5000)}`).join('\n\n')}

Based on this information, generate a SKILL.md file following EXACTLY this structure:

---
name: use-${repoData.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
description: A brief description of what this skill does and when to invoke it (e.g., /use-${repoData.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}).
---

# ${repoData.metadata.name} Skill

## Overview
[Provide a high-level overview of the library/framework]

## Installation
[How to install it]

## Basic Usage
[Provide basic code examples]

## Advanced Features / API
[Highlight key advanced features or API methods]

## Common Patterns and Best Practices
[List best practices based on the repo's docs or common usage]

## Examples Extracted from Repo
[Include 1-2 concrete examples found in the provided files]

## Tips for Claude
[Instructions on how Claude should respond or behave when this skill is invoked. E.g., "When asked about X, always use pattern Y."]

IMPORTANT: Output ONLY the raw Markdown content. Do not include any conversational text before or after the Markdown block. Do not wrap it in \`\`\`markdown unless it's part of the file itself.
`;

      const ai = new GoogleGenAI({ apiKey: apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          temperature: 0.2,
        }
      });

      let generatedText = response.text || '';
      
      // Clean up potential markdown code block wrapping
      if (generatedText.startsWith('```markdown')) {
        generatedText = generatedText.replace(/^```markdown\n/, '').replace(/\n```$/, '');
      } else if (generatedText.startsWith('```')) {
        generatedText = generatedText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      setSkillMarkdown(generatedText);
      setStatus('success');
      setLoadingStep(4);
      setChatHistory([{ role: 'model', text: 'Skill generated successfully! Let me know if you want to modify anything (e.g., "add more examples", "make the description shorter").' }]);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred');
      setStatus('error');
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([skillMarkdown], { type: 'text/markdown;charset=utf-8' });
    saveAs(blob, 'SKILL.md');
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const folderName = `use-${repoName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const folder = zip.folder(folderName);
    if (folder) {
      folder.file('SKILL.md', skillMarkdown);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;

    try {
      setIsChatting(true);
      setError('');

      const userMessage = chatInput;
      setChatInput('');
      setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);

      const prompt = `
You are an expert software architect and technical writer. 
Here is the current SKILL.md file for the repository ${repoName}:

\`\`\`markdown
${skillMarkdown}
\`\`\`

The user has requested the following modification:
"${userMessage}"

Please provide the updated SKILL.md file incorporating these changes. 
IMPORTANT: Output ONLY the raw Markdown content. Do not include any conversational text before or after the Markdown block. Do not wrap it in \`\`\`markdown unless it's part of the file itself.
`;

      const ai = new GoogleGenAI({ apiKey: apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          temperature: 0.2,
        }
      });

      let generatedText = response.text || '';
      
      if (generatedText.startsWith('```markdown')) {
        generatedText = generatedText.replace(/^```markdown\n/, '').replace(/\n```$/, '');
      } else if (generatedText.startsWith('```')) {
        generatedText = generatedText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      setSkillMarkdown(generatedText);
      setChatHistory(prev => [...prev, { role: 'model', text: 'SKILL.md updated successfully based on your request.' }]);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while updating the skill.');
      setChatHistory(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error while updating the skill.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Github className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">ClaudeSkillForge</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-sm text-zinc-500 font-medium">
              Generate SKILL.md for Claude Code
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        {/* Hero Section */}
        <section className="text-center space-y-6 max-w-2xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-bold tracking-tight text-indigo-600">
            Claude Skill
          </h2>
          <p className="text-lg text-zinc-600 leading-relaxed max-w-xl mx-auto">
            Paste a public GitHub repository URL, and we&apos;ll extract the essential documentation, code examples, and patterns to generate a ready-to-use SKILL.md file for Claude Code.
          </p>

          {/* Input Area */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4 items-center justify-center">
            <div className="flex-1 w-full max-w-md bg-zinc-200/60 p-1.5 rounded-xl">
              <input
                type="url"
                placeholder="https://github.com/ggml-org/llama.cpp/"
                className="w-full h-12 px-4 rounded-lg border-none focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-zinc-700 bg-white"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                disabled={status === 'fetching' || status === 'analyzing'}
              />
            </div>
            <button
              onClick={() => handleGenerate()}
              disabled={!url || status === 'fetching' || status === 'analyzing'}
              className="h-[60px] px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {(status === 'fetching' || status === 'analyzing') ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Generate Skill'
              )}
            </button>
          </div>

          {/* Examples */}
          <div className="pt-6">
            <p className="text-sm text-zinc-500 font-medium mb-3">Or try a popular repository:</p>
            <div className="flex flex-wrap justify-center gap-3">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  onClick={() => {
                    setUrl(ex.url);
                    handleGenerate(ex.url);
                  }}
                  disabled={status === 'fetching' || status === 'analyzing'}
                  className="px-5 py-2 text-sm bg-white border border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50 text-zinc-600 rounded-full transition-colors disabled:opacity-50"
                >
                  {ex.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Status / Loading Area */}
        {(status !== 'idle' && status !== 'error') && (
          <section className="max-w-2xl mx-auto">
            <div className="bg-zinc-200/60 p-2 rounded-2xl">
              <div className="bg-white p-6 rounded-xl space-y-6">
                <div className="flex items-center justify-between text-sm font-medium text-indigo-600">
                  <span className={loadingStep >= 1 ? 'opacity-100' : 'opacity-40'}>1. Fetching repo</span>
                  <span className={loadingStep >= 2 ? 'opacity-100' : 'opacity-40'}>2. Extracting</span>
                  <span className={loadingStep >= 3 ? 'opacity-100' : 'opacity-40'}>3. Analyzing</span>
                  <span className={loadingStep >= 4 ? 'opacity-100' : 'opacity-40'}>4. Done</span>
                </div>
                <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-500 ease-out"
                    style={{ width: `${(loadingStep / 4) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Error Alert */}
        {status === 'error' && (
          <section className="max-w-2xl mx-auto">
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium">Generation Failed</h3>
                <p className="text-sm mt-1 opacity-90">{error}</p>
              </div>
            </div>
          </section>
        )}

        {/* Result Area */}
        {status === 'success' && skillMarkdown && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                Skill Generated Successfully
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadMarkdown}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium rounded-lg transition-colors shadow-sm text-sm"
                >
                  <Download className="w-4 h-4" />
                  SKILL.md
                </button>
                <button
                  onClick={handleDownloadZip}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm text-sm"
                >
                  <FileArchive className="w-4 h-4" />
                  Download ZIP
                </button>
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs font-mono text-zinc-500 ml-2">SKILL.md Preview</span>
              </div>
              <div className="p-6 md:p-8 overflow-auto max-h-[600px] prose prose-zinc prose-indigo max-w-none">
                <ReactMarkdown>{skillMarkdown}</ReactMarkdown>
              </div>
            </div>

            {/* Chat Interface */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[400px]">
              <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-3 flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium text-zinc-700">Skill Refinement Chat</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-zinc-100 text-zinc-600'}`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-zinc-100 text-zinc-800 rounded-tl-none'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl bg-zinc-100 text-zinc-800 rounded-tl-none flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-white border-t border-zinc-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="E.g., Make the description shorter, add more examples..."
                    className="flex-1 h-10 px-4 rounded-lg border border-zinc-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                    disabled={isChatting}
                  />
                  <button
                    onClick={handleChat}
                    disabled={!chatInput.trim() || isChatting}
                    className="h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Settings Dialog */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-400 hover:text-zinc-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900">Gemini Model</label>
                <select 
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm text-zinc-700 bg-white"
                >
                  <option value="gemini-flash-lite-latest">Gemini Flash Lite (Cheapest/Fastest)</option>
                  <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (Recommended)</option>
                  <option value="gemini-flash-latest">Gemini Flash Latest</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (Advanced)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Legacy)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-900">API Key</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm text-zinc-700 bg-white"
                />
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Your API key is saved locally in your browser&apos;s localStorage. If left blank, the platform&apos;s default key will be used (if available).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
