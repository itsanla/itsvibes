import { isValidElement, memo, type ReactNode, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { isFilePath, splitPaths } from '../lib/filepaths'
import { FileChip, Linkified } from './FileLinks'
import { I, copyText } from './ui'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

// blok kode dengan label bahasa dan tombol salin
export function CodeBlock({ lang, text, children, err }: { lang?: string; text: string; children?: ReactNode; err?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className={`iv-pre${lang ? ' has-lbl' : ''}`}>
      {lang ? <span className="lbl">{lang}</span> : null}
      <button
        className="iv-copy"
        title="Salin"
        onClick={() => {
          copyText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }}
      >
        <I n={done ? 'check' : 'copy'} s={15} />
      </button>
      <pre className={err ? 'err' : undefined}>{children ?? <Linkified text={text} />}</pre>
    </div>
  )
}

function Pre({ children }: { children?: ReactNode }) {
  const cls = isValidElement(children) ? (children.props as { className?: string }).className : undefined
  const lang = /language-([\w-]+)/.exec(cls ?? '')?.[1]
  const text = textOf(children).replace(/\n$/, '')
  return <CodeBlock lang={lang} text={text}>{lang ? children : undefined}</CodeBlock>
}

// path gambar/PDF di teks atau kode inline jadi tautan ke drawer pratinjau
type Node = { type: string; value?: string; url?: string; children?: Node[] }
function linkPaths(node: Node) {
  if (!node.children || node.type === 'link' || node.type === 'code') return
  const next: Node[] = []
  for (const ch of node.children) {
    if (ch.type === 'text' && ch.value) {
      for (const p of splitPaths(ch.value)) next.push(typeof p === 'string' ? { type: 'text', value: p } : { type: 'link', url: 'ivfile:' + p.path, children: [{ type: 'text', value: p.path }] })
    } else if (ch.type === 'inlineCode' && ch.value && isFilePath(ch.value)) {
      next.push({ type: 'link', url: 'ivfile:' + ch.value, children: [ch] })
    } else {
      linkPaths(ch)
      next.push(ch)
    }
  }
  node.children = next
}
const remarkFilePaths = () => (tree: Node) => linkPaths(tree)

const components = {
  pre: Pre,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => {
    if (href?.startsWith('ivfile:')) return <FileChip path={href.slice(7)}>{children}</FileChip>
    if (href && isFilePath(href)) return <FileChip path={href}>{children}</FileChip>
    return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
  },
  table: ({ children }: { children?: ReactNode }) => <div className="tbl"><table>{children}</table></div>,
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="iv-md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkFilePaths]} urlTransform={u => (u.startsWith('ivfile:') ? u : defaultUrlTransform(u))} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
