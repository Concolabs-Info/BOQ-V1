import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*/g;
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index}`;
    if (match[1]) nodes.push(<strong key={key}>{match[1]}</strong>);
    else if (match[2] && match[3]) {
      nodes.push(
        <a key={key} href={match[3]}>
          {match[2]}
        </a>,
      );
    } else if (match[4]) nodes.push(<em key={key}>{match[4]}</em>);
    last = match.index + match[0].length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isList(block: string, marker: RegExp) {
  const lines = block.split(/\r?\n/).filter((line) => line.trim());
  return lines.length > 0 && lines.every((line) => marker.test(line.trim()));
}

export function MarkdownDoc({ markdown }: { markdown: string }) {
  const blocks = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.startsWith("### ")) {
          return <h3 key={index}>{renderInline(block.slice(4), `h3-${index}`)}</h3>;
        }
        if (block.startsWith("## ")) {
          return <h2 key={index}>{renderInline(block.slice(3), `h2-${index}`)}</h2>;
        }
        if (block.startsWith("# ")) {
          return <h2 key={index}>{renderInline(block.slice(2), `h1-${index}`)}</h2>;
        }
        if (isList(block, /^[-*] /)) {
          const items = block.split(/\r?\n/).filter((line) => line.trim());
          return (
            <ul key={index}>
              {items.map((line, itemIndex) => (
                <li key={itemIndex}>{renderInline(line.trim().replace(/^[-*] /, ""), `ul-${index}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        if (isList(block, /^\d+\. /)) {
          const items = block.split(/\r?\n/).filter((line) => line.trim());
          return (
            <ol key={index}>
              {items.map((line, itemIndex) => (
                <li key={itemIndex}>{renderInline(line.trim().replace(/^\d+\. /, ""), `ol-${index}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }
        if (/^Last updated\b/i.test(block)) {
          return (
            <p key={index} className="text-xs leading-5 text-slate-500">
              {renderInline(block.replace(/\s*\n\s*/g, " "), `p-${index}`)}
            </p>
          );
        }
        return <p key={index}>{renderInline(block.replace(/\s*\n\s*/g, " "), `p-${index}`)}</p>;
      })}
    </>
  );
}
