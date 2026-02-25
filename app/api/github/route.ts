import { NextResponse } from 'next/server';

const GITHUB_API_BASE = 'https://api.github.com';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Parse URL
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 });
    }

    const owner = match[1];
    let repo = match[2];
    // Remove trailing .git or slashes
    repo = repo.replace(/\.git$/, '').replace(/\/$/, '');

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ClaudeSkillForge',
    };

    // 1. Fetch metadata
    const metaRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers });
    if (!metaRes.ok) {
      return NextResponse.json({ error: 'Repository not found or API rate limit exceeded' }, { status: metaRes.status });
    }
    const metadata = await metaRes.json();

    // 2. Fetch README
    const readmeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`, { headers });
    let readme = '';
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json();
      readme = Buffer.from(readmeData.content, 'base64').toString('utf8');
    }

    // 3. Fetch default branch tree
    const defaultBranch = metadata.default_branch;
    const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
    let files: { path: string; content: string }[] = [];

    if (treeRes.ok) {
      const treeData = await treeRes.json();
      const tree = treeData.tree || [];

      // Filter key files
      const allowedExtensions = ['.md', '.json', '.ts', '.js', '.py', '.go', '.rs', '.tsx', '.jsx', '.yaml', '.yml'];
      const ignoredDirs = ['node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'public', 'assets', 'images'];

      const keyFiles = tree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        if (item.size > 80000) return false; // Ignore files > 80KB

        const pathParts = item.path.split('/');
        if (pathParts.some((part: string) => ignoredDirs.includes(part))) return false;

        const ext = item.path.substring(item.path.lastIndexOf('.'));
        if (!allowedExtensions.includes(ext)) return false;

        return true;
      });

      // Prioritize package.json, docs, examples, main source files
      keyFiles.sort((a: any, b: any) => {
        const aScore = getFileScore(a.path);
        const bScore = getFileScore(b.path);
        return bScore - aScore;
      });

      const selectedFiles = keyFiles.slice(0, 15);

      // Fetch content for selected files
      const filePromises = selectedFiles.map(async (file: any) => {
        const fileRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file.path}`);
        if (fileRes.ok) {
          const content = await fileRes.text();
          return {
            path: file.path,
            content,
          };
        }
        return null;
      });

      const fetchedFiles = await Promise.all(filePromises);
      files = fetchedFiles.filter(Boolean) as { path: string; content: string }[];
    }

    return NextResponse.json({
      metadata: {
        name: metadata.name,
        description: metadata.description,
        stars: metadata.stargazers_count,
        language: metadata.language,
      },
      readme,
      files,
    });

  } catch (error: any) {
    console.error('GitHub API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

function getFileScore(path: string): number {
  let score = 0;
  const lowerPath = path.toLowerCase();
  if (lowerPath === 'package.json') score += 100;
  if (lowerPath.includes('readme')) score += 50;
  if (lowerPath.includes('doc')) score += 40;
  if (lowerPath.includes('example')) score += 30;
  if (lowerPath.includes('src/index') || lowerPath.includes('src/main')) score += 20;
  if (lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx')) score += 10;
  return score;
}
