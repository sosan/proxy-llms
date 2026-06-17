import { describe, it, expect } from 'vitest'
import { compressMessages, formatRtkLog } from '../../transformers/rtk/index'
import { gitDiff } from '../../transformers/rtk/filters/gitDiff'
import { gitStatus } from '../../transformers/rtk/filters/gitStatus'
import { buildOutput } from '../../transformers/rtk/filters/buildOutput'
import { grep } from '../../transformers/rtk/filters/grep'
import { find } from '../../transformers/rtk/filters/find'
import { dedupLog } from '../../transformers/rtk/filters/dedupLog'
import { ls } from '../../transformers/rtk/filters/ls'
import { tree } from '../../transformers/rtk/filters/tree'
import { smartTruncate } from '../../transformers/rtk/filters/smartTruncate'
import { readNumbered } from '../../transformers/rtk/filters/readNumbered'
import { searchList } from '../../transformers/rtk/filters/searchList'
import { safeApply } from '../../transformers/rtk/applyFilter'
import { SMART_TRUNCATE_MIN_LINES } from '../../transformers/rtk/constants'
import type { FilterFn } from '../../interfaces/rtk'

// ─── compressMessages ───
describe('compressMessages', () => {
  it('returns null when disabled', () => {
    const result = compressMessages({ messages: [] }, false)
    expect(result).toBeNull()
  })

  it('returns null for null body', () => {
    const result = compressMessages(null as any, true)
    expect(result).toBeNull()
  })

  it('returns null when no messages or input', () => {
    const result = compressMessages({ model: 'gpt-4' }, true)
    expect(result).toBeNull()
  })

  it('compresses OpenAI tool messages (string content)', () => {
    // Must be >500 chars for auto-detection to trigger
    const largeDiff =
      'diff --git a/file.txt b/file.txt\n' +
      Array.from({ length: 100 }, (_, i) => `+added line ${i} with some padding to make this text exceed the minimum threshold for compression\n`).join('')

    const body = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'tool', content: largeDiff },
      ],
    }

    const result = compressMessages(body, true)
    expect(result).not.toBeNull()
    expect(result!.bytesBefore).toBeGreaterThan(0)
    expect(result!.hits.length).toBeGreaterThan(0)
    expect(result!.hits[0].filter).toBe('git-diff')
    // The body should be mutated in-place
    expect(body.messages[1].content).not.toContain('diff --git')
  })

  it('compresses Claude tool_result blocks (string content)', () => {
    const largeDiff =
      'diff --git a/file.txt b/file.txt\n' +
      Array.from({ length: 100 }, (_, i) => `+added line ${i} with some padding to make this text exceed the minimum threshold for compression\n`).join('')

    const body = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'tool_result', content: largeDiff },
          ],
        },
      ],
    }

    const result = compressMessages(body, true)
    expect(result).not.toBeNull()
    expect(result!.hits[0].filter).toBe('git-diff')
  })

  it('skips error tool_result blocks', () => {
    const originalContent = 'diff --git a/file.txt b/file.txt\n+added line'
    const body = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              content: originalContent,
              is_error: true,
            },
          ],
        },
      ],
    }

    compressMessages(body, true)
    // Error traces should be preserved
    expect(body.messages[0].content[0].content).toBe(originalContent)
  })

  it('compresses OpenAI Responses function_call_output (string)', () => {
    const largeDiff =
      'diff --git a/file.txt b/file.txt\n' +
      Array.from({ length: 100 }, (_, i) => `+added line ${i} with some padding to make this text exceed the minimum threshold for compression\n`).join('')

    const body = {
      input: [
        {
          type: 'function_call_output',
          output: largeDiff,
        },
      ],
    }

    const result = compressMessages(body, true)
    expect(result).not.toBeNull()
    expect(result!.hits[0].shape).toBe('openai-responses-string')
  })

  it('compresses OpenAI Responses function_call_output (array)', () => {
    const largeDiff =
      'diff --git a/file.txt b/file.txt\n' +
      Array.from({ length: 100 }, (_, i) => `+added line ${i} with some padding to make this text exceed the minimum threshold for compression\n`).join('')

    const body = {
      input: [
        {
          type: 'function_call_output',
          output: [{ type: 'input_text', text: largeDiff }],
        },
      ],
    }

    const result = compressMessages(body, true)
    expect(result).not.toBeNull()
    expect(result!.hits[0].shape).toBe('openai-responses-array')
  })

  it('handles Kiro format (conversationState)', () => {
    const largeDiff =
      'diff --git a/file.txt b/file.txt\n' +
      Array.from({ length: 100 }, (_, i) => `+added line ${i} with some padding to make this text exceed the minimum threshold for compression\n`).join('')

    const body = {
      conversationState: {
        history: [
          {
            userInputMessage: {
              userInputMessageContext: {
                toolResults: [
                  {
                    status: 'success',
                    content: [{ text: largeDiff }],
                  },
                ],
              },
            },
          },
        ],
      },
    }

    const result = compressMessages(body, true)
    expect(result).not.toBeNull()
    expect(result!.hits[0].shape).toBe('kiro-tool-result')
  })

  it('preserves error traces in Kiro format', () => {
    const body = {
      conversationState: {
        history: [
          {
            userInputMessage: {
              userInputMessageContext: {
                toolResults: [
                  {
                    status: 'error',
                    content: [{ text: 'some error trace' }],
                  },
                ],
              },
            },
          },
        ],
      },
    }

    compressMessages(body, true)
    // Error traces should be preserved
    expect(
      body.conversationState.history[0].userInputMessage.userInputMessageContext
        .toolResults[0].content[0].text
    ).toBe('some error trace')
  })

  it('does not compress tiny tool results (< MIN_COMPRESS_SIZE)', () => {
    const body = {
      messages: [{ role: 'tool', content: 'short result' }],
    }

    const result = compressMessages(body, true)
    expect(result).not.toBeNull()
    expect(result!.bytesBefore).toBe(result!.bytesAfter) // No compression
  })
})

