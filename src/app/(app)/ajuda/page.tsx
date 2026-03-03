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
        out.push(`<h2 class="text-lg font-bold mt-8 mb-3 text-primary border-b pb-2">${escHtml(title)}</h2>`);
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
      out.push(`<h3 class="text-base font-semibold mt-5 mb-2">${escHtml(trimmed)}</h3>`);
      continue;
    }

    // Subsection heading with parenthetical info, e.g. "VENDAS (menu: Vendas | rota: /remessas)"
    if (/^[A-Z][A-Z\s]+\(/.test(trimmed) && !trimmed.startsWith('  ')) {
      closeList();
      const match = trimmed.match(/^([^(]+)\((.+)\)$/);
      if (match) {
        out.push(`<h3 class="text-base font-semibold mt-5 mb-1">${escHtml(match[1].trim())}</h3>`);
        out.push(`<p class="text-xs text-muted-foreground mb-2">${escHtml(match[2].trim())}</p>`);
      } else {
        out.push(`<h3 class="text-base font-semibold mt-5 mb-2">${escHtml(trimmed)}</h3>`);
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
      <h1 className="text-3xl font-bold mb-6">Ajuda</h1>

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
          <h2 className="text-xl font-bold mb-4 text-primary">
            Ajuda do Aplicativo Web
          </h2>
          <div dangerouslySetInnerHTML={{ __html: section1Html }} />
        </CardContent>
      </Card>

      {/* Section 2: Ajuda da Extensão ANVISA Auto-Fill */}
      <Card id="extensao-anvisa">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold mb-4 text-primary">
            Ajuda da Extensão ANVISA Auto-Fill
          </h2>
          <div dangerouslySetInnerHTML={{ __html: section2Html }} />
        </CardContent>
      </Card>
    </div>
  );
}
