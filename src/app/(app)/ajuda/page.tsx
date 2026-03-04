import fs from 'fs';
import path from 'path';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Convert the plain-text help content (from inside ``` blocks) to HTML.
 *
 * Formatting conventions in the source:
 *   ===...===  → top-level title (skipped — we render our own heading)
 *   ---...---  → section divider (next non-blank line is the section title)
 *   ALL CAPS LINE (no leading whitespace, no special prefix) → subsection heading
 *   "  - text" → bullet item
 *   "    * text" → nested bullet item
 *   "  text"   → paragraph within a subsection
 *   blank line → separator
 */
function helpTextToHtml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;
  let inNestedList = false;

  const closeNestedList = () => {
    if (inNestedList) { out.push('</ul>'); inNestedList = false; }
  };
  const closeList = () => {
    closeNestedList();
    if (inList) { out.push('</ul>'); inList = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimEnd();

    // Skip ===...=== banner lines
    if (/^=+$/.test(trimmed)) continue;

    // Skip ---...--- divider lines, but emit the next non-blank line as a section heading
    if (/^-+$/.test(trimmed)) {
      closeList();
      // Find the next non-blank line for the section title
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length) {
        const title = lines[j].trim();
        // Skip the title line and any trailing ---...--- line
        i = j;
        if (i + 1 < lines.length && /^-+$/.test(lines[i + 1].trim())) i++;
        out.push(`<h2 class="text-lg font-bold mt-8 mb-3 text-primary border-b pb-2 font-headline">${escHtml(title)}</h2>`);
      }
      continue;
    }

    // Blank line
    if (trimmed === '') {
      closeList();
      continue;
    }

    // Top-level title inside ===...=== (already rendered as page heading — skip)
    if (/^[A-Z][A-Z\s\-—()\/]+$/.test(trimmed) && !trimmed.startsWith('  ') && trimmed.length > 3) {
      // Check if this looks like a subsection heading vs a standalone title
      // Subsection headings: all caps, no leading whitespace, length > 3
      // But the very first ALL-CAPS title (like "ENTOURAGE LAB - AJUDA...") should be skipped
      if (/^ENTOURAGE LAB/.test(trimmed)) continue;

      closeList();
      out.push(`<h3 class="text-base font-semibold mt-5 mb-2 font-headline">${escHtml(trimmed)}</h3>`);
      continue;
    }

    // Subsection heading with parenthetical info, e.g. "VENDAS (menu: Vendas | rota: /remessas)"
    if (/^[A-Z][A-Z\s]+\(/.test(trimmed) && !trimmed.startsWith('  ')) {
      closeList();
      const match = trimmed.match(/^([^(]+)\((.+)\)$/);
      if (match) {
        out.push(`<h3 class="text-base font-semibold mt-5 mb-1 font-headline">${escHtml(match[1].trim())}</h3>`);
        out.push(`<p class="text-xs text-muted-foreground mb-2">${escHtml(match[2].trim())}</p>`);
      } else {
        out.push(`<h3 class="text-base font-semibold mt-5 mb-2 font-headline">${escHtml(trimmed)}</h3>`);
      }
      continue;
    }

    // Sub-subsection label, e.g. "  Lista de Vendas:" or "  Nova Venda - Wizard de 3 Etapas:"
    if (/^  [A-Z][\w\s\-—éêíóãõçáàâ()\/]+:$/.test(trimmed)) {
      closeList();
      out.push(`<h4 class="text-sm font-semibold mt-4 mb-1">${escHtml(trimmed.trim())}</h4>`);
      continue;
    }

    // Indented sub-subsection, e.g. "    Etapa 1 - Identificacao"
    if (/^    [A-Z][\w\s\-—éêíóãõçáàâ()\/]+$/.test(trimmed) && !trimmed.trim().startsWith('-') && !trimmed.trim().startsWith('*')) {
      closeList();
      out.push(`<h4 class="text-sm font-semibold mt-3 mb-1 ml-2">${escHtml(trimmed.trim())}</h4>`);
      continue;
    }

    // Nested bullet "    * text" or "      * text"
    if (/^\s{4,}\*\s/.test(raw)) {
      if (!inList) { out.push('<ul class="list-disc ml-6 mb-2 space-y-0.5">'); inList = true; }
      if (!inNestedList) { out.push('<ul class="list-[circle] ml-4 space-y-0.5">'); inNestedList = true; }
      out.push(`<li class="text-sm">${escHtml(raw.replace(/^\s*\*\s*/, '').trim())}</li>`);
      continue;
    }

    // Bullet "  - text" or "    - text"
    if (/^\s{2,}-\s/.test(raw)) {
      closeNestedList();
      if (!inList) { out.push('<ul class="list-disc ml-6 mb-2 space-y-0.5">'); inList = true; }
      out.push(`<li class="text-sm">${escHtml(raw.replace(/^\s*-\s*/, '').trim())}</li>`);
      continue;
    }

    // Regular indented text (paragraph)
    closeList();
    out.push(`<p class="text-sm ml-2 mb-1">${escHtml(trimmed.trim())}</p>`);
  }

  closeList();
  return out.join('\n');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Extract the content between ``` delimiters for a given section number
 * in the help.md file.
 */
function extractSection(markdown: string, sectionNum: number): string {
  const sectionHeader = `## ${sectionNum}. `;
  const startIdx = markdown.indexOf(sectionHeader);
  if (startIdx === -1) return '';

  // Find the next ## header (or end of file)
  const nextSectionMatch = markdown.indexOf('\n## ', startIdx + sectionHeader.length);
  const sectionText = nextSectionMatch === -1
    ? markdown.slice(startIdx)
    : markdown.slice(startIdx, nextSectionMatch);

  // Extract content between ``` markers
  const codeBlockMatch = sectionText.match(/```\n?([\s\S]*?)```/);
  return codeBlockMatch ? codeBlockMatch[1] : '';
}

export default function AjudaPage() {
  const mdPath = path.join(process.cwd(), 'docs', 'help.md');
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  const section1Raw = extractSection(markdown, 1);
  const section2Raw = extractSection(markdown, 2);

  const section1Html = helpTextToHtml(section1Raw);
  const section2Html = helpTextToHtml(section2Raw);

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6 font-headline">Ajuda</h1>

      {/* Quick navigation */}
      <div className="flex gap-3 mb-6">
        <a
          href="#app-web"
          className="text-sm text-primary hover:underline font-medium"
        >
          Aplicativo Web
        </a>
        <span className="text-muted-foreground">|</span>
        <a
          href="#extensao-anvisa"
          className="text-sm text-primary hover:underline font-medium"
        >
          Extensão ANVISA Auto-Fill
        </a>
      </div>

      {/* Section 1: Ajuda do Aplicativo Web */}
      <Card className="mb-8" id="app-web">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold mb-4 text-primary font-headline">
            Ajuda do Aplicativo Web
          </h2>
          <div dangerouslySetInnerHTML={{ __html: section1Html }} />
        </CardContent>
      </Card>

      {/* Section 2: Ajuda da Extensão ANVISA Auto-Fill */}
      <Card id="extensao-anvisa">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold mb-4 text-primary font-headline">
            Ajuda da Extensão ANVISA Auto-Fill
          </h2>
          <div dangerouslySetInnerHTML={{ __html: section2Html }} />
          <div className="mt-6 pt-4 border-t flex flex-wrap items-center gap-4">
            <a
              href="/extensao-anvisa.zip"
              download
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Baixar Extensão (.zip)
            </a>
            <a
              href="https://github.com/mario-entourage/Anvisa_app/tree/main/extension"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
              Ver no GitHub
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
