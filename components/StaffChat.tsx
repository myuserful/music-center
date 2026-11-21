'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteChatMessage, loadChat, markChatRead, sendChatMessage, setChatHandled, type ChatMessage,
} from '@/lib/actions/chat';

const WHO: Record<ChatMessage['sender_role'], string> = { admin: 'הנהלה', secretary: 'מזכירה' };
const POLL_OPEN = 8_000;
const POLL_CLOSED = 30_000;

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return today ? hm : `${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} ${hm}`;
};

/** צ'אט צף בין ההנהלה למזכירה, בכל המסכים */
export function StaffChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<'admin' | 'secretary' | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  const refresh = useCallback(async () => {
    const res = await loadChat();
    if (!res.ok) { setError(res.error); return; }
    setError('');
    setMessages(res.messages);
    setMe(res.me);
    setUid(res.uid);
  }, []);

  // טעינה ורענון: מהר כשהחלון פתוח, לאט כשהוא סגור (בשביל המונה), ולא כשהלשונית מוסתרת
  useEffect(() => {
    refresh();
    const id = setInterval(() => { if (!document.hidden) refresh(); }, open ? POLL_OPEN : POLL_CLOSED);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [open, refresh]);

  const unread = me ? messages.filter((m) => m.sender_role !== me && !m.read_at) : [];
  const unreadUrgent = unread.some((m) => m.urgent);
  const pinned = messages.filter((m) => m.urgent && !m.handled_at);

  // פתוח ויש הודעות חדשות מהצד השני: מסמנים כנקרא
  useEffect(() => {
    if (open && unread.length > 0) markChatRead().then(refresh);
  }, [open, unread.length, refresh]);

  // גלילה לסוף כשנכנסת הודעה חדשה
  useEffect(() => {
    const last = messages.at(-1)?.id ?? 0;
    if (open && last !== lastId.current) {
      lastId.current = last;
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages, open]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await sendChatMessage(text, urgent);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    setText('');
    setUrgent(false);
    await refresh();
  }

  async function act(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p;
    if (!res.ok && res.error) setError(res.error);
    await refresh();
  }

  const mine = (m: ChatMessage) => m.sender_role === me;
  const canDelete = (m: ChatMessage) => me === 'admin' || (mine(m) && (!m.sender_id || m.sender_id === uid));

  return (
    <div className={`chat no-print ${open ? 'chat-open' : ''}`}>
      {open && (
        <section className="chat-panel" aria-label="צ'אט הנהלה ומזכירה">
          <header className="chat-head">
            <strong>💬 הנהלה ומזכירה</strong>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)} aria-label="סגירה">✕</button>
          </header>

          {pinned.length > 0 && (
            <div className="chat-pinned">
              {pinned.map((m) => (
                <div key={m.id} className="chat-pin">
                  <span className="chat-pin-tag">דחוף · {WHO[m.sender_role]}</span>
                  <span className="chat-pin-body">{m.body}</span>
                  <button type="button" className="btn btn-xs" onClick={() => act(setChatHandled(m.id, true))}>✓ טופל</button>
                </div>
              ))}
            </div>
          )}

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && !error && <p className="muted chat-empty">עוד אין הודעות. אפשר לכתוב כאן הודעה להנהלה או למזכירה.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${mine(m) ? 'chat-mine' : 'chat-theirs'} ${m.urgent ? 'chat-urgent' : ''}`}>
                <div className="chat-meta">
                  <span>{WHO[m.sender_role]}</span>
                  <span>{time(m.created_at)}</span>
                  {m.urgent && <span className="chat-urgent-tag">{m.handled_at ? 'דחוף · טופל' : 'דחוף'}</span>}
                </div>
                <div className="chat-body">{m.body}</div>
                <div className="chat-tools">
                  {mine(m) && <span className="chat-read">{m.read_at ? '✓✓ נקרא' : '✓ נשלח'}</span>}
                  {m.urgent && m.handled_at && (
                    <button type="button" className="chat-link" onClick={() => act(setChatHandled(m.id, false))}>החזרה לדחוף</button>
                  )}
                  {canDelete(m) && (
                    <button type="button" className="chat-link" onClick={() => { if (confirm('למחוק את ההודעה?')) act(deleteChatMessage(m.id)); }}>מחיקה</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="chat-error">{error}</p>}

          <form className="chat-form" onSubmit={send}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={me === 'secretary' ? 'הודעה להנהלה…' : 'הודעה למזכירה…'}
              rows={2}
              maxLength={4000}
            />
            <div className="chat-form-row">
              <label className={`chat-urgent-toggle ${urgent ? 'on' : ''}`}>
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> 🔴 דחוף
              </label>
              <button className="btn btn-primary btn-xs" disabled={sending || !text.trim()}>{sending ? 'שולח…' : 'שליחה'}</button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`chat-fab ${unreadUrgent ? 'chat-fab-urgent' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={`צ'אט${unread.length ? ` (${unread.length} חדשות)` : ''}`}
      >
        💬
        {unread.length > 0 && <span className="chat-count">{unread.length}</span>}
      </button>
    </div>
  );
}
