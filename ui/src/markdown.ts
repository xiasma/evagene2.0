// Zero-dependency Markdown to HTML renderer
// Supports: **bold**, *italic*, # headings, - lists, 1. ordered, [links](url), paragraphs

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text: string): string {
  let result = escapeHtml(text);
  // Bold: **text**
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic: *text*
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  return result;
}

export function renderMarkdown(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*]\s+/)) {
      out.push("<ul>");
      while (i < lines.length && lines[i].match(/^\s*[-*]\s+/)) {
        const content = lines[i].replace(/^\s*[-*]\s+/, "");
        out.push(`<li>${inlineMarkdown(content)}</li>`);
        i++;
      }
      out.push("</ul>");
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s+/)) {
      out.push("<ol>");
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        const content = lines[i].replace(/^\s*\d+\.\s+/, "");
        out.push(`<li>${inlineMarkdown(content)}</li>`);
        i++;
      }
      out.push("</ol>");
      continue;
    }

    // Paragraph: collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].match(/^\s*[-*]\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${inlineMarkdown(paraLines.join(" "))}</p>`);
    }
  }

  return out.join("\n");
}
