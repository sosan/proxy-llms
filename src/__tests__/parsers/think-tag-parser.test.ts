import { describe, it, expect } from 'vitest'
import { ThinkTagParser, ContentType } from '../../parsers/think-tag-parser'

describe('ThinkTagParser', () => {
  // -----------------------------------------------------------------------
  // Basic functionality
  // -----------------------------------------------------------------------
  it('should emit a single TEXT chunk for plain text', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('Hello world')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ type: ContentType.TEXT, content: 'Hello world' })
  })

  it('should extract thinking content between tags', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('Hello <think>reasoning</think> world')

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({ type: ContentType.TEXT, content: 'Hello ' })
    expect(chunks[1]).toEqual({ type: ContentType.THINKING, content: 'reasoning' })
    expect(chunks[2]).toEqual({ type: ContentType.TEXT, content: ' world' })
  })

  it('should handle empty think tags', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('Hello <think></think> world')

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual({ type: ContentType.TEXT, content: 'Hello ' })
    expect(chunks[1]).toEqual({ type: ContentType.TEXT, content: ' world' })
  })

  // -----------------------------------------------------------------------
  // Streaming (split across chunks)
  // -----------------------------------------------------------------------
  it('should handle think tag split across chunks', () => {
    const parser = new ThinkTagParser()

    const chunks1 = parser.feed('Hello <thi')
    expect(chunks1).toHaveLength(1)
    expect(chunks1[0]).toEqual({ type: ContentType.TEXT, content: 'Hello ' })

    const chunks2 = parser.feed('nk>reasoning </th')
    expect(chunks2).toHaveLength(1)
    expect(chunks2[0]).toEqual({ type: ContentType.THINKING, content: 'reasoning ' })

    const chunks3 = parser.feed('ink> world')
    expect(chunks3).toHaveLength(1)
    expect(chunks3[0]).toEqual({ type: ContentType.TEXT, content: ' world' })
  })

  // -----------------------------------------------------------------------
  // Orphan tags
  // -----------------------------------------------------------------------
  it('should strip orphan close tag in the middle', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('Hello </think> world')

    const text = chunks
      .filter((c) => c.type === ContentType.TEXT)
      .map((c) => c.content)
      .join('')
    expect(text).toBe('Hello  world')
    expect(text).not.toContain('</think>')
  })

  it('should strip orphan close tag at the start', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('</think>Hello world')

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ type: ContentType.TEXT, content: 'Hello world' })
  })

  it('should strip orphan close tag at the end', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('Hello world</think>')

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ type: ContentType.TEXT, content: 'Hello world' })
  })

  it('should strip multiple orphan close tags', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('a</think>b</think>c')

    const text = chunks
      .filter((c) => c.type === ContentType.TEXT)
      .map((c) => c.content)
      .join('')
    expect(text).toBe('abc')
    expect(text).not.toContain('</think>')
  })

  // -----------------------------------------------------------------------
  // Flush
  // -----------------------------------------------------------------------
  it('flush with no buffered content should return null', () => {
    const parser = new ThinkTagParser()
    const result = parser.flush()
    expect(result).toBeNull()
  })

  it('flush with buffered text should return TEXT chunk', () => {
    const parser = new ThinkTagParser()
    parser.feed('Hello <thi')
    const result = parser.flush()
    expect(result).not.toBeNull()
    expect(result!.type).toBe(ContentType.TEXT)
    expect(result!.content).toContain('<thi')
  })

  it('flush while inside think should return THINKING chunk', () => {
    const parser = new ThinkTagParser()
    parser.feed('Hello <think>partial reasoning </thi')
    const result = parser.flush()
    expect(result).not.toBeNull()
    expect(result!.type).toBe(ContentType.THINKING)
    expect(result!.content).toContain('</thi')
  })

  // -----------------------------------------------------------------------
  // Unicode
  // -----------------------------------------------------------------------
  it('should handle unicode inside and outside think tags', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('日本語 <think>思考中 🤔</think> 結果')

    const thinking = chunks
      .filter((c) => c.type === ContentType.THINKING)
      .map((c) => c.content)
      .join('')
    const text = chunks
      .filter((c) => c.type === ContentType.TEXT)
      .map((c) => c.content)
      .join('')

    expect(thinking).toBe('思考中 🤔')
    expect(text).toContain('日本語')
    expect(text).toContain('結果')
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it('should handle empty string input', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('')
    expect(chunks).toEqual([])
  })

  it('should handle only think tags without content', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('<think></think>')
    expect(chunks).toEqual([])
  })

  it('should handle consecutive think blocks', () => {
    const parser = new ThinkTagParser()
    const chunks = parser.feed('A <think>1</think> B <think>2</think> C')

    const text = chunks
      .filter((c) => c.type === ContentType.TEXT)
      .map((c) => c.content)
      .join('')
    const thinking = chunks
      .filter((c) => c.type === ContentType.THINKING)
      .map((c) => c.content)
      .join(',')

    expect(text).toBe('A  B  C')
    expect(thinking).toBe('1,2')
  })
})
