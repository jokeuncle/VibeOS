import MDEditor, { type MDEditorProps } from '@uiw/react-md-editor'
import { useUIStore } from '../stores/ui'

type PreviewProps = {
  text: string
  /** Extra classes on the wrapper (e.g. `vibe-md--in-bubble`). Theme in `index.css` under “Vibe × @uiw markdown”. */
  className?: string
}

/** Read-only markdown (GFM tables, etc.) via @uiw/react-md-editor / react-markdown-preview. */
export function MarkdownPreview({ text, className = '' }: PreviewProps) {
  const theme = useUIStore((s) => s.theme)
  const mode = theme === 'light' ? 'light' : 'dark'
  return (
    <div
      data-color-mode={mode}
      className={`vibe-md wmde-markdown-var ${className}`.trim()}
    >
      <MDEditor.Markdown source={text || ''} />
    </div>
  )
}

/** @deprecated Prefer `MarkdownPreview` — kept for existing imports. */
export function MarkdownContent({ text }: { text: string }) {
  return <MarkdownPreview text={text} />
}

type EditorFieldProps = Pick<MDEditorProps, 'value' | 'onChange' | 'height' | 'textareaProps'>

/** Markdown source editor (toolbar hidden); theme matches app. */
export function MarkdownEditorField({
  value,
  onChange,
  height = 200,
  textareaProps,
}: EditorFieldProps) {
  const theme = useUIStore((s) => s.theme)
  const mode = theme === 'light' ? 'light' : 'dark'
  return (
    <div data-color-mode={mode} className="vibe-md vibe-md-editor-wrapped wmde-markdown-var">
      <MDEditor
        value={value}
        onChange={onChange}
        preview="edit"
        hideToolbar
        visibleDragbar={false}
        height={height}
        textareaProps={textareaProps}
      />
    </div>
  )
}
