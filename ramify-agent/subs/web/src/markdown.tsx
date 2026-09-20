import ReactMarkdown from 'react-markdown';

interface MarkdownNode {
  type: string;
  value?: string;
  lang?: string | null;
  meta?: string | null;
  children?: MarkdownNode[];
}

const blockContainers = new Set(['root', 'blockquote', 'listItem']);

/**
 * A remark plugin that turns embedded HTML into visible text: a block of HTML
 * becomes a code block, inline HTML plain text. Nothing written as HTML in a
 * plan reaches the page as markup, so nothing in it can execute.
 */
function htmlAsText() {
  return (tree: object): void => rewrite(tree as MarkdownNode);
}

function rewrite(node: MarkdownNode): void {
  for (const child of node.children ?? []) {
    if (child.type === 'html') {
      if (blockContainers.has(node.type)) Object.assign(child, { type: 'code', lang: null, meta: null });
      else child.type = 'text';
    } else rewrite(child);
  }
}

/**
 * Renders a plan's Markdown read-only. Embedded HTML is shown as text and
 * link and image URLs pass react-markdown's safe-protocol filter.
 */
export function Markdown({ source }: { readonly source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[htmlAsText]} skipHtml={false}>{source}</ReactMarkdown>
    </div>
  );
}
