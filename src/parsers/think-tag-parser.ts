/**
 * ThinkTagParser - Splits text into TEXT and THINKING chunks.
 * Handles think tags in the format: thinkcontent/think
 */

export enum ContentType {
  TEXT = 'text',
  THINKING = 'thinking',
}

export interface ThinkChunk {
  type: ContentType
  content: string
}

enum ParserState {
  TEXT = 'text',
  THINKING = 'thinking',
}

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

export class ThinkTagParser {
  private state: ParserState = ParserState.TEXT
  private buffer = ''

  feed(text: string): ThinkChunk[] {
    const chunks: ThinkChunk[] = []
    if (!text) return chunks

    this.buffer += text

    let i = 0
    while (i < this.buffer.length) {
      if (this.state === ParserState.TEXT) {
        const openIdx = this.buffer.indexOf(OPEN_TAG, i)
        if (openIdx !== -1) {
          if (openIdx > i) {
            chunks.push({ type: ContentType.TEXT, content: this.buffer.slice(i, openIdx) })
          }
          i = openIdx + OPEN_TAG.length
          this.state = ParserState.THINKING
        } else {
          // Check for orphan closing tags - skip them
          const closeIdx = this.buffer.indexOf(CLOSE_TAG, i)
          if (closeIdx !== -1) {
            if (closeIdx > i) {
              chunks.push({ type: ContentType.TEXT, content: this.buffer.slice(i, closeIdx) })
            }
            i = closeIdx + CLOSE_TAG.length
            // Skip the orphan close tag and continue processing
            continue
          }

          // No opening tag found - emit safe text, keep potential tag prefix in buffer
          const ltIdx = this.buffer.indexOf('<', i)
          if (ltIdx !== -1) {
            if (ltIdx > i) {
              chunks.push({ type: ContentType.TEXT, content: this.buffer.slice(i, ltIdx) })
            }
            this.buffer = this.buffer.slice(ltIdx)
          } else {
            if (this.buffer.length > i) {
              chunks.push({ type: ContentType.TEXT, content: this.buffer.slice(i) })
            }
            this.buffer = ''
          }
          break
        }
      } else if (this.state === ParserState.THINKING) {
        const closeIdx = this.buffer.indexOf(CLOSE_TAG, i)
        if (closeIdx !== -1) {
          if (closeIdx > i) {
            chunks.push({ type: ContentType.THINKING, content: this.buffer.slice(i, closeIdx) })
          }
          i = closeIdx + CLOSE_TAG.length
          this.state = ParserState.TEXT
        } else {
          // No closing tag found - emit safe thinking, keep potential close tag prefix
          const ltIdx = this.buffer.indexOf('<', i)
          if (ltIdx !== -1) {
            if (ltIdx > i) {
              chunks.push({ type: ContentType.THINKING, content: this.buffer.slice(i, ltIdx) })
            }
            this.buffer = this.buffer.slice(ltIdx)
          } else {
            if (this.buffer.length > i) {
              chunks.push({ type: ContentType.THINKING, content: this.buffer.slice(i) })
            }
            this.buffer = ''
          }
          break
        }
      }
    }

    return chunks
  }

  flush(): ThinkChunk | null {
    if (!this.buffer) return null

    const chunk: ThinkChunk = {
      type: this.state === ParserState.THINKING ? ContentType.THINKING : ContentType.TEXT,
      content: this.buffer,
    }
    this.buffer = ''
    this.state = ParserState.TEXT
    return chunk
  }
}
