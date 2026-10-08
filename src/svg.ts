// A minimal SVG tree. The renderer builds it once; tests turn it into a string
// (snapshots), the view into DOM nodes, so no markup is ever parsed.

export const SVG_NS = "http://www.w3.org/2000/svg";

export interface SvgNode {
  tag: string;
  attrs: Record<string, string | number>;
  children: SvgNode[];
}

export function h(tag: string, attrs: Record<string, string | number> = {}, children: SvgNode[] = []): SvgNode {
  return { tag, attrs, children };
}

export function toSvgString(node: SvgNode, indent = ""): string {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => ` ${name}="${escape(String(value))}"`)
    .join("");
  if (node.children.length === 0) return `${indent}<${node.tag}${attrs}/>`;
  const children = node.children.map((child) => toSvgString(child, indent + "  ")).join("\n");
  return `${indent}<${node.tag}${attrs}>\n${children}\n${indent}</${node.tag}>`;
}

export function toDom(node: SvgNode, doc: Document = document): SVGElement {
  const element = doc.createElementNS(SVG_NS, node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    // The namespace comes from createElementNS.
    if (name !== "xmlns") element.setAttribute(name, String(value));
  }
  for (const child of node.children) element.appendChild(toDom(child, doc));
  return element;
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
