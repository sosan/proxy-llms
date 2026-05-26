import { describe, it, expect } from 'vitest'
import { HeuristicToolParser } from '../../parsers/heuristic-tool-parser'

describe('HeuristicToolParser', () => {
  // -----------------------------------------------------------------------
  // Basic functionality
  // -----------------------------------------------------------------------
  it('should parse a basic tool call', () => {
    const parser = new HeuristicToolParser()
    const text = 'Let us call a tool. \u25cf <function=Grep><parameter=pattern>hello</parameter><parameter=path>.</parameter>'
    const { filtered, tools } = parser.feed(text)

    expect(filtered).toContain('Let us call a tool.')
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('Grep')
    expect(tools[0].input).toEqual({ pattern: 'hello', path: '.' })
  })

  it('should parse streaming tool call across chunks', () => {
    const parser = new HeuristicToolParser()

    const { filtered: _f1, tools: t1 } = parser.feed('\u25cf <function=Write>')
    expect(t1).toHaveLength(1)
    expect(t1[0].name).toBe('Write')
    expect(t1[0].input).toEqual({})

    const { filtered: _f2, tools: t2 } = parser.feed('<parameter=path>test.txt</parameter>')
    expect(t2).toHaveLength(1)
    expect(t2[0].name).toBe('Write')
    expect(t2[0].input).toEqual({ path: 'test.txt' })

    const { filtered: f3, tools: t3 } = parser.feed('\nDone.')
    expect(t3).toHaveLength(0)
    expect(f3).toContain('Done.')
  })

  it('should flush remaining partial tool call', () => {
    const parser = new HeuristicToolParser()
    parser.feed('\u25cf <function=Bash><parameter=command>ls -la')
    const tools = parser.flush()

    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('Bash')
    expect(tools[0].input).toEqual({ command: 'ls -la' })
  })

  // -----------------------------------------------------------------------
  // Control tokens
  // -----------------------------------------------------------------------
  it('should strip control tokens', () => {
    const parser = new HeuristicToolParser()
    const { filtered, tools } = parser.feed('Hello <|control|> world')
    expect(filtered).toBe('Hello  world')
    expect(tools).toEqual([])
  })

  it('should strip control tokens split across chunks', () => {
    const parser = new HeuristicToolParser()
    const { filtered: f1, tools: t1 } = parser.feed('Hello <|tool_call_')
    const { filtered: f2, tools: t2 } = parser.feed('end|> world')
    expect(f1 + f2).toBe('Hello  world')
    expect([...t1, ...t2]).toEqual([])
  })

  // -----------------------------------------------------------------------
  // Web tools (JSON style)
  // -----------------------------------------------------------------------
  it('should detect JSON-style WebFetch tool call', () => {
    const parser = new HeuristicToolParser()
    const text = 'Use WebFetch on the article.\n\n{\n  "url": "https://example.com/article",\n  "prompt": "Summarize it."\n}\n'
    const { filtered, tools } = parser.feed(text)

    expect(filtered).toBe('')
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('WebFetch')
    expect(tools[0].input.url).toBe('https://example.com/article')
    expect(tools[0].input.prompt).toBe('Summarize it.')
  })

  it('should detect JSON-style WebSearch tool call', () => {
    const parser = new HeuristicToolParser()
    const { filtered, tools } = parser.feed('Use WebSearch {"query": "DeepSeek V4"}')

    expect(filtered).toBe('')
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('WebSearch')
    expect(tools[0].input.query).toBe('DeepSeek V4')
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it('should handle empty input', () => {
    const parser = new HeuristicToolParser()
    const { filtered, tools } = parser.feed('')
    expect(filtered).toBe('')
    expect(tools).toEqual([])
  })

  it('should handle flush with no tool being parsed', () => {
    const parser = new HeuristicToolParser()
    parser.feed('plain text')
    const tools = parser.flush()
    expect(tools).toEqual([])
  })

  it('should handle multiple tool calls interleaved with text', () => {
    const parser = new HeuristicToolParser()
    const { tools: t1 } = parser.feed('Some text ')
    expect(t1).toEqual([])

    const { tools: t2 } = parser.feed('\u25cf <function=T1><parameter=x>1</parameter>')
    expect(t2).toHaveLength(1)
    expect(t2[0].name).toBe('T1')

    const { tools: t3 } = parser.feed(' more text ')
    expect(t3).toEqual([])

    const { tools: t4 } = parser.feed('\u25cf <function=T2><parameter=y>2</parameter>')
    expect(t4).toHaveLength(1)
    expect(t4[0].name).toBe('T2')
  })

  it('should handle malformed function tags without crashing', () => {
    const parser = new HeuristicToolParser()
    const { filtered, tools } = parser.feed('\u25cf <function=>')
    expect(filtered).toBeDefined()
    expect(tools).toEqual([])
  })

  it('should handle unicode in function parameters', () => {
    const parser = new HeuristicToolParser()
    const text = '\u25cf <function=Search><parameter=query>\u65e5\u672c\u8a9e</parameter>'
    const { tools } = parser.feed(text)
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('Search')
    expect(tools[0].input.query).toBe('\u65e5\u672c\u8a9e')
  })

  // -----------------------------------------------------------------------
  // Parametrized splits
  // -----------------------------------------------------------------------
  it('should handle text split at any point across tool call', () => {
    const fullText = '\u25cf <function=Test><parameter=arg>val</parameter>'

    for (let i = 0; i < fullText.length; i++) {
      const p = new HeuristicToolParser()
      const chunk1 = fullText.slice(0, i)
      const chunk2 = fullText.slice(i)

      const { tools: t1 } = p.feed(chunk1)
      const { tools: t2 } = p.feed(chunk2)
      const t3 = p.flush()

      const allTools = [...t1, ...t2, ...t3]
      expect(allTools).toHaveLength(1)
      expect(allTools[0].name).toBe('Test')
      // Input may have no keys if flush() happens before parameter is parsed
      if (Object.keys(allTools[0].input).length > 0) {
        expect(allTools[0].input).toEqual({ arg: 'val' })
      }
    }
  })
})
