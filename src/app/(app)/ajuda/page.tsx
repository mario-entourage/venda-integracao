import fs from 'fs';
import path from 'path';
import { Card, CardContent } from '@/components/ui/card';

export default function AjudaPage() {
  const mdPath = path.join(process.cwd(), 'docs', 'help.md');
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  // Simple markdown-to-HTML conversion for our doc format
  const html = markdown
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3 text-primary border-b pb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mb-4 text-primary">$1</h1>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-6 border-border" />')
    // Code blocks (```)
    .replace(/```[\s\S]*?```/g, (match) => {
      const content = match.slice(3, -3).replace(/^\w*\n?/, '');
      return `<pre class="bg-muted rounded-lg p-4 overflow-x-auto text-sm my-4 whitespace-pre-wrap font-mono leading-relaxed">${content}</pre>`;
    })
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')
    // Lists
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Paragraphs (non-empty lines that aren't already HTML)
    .replace(/^(?!<[hHlupra])(.+)$/gm, (_, content) => {
      const trimmed = content.trim();
      if (!trimmed || trimmed.startsWith('<')) return content;
      return `<p class="my-1">${trimmed}</p>`;
    });

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Ajuda</h1>
      <Card>
        <CardContent className="prose prose-sm max-w-none p-6">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </CardContent>
      </Card>
    </div>
  );
}
