import { isValidElement, memo, type ReactNode, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
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
      <pre className={err ? 'err' : undefined}>{children ?? text}</pre>
    </div>
  )
}

function Pre({ children }: { children?: ReactNode }) {
  const cls = isValidElement(children) ? (children.props as { className?: string }).className : undefined
  const lang = /language-([\w-]+)/.exec(cls ?? '')?.[1]
  return <CodeBlock lang={lang} text={textOf(children).replace(/\n$/, '')}>{children}</CodeBlock>
}

const components = {
  pre: Pre,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
  table: ({ children }: { children?: ReactNode }) => <div className="tbl"><table>{children}</table></div>,
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="iv-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