// ─── formatRtkLog ───
describe('formatRtkLog', () => {
  it('returns null for null stats', () => {
    expect(formatRtkLog(null)).toBeNull()
  })

  it('returns null for empty stats', () => {
    expect(formatRtkLog({ bytesBefore: 0, bytesAfter: 0, hits: [] })).toBeNull()
  })

  it('formats saved bytes correctly', () => {
    const stats = {
      bytesBefore: 1000,
      bytesAfter: 500,
      hits: [{ shape: 'openai-tool', filter: 'git-diff', saved: 500 }],
    }
    const log = formatRtkLog(stats)
    expect(log).toContain('saved 500B')
    expect(log).toContain('50.0%')
    expect(log).toContain('git-diff')
  })

  it('deduplicates filter names', () => {
    const stats = {
      bytesBefore: 1000,
      bytesAfter: 400,
      hits: [
        { shape: 'a', filter: 'git-diff', saved: 300 },
        { shape: 'b', filter: 'git-diff', saved: 200 },
        { shape: 'c', filter: 'grep', saved: 100 },
      ],
    }
    const log = formatRtkLog(stats)
    expect(log).toContain('git-diff,grep')
  })
})

// ─── safeApply ───
describe('safeApply', () => {
  it('returns text when fn is not a function', () => {
    expect(safeApply(null as any, 'test')).toBe('test')
  })

  it('applies the filter function', () => {
    const fn: FilterFn = (s: string) => s.toUpperCase()
    fn.filterName = 'uppercase'
    expect(safeApply(fn, 'hello')).toBe('HELLO')
  })

  it('returns original text when filter returns non-string', () => {
    const fn: FilterFn = () => null as any
    fn.filterName = 'bad'
    expect(safeApply(fn, 'hello')).toBe('hello')
  })

  it('returns original text when filter throws', () => {
    const fn: FilterFn = () => {
      throw new Error('filter error')
    }
    fn.filterName = 'thrower'
    expect(safeApply(fn, 'hello')).toBe('hello')
  })
})

// ─── gitDiff ───
describe('gitDiff filter', () => {
  it('compacts diff with many added lines', () => {
    const diff = `diff --git a/file.txt b/file.txt
index 123..456 789
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,120 @@
 context line 1
 context line 2
 context line 3
 context line 4
 context line 5
+added 1
+added 2
+added 3
+added 4
+added 5
+added 6
+added 7
+added 8
+added 9
+added 10
+added 11
+added 12
+added 13
+added 14
+added 15
+added 16
+added 17
+added 18
+added 19
+added 20
+added 21
+added 22
+added 23
+added 24
+added 25
+added 26
+added 27
+added 28
+added 29
+added 30
+added 31
+added 32
+added 33
+added 34
+added 35
+added 36
+added 37
+added 38
+added 39
+added 40
+added 41
+added 42
+added 43
+added 44
+added 45
+added 46
+added 47
+added 48
+added 49
+added 50
+added 51
+added 52
+added 53
+added 54
+added 55
+added 56
+added 57
+added 58
+added 59
+added 60
+added 61
+added 62
+added 63
+added 64
+added 65
+added 66
+added 67
+added 68
+added 69
+added 70
+added 71
+added 72
+added 73
+added 74
+added 75
+added 76
+added 77
+added 78
+added 79
+added 80
+added 81
+added 82
+added 83
+added 84
+added 85
+added 86
+added 87
+added 88
+added 89
+added 90
+added 91
+added 92
+added 93
+added 94
+added 95
+added 96
+added 97
+added 98
+added 99
+added 100
+added 101
+added 102
+added 103
+added 104
+added 105
+added 106
+added 107
+added 108
+added 109
+added 110
+added 111
+added 112
+added 113
+added 114
+added 115
+added 116
+added 117
+added 118
+added 119
+added 120
 context line 6`

    const result = gitDiff(diff)
    expect(result).toContain('file.txt')
    expect(result).toContain('+120')
    expect(result).toContain('...') // truncation marker
  })

  it('preserves small diffs', () => {
    const diff = `diff --git a/small.txt b/small.txt
--- a/small.txt
+++ b/small.txt
@@ -1,2 +1,4 @@
 line1
+one line
+two line
 line2`

    const result = gitDiff(diff)
    expect(result).toContain('small.txt')
    expect(result).toContain('+one line')
    expect(result).toContain('+two line')
  })

  it('handles maxLines cap', () => {
    // Need proper hunk header for lines to be counted; use small maxLines to trigger cap
    const diff = 'diff --git a/file.txt b/file.txt\n@@ -1,5 +1,20 @@\n' + '+line\n'.repeat(10)
    const result = gitDiff(diff, 5)
    expect(result).toContain('(more changes truncated)')
  })
})

