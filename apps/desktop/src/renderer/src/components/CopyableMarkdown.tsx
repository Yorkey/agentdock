import { useMemo } from 'react'
import { parseMarkdown } from '../lib/markdown'
import { CopyButton } from './CopyButton'
import { renderMarkdownBlock } from './MarkdownView'

/**
 * 整段正文一个复制按钮，每个代码块在 parse 出的 pre 上直接挂按钮，
 * 不再 mount 后再 querySelectorAll。
 */
export function CopyableMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className="copyable">
      {blocks.length > 0 ? (
        <div className="md">
          {blocks.map((block, index) =>
            block.type === 'pre' ? (
              <pre key={index} className="md-pre" data-lang={block.lang}>
                <CopyButton className="copy-btn copy-btn-code" text={block.text} title="复制代码" />
                <code>{block.text}</code>
              </pre>
            ) : (
              renderMarkdownBlock(block, index)
            )
          )}
        </div>
      ) : null}
      <CopyButton className="copy-btn copy-btn-body" text={text} title="复制这段回复" />
    </div>
  )
}
