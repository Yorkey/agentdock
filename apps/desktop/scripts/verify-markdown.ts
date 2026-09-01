import { parseInline, parseMarkdown } from '../src/renderer/src/lib/markdown.ts'

const sample = `全部完成。总结如下：

## 实施总结

- **udc-code-engine**（\`src/servers/generate-engine-next/factors/app/remote-entry-template.ts\`）：用 \`performance.now()\` 记录 \`page.load\`
- **runtime-core**：\`ENABLE_COMPONENT_PROXY_TRACK\`

### 指标 1 — 页面加载时长 page.load

详见 [remote-entry-template.ts](/Volumes/WY/seeyon-projects/udc-test/udc-code-engine/src/servers/generate-engine-next/factors/app/remote-entry-template.ts)。
`

const blocks = parseMarkdown(sample)
const types = blocks.map((block) => block.type)
if (types.join(',') !== 'p,h,ul,h,p') {
  throw new Error(`block types: ${types.join(',')}`)
}

const h2 = blocks[1]
if (h2?.type !== 'h' || h2.level !== 2) throw new Error('missing h2')
const ul = blocks[2]
if (ul?.type !== 'ul' || ul.items.length !== 2) throw new Error('list size')
const firstItem = ul.items[0] ?? []
const kinds = firstItem.map((node) => node.type)
if (!kinds.includes('strong') || !kinds.includes('code')) {
  throw new Error(`inline kinds: ${kinds.join(',')}`)
}
const p = blocks[4]
if (p?.type !== 'p') throw new Error('missing closing p')
const link = p.children.find((node) => node.type === 'link')
if (link?.type !== 'link' || !link.href.includes('remote-entry-template.ts')) {
  throw new Error('link not parsed')
}

const inline = parseInline('见 `page.load` 与 **runtime-core**')
if (inline.map((node) => node.type).join(',') !== 'text,code,text,strong') {
  throw new Error(`inline: ${inline.map((node) => node.type).join(',')}`)
}

const image = parseInline('见 ![截图](./shot.png) 与 [a.ts](src/a.ts)')
const imageLink = image.find((node) => node.type === 'link' && node.href === './shot.png')
const fileLink = image.find((node) => node.type === 'link' && node.href === 'src/a.ts')
if (!imageLink || !fileLink) throw new Error('image / file link not parsed')

console.log('ok: markdown headings / lists / strong / code / links')