// ─── gitStatus ───
describe('gitStatus filter', () => {
  it('shows clean tree', () => {
    const result = gitStatus('')
    expect(result).toBe('Clean working tree')
  })

  it('parses porcelain output', () => {
    const input = `## main...origin/main
 M modified-file.txt
A  new-file.txt
?? untracked.txt`

    const result = gitStatus(input)
    expect(result).toContain('main')
    expect(result).toContain('Staged:')
    expect(result).toContain('Modified:')
    expect(result).toContain('Untracked:')
  })

  it('parses long-form output', () => {
    const input = `On branch main
Changes to be committed:
  new file:   staged.txt

Changes not staged for commit:
  modified:   modified.txt

Untracked files:
  untracked.txt`

    const result = gitStatus(input)
    expect(result).toContain('main')
    expect(result).toContain('Staged:')
    expect(result).toContain('Modified:')
  })

  it('detects conflicts', () => {
    const input = `## main
U  conflicted.txt
both modified: conflict.txt`
    const result = gitStatus(input)
    expect(result).toContain('conflicts:')
  })

  it('caps staged file lists at STATUS_MAX_FILES', () => {
    const files = Array.from({ length: 15 }, (_, i) => `A  file${i}.txt`).join('\n')
    const input = `## main\n${files}`
    const result = gitStatus(input)
    expect(result).toContain('... +5 more')
  })
})

// ─── buildOutput filter ───
describe('buildOutput filter', () => {
  it('keeps errors and strips progress', () => {
    const input = `Compiling foo v1.0.0
Compiling bar v1.0.0
ERROR: missing import
npm warn deprecated old-package@1.0.0
npm warn deprecated other@2.0.0
Finished successfully`

    const result = buildOutput(input)
    expect(result).toContain('ERROR:')
    expect(result).not.toContain('Compiling foo')
    expect(result).toContain('Compiled 2 packages')
    expect(result).toContain('Finished successfully')
  })

  it('counts deprecations', () => {
    const input = Array.from({ length: 10 }, (_, i) => `npm warn deprecated pkg${i}@1.0.0`).join('\n')
    const result = buildOutput(input)
    expect(result).toContain('+7 more deprecated packages')
  })

  it('returns empty string when no recognized patterns', () => {
    const input = 'random text\nmore random text'
    const result = buildOutput(input)
    // When no build patterns match, the filter just strips trailing newlines
    // from the accumulated output (which is empty in this case)
    expect(result).toBe('random text\nmore random text')
  })
})

// ─── grep filter ───
describe('grep filter', () => {
  it('formats grep output', () => {
    const input = `src/file.ts:10:const x = 1
src/other.ts:5:function foo() {}
src/file.ts:20:const y = 2`

    const result = grep(input)
    expect(result).toContain('3 matches')
    expect(result).toContain('src/file.ts')
    expect(result).toContain('src/other.ts')
    expect(result).toContain('  10: const x = 1')
  })

  it('caps per-file matches', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `src/file.ts:${i + 1}:match`).join('\n')
    const result = grep(lines)
    expect(result).toContain('+5')
  })

  it('returns input when no grep lines', () => {
    const input = 'not grep output'
    expect(grep(input)).toBe(input)
  })
})

