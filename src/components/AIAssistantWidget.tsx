import { useDismissGesture } from '@/lib/useDismissGesture'
import { MotionPresence } from '@/components/MotionPresence'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supabase } from '@/integrations/supabase/client'
import { errorMessage } from '@/lib/errors'
import { aiResponse } from '@/lib/functionResponses'
import { Send,Sparkles,X } from 'lucide-react'
import { useEffect,useRef,useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { toast } from '@/lib/notifications'

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Doanh thu hôm nay?',
  'Nguyên liệu nào sắp hết?',
]

const defaultMsg: Msg = { role: 'assistant', content: 'Xin chào! Mình là trợ lý AI. Bạn có thể hỏi doanh thu, quản lý menu, kiểm tra bàn, tồn kho... Cứ ra lệnh nhé 👋' }
const STORAGE_KEY = 'ai_chat_history'


export default function AIAssistantWidget() {
  const [open, setOpen] = useState(false)
  const dismissGesture = useDismissGesture(() => setOpen(false))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : [defaultMsg]
    } catch {
      return [defaultMsg]
    }
  })
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(STORAGE_KEY)
        setMessages([defaultMsg])
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
   if (!content || loading) return
    setInput('')
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
  body: { messages: next.map(m => ({ role: m.role, content: m.content })) },
})
      if (error) throw error
      const response = aiResponse.parse(data)
      if (response.error) throw new Error(response.error)
      setMessages([...next, { role: 'assistant', content: response.reply || '(không có phản hồi)' }])
    } catch (e: unknown) {
      toast.error(errorMessage(e) || 'Lỗi gọi AI')
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ ' + (errorMessage(e) || 'Lỗi') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-elegant shadow-lg transition hover:scale-105"
          title="Trợ lý AI"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      <MotionPresence show={open}>{state => (
        <div data-ai-open data-state={state} className="premium-ai fixed bottom-5 right-5 z-50 flex h-[600px] max-h-[85vh] w-[400px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div {...dismissGesture} className="motion-gesture-handle flex items-center justify-between border-b bg-gradient-to-r from-primary to-primary/80 p-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <div className="text-sm font-bold">Trợ lý AI</div>
                <div className="text-[10px] opacity-90">Điều khiển nhà hàng bằng lệnh</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-white/20"><X className="h-4 w-4" /></button>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} data-motion-message={`ai-${i}`} className={`motion-message flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {m.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-table:my-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <span className="motion-typing" aria-hidden="true"><i/><i/><i/></span><span role="status">Đang xử lý...</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1 border-t p-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="rounded-full border bg-muted/40 px-2 py-1 text-xs hover:bg-muted">{s}</button>
              ))}
            </div>
          )}

          <div className="flex gap-2 border-t p-2">
  <div className="flex flex-1 flex-col gap-1">

    <div className="flex gap-2">
      <Input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') send() }}
        placeholder="Ra lệnh cho AI..."
        disabled={loading}
      />
      <Button size="icon" busy={loading} onClick={() => send()} disabled={loading || !input.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  </div>
</div>
        </div>
      )}</MotionPresence>
    </>
  )
}
