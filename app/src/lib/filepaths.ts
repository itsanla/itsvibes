const EXT = 'png|jpe?g|webp|pdf'
// path absolut (/..., ~/...) atau relatif (a/b.png); tidak menangkap bagian dari URL
export const PATH_SRC = `(?:(?:~|\\.{1,2})?\\/[\\w.\\-@+/]*|[\\w.\\-@+]+(?:\\/[\\w.\\-@+]+)*)\\.(?:${EXT})(?![\\w/])`
export const NOT_AFTER = '(?<![\\w:/.~@+-])'
const FIND = new RegExp(`${NOT_AFTER}${PATH_SRC}`, 'gi')
const WHOLE = new RegExp(`^${PATH_SRC}$`, 'i')

export const isFilePath = (s: string) => WHOLE.test(s) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)
export const isPdf = (s: string) => /\.pdf$/i.test(s)

export type PathPart = string | { path: string }

export function splitPaths(text: string): PathPart[] {
  const out: PathPart[] = []
  let last = 0
  for (const m of text.matchAll(FIND)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push({ path: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// teks markdown: path (di teks, kode inline, atau tautan) menjadi tautan ivfile:, kecuali di dalam blok kode berpagar
const SCAN = new RegExp(`(\\[[^\\]\\n]*\\]\\(([^)\\s]*)\\))|(\`([^\`\\n]+)\`)|(${NOT_AFTER}${PATH_SRC})`, 'gi')
export function linkifyMarkdown(md: string): string {
  return md
    .split(/(^```[\s\S]*?^```)/m)
    .map((seg, i) => {
      if (i % 2 === 1) return seg
      return seg.replace(SCAN, (all, link: string | undefined, href: string | undefined, _code, inner: string | undefined, plain: string | undefined) => {
        if (link) return href && isFilePath(href) ? link.replace(`(${href})`, `(ivfile:${href})`) : link
        if (inner !== undefined) return isFilePath(inner) ? `[${inner}](ivfile:${inner})` : all
        return plain ? `[${plain}](ivfile:${plain})` : all
      })
    })
    .join('')
}
