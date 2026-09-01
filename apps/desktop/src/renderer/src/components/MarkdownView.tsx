import { memo, useMemo, type ReactNode } from 'react'
import {
  parseMarkdown,
  type BlockNode,
  type InlineNode
} from '../lib/markdown'
import { hrefToLocalPath } from '../lib/file-href'
import { useFilePreview } from './FilePreview'
import { useTipFor } from './HoverTip'

export const MarkdownView = memo(function MarkdownView({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  if (blocks.length === 0) return null
  return <div className="md">{blocks.map((block, index) => renderMarkdownBlock(block, index))}</div>
})

export function renderMarkdownBlock(block: BlockNode, key: number): ReactNode {
  switch (block.type) {
    case 'h': {
      const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4')
      return (
        <Tag key={key} className={`md-h md-h${block.level}`}>
          {renderInline(block.children)}
        </Tag>
      )
    }
    case 'p':
      return (
        <p key={key} className="md-p">
          {renderInline(block.children)}
        </p>
      )
    case 'ul':
      return (
        <ul key={key} className="md-ul">
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} className="md-ol">
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ol>
      )
    case 'pre':
      return (
        <pre key={key} className="md-pre" data-lang={block.lang}>
          <code>{block.text}</code>
        </pre>
      )
    case 'quote':
      return (
        <blockquote key={key} className="md-quote">
          {renderInline(block.children)}
        </blockquote>
      )
    case 'hr':
      return <hr key={key} className="md-hr" />
    case 'table':
      return (
        <div key={key} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.heads.map((cell, index) => (
                  <th key={index}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

function renderInline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return node.value
      case 'code':
        return (
          <code key={index} className="md-code">
            {node.value}
          </code>
        )
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>
      case 'link':
        return (
          <MdLink key={index} href={node.href}>
            {renderInline(node.children)}
          </MdLink>
        )
    }
  })
}

/** 单独成组件才能挂 hook：链接文案通常是短标题，完整 URL 交给 tooltip */
function MdLink({ href, children }: { href: string; children: ReactNode }) {
  const tip = useTipFor(href)
  const preview = useFilePreview()
  const local = hrefToLocalPath(href)
  if (local && preview) {
    return (
      <a
        className="md-link"
        href={safeHref(href)}
        {...tip}
        onClick={(event) => {
          event.preventDefault()
          preview.open(local)
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <a className="md-link" href={safeHref(href)} target="_blank" rel="noreferrer" {...tip}>
      {children}
    </a>
  )
}

function safeHref(href: string): string {
  const trimmed = href.trim()
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed
  if (/^file:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    const normalized = trimmed.replace(/\\/g, '/')
    return `file://${normalized}`
  }
  return '#'
}