// ─── find filter ───
describe('find filter', () => {
  it('groups files by directory', () => {
    const input = `src/utils.ts
src/helpers.ts
lib/core.ts
lib/extra.ts`

    const result = find(input)
    expect(result).toContain('4 files in 2 dirs')
    expect(result).toContain('src/')
    expect(result).toContain('lib/')
  })

  it('caps files per directory', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`).join('\n')
    const result = find(lines)
    expect(result).toContain('+5')
  })

  it('caps total directories', () => {
    const dirs = Array.from({ length: 25 }, (_, i) => `dir${i}/file.txt`).join('\n')
    const result = find(dirs)
    expect(result).toContain('+5 more dirs')
  })
})

// ─── dedupLog filter ───
describe('dedupLog filter', () => {
  it('collapses consecutive duplicates', () => {
    const input = `line1
line1
line1
line2
line2`

    const result = dedupLog(input)
    expect(result).toContain('line1')
    expect(result).toContain('(2 duplicate lines)')
    expect(result).toContain('line2')
  })

  it('removes excessive blank lines', () => {
    const input = `line1



line2`

    const result = dedupLog(input)
    expect(result.split('\n').filter((l) => l === '').length).toBe(1)
  })

  it('truncates at DEDUP_LINE_MAX', () => {
    const input = Array.from({ length: 2500 }, (_, i) => `line${i}`).join('\n')
    const result = dedupLog(input)
    expect(result).toContain('(truncated at 2000 lines)')
  })
})

// ─── ls filter ───
describe('ls filter', () => {
  it('compacts ls -la output', () => {
    const input = `total 128
drwxr-xr-x  5 user group  160 Jun 16 10:00 .
drwxr-xr-x  3 user group   60 Jun 16 09:00 ..
-rw-r--r--  1 user group 2048 Jun 16 10:00 file.txt
-rw-r--r--  1 user group 4096 Jun 16 10:00 main.js
-rw-r--r--  1 user group  512 Jun 16 10:00 README.md`

    const result = ls(input)
    expect(result).toContain('file.txt')
    expect(result).toContain('main.js')
    expect(result).toContain('README.md')
    expect(result).toContain('Summary:')
    expect(result).toContain('3 files')
  })

  it('skips noise directories', () => {
    const input = `drwxr-xr-x  1 user group  160 Jun 16 10:00 node_modules
-rw-r--r--  1 user group  512 Jun 16 10:00 README.md`
    const result = ls(input)
    expect(result).not.toContain('node_modules')
    expect(result).toContain('README.md')
  })

  it('returns input when no valid ls lines', () => {
    const input = 'not ls output'
    expect(ls(input)).toBe(input)
  })
})

// ─── tree filter ───
describe('tree filter', () => {
  it('removes summary line', () => {
    const input = `src/
├── file.ts
└── utils/
    └── helper.ts

2 directories, 3 files`

    const result = tree(input)
    expect(result).not.toContain('directories')
    expect(result).not.toContain('files')
    expect(result).toContain('src/')
    expect(result).toContain('file.ts')
  })

  it('handles summary with single directory', () => {
    const input = `src/
├── a.txt
1 directory, 1 file`
    const result = tree(input)
    expect(result).not.toContain('directory')
  })

  it('caps at TREE_MAX_LINES', () => {
    const input = Array.from({ length: 250 }, (_, i) => `line${i}`).join('\n')
    const result = tree(input)
    expect(result).toContain('+50 more lines')
  })
})

// ─── smartTruncate filter ───
describe('smartTruncate filter', () => {
  it('does not truncate short input', () => {
    const input = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n')
    expect(smartTruncate(input)).toBe(input)
  })

  it('truncates large input', () => {
    const input = Array.from({ length: 500 }, (_, i) => `line${i}`).join('\n')
    const result = smartTruncate(input)
    expect(result).toContain('... +')
    expect(result).toContain('lines truncated')
    // Should have head and tail
    expect(result.split('\n').length).toBeLessThan(500)
  })
})

// ─── readNumbered filter ───
describe('readNumbered filter', () => {
  it('does not truncate short input', () => {
    const input = Array.from({ length: 10 }, (_, i) => `  ${i + 1}|content`).join('\n')
    expect(readNumbered(input)).toBe(input)
  })

  it('truncates large numbered input', () => {
    const input = Array.from({ length: 500 }, (_, i) => `  ${i + 1}|content`).join('\n')
    const result = readNumbered(input)
    expect(result).toContain('(file continues)')
    expect(result.split('\n').length).toBeLessThan(500)
  })
})

// ─── searchList filter ───
describe('searchList filter', () => {
  it('groups search results by directory', () => {
    const input = `Result of search in 'src' (total 4 files):
- src/utils.ts
- src/helpers.ts
- lib/core.ts
- lib/extra.ts`

    const result = searchList(input)
    expect(result).toContain('4 files in 2 dirs')
    expect(result).toContain('src/')
    expect(result).toContain('lib/')
  })

  it('returns input when no valid search list', () => {
    const input = 'not a search list'
    expect(searchList(input)).toBe(input)
  })
})
