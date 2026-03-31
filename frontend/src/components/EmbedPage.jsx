import { useEffect } from 'react';
import ChatWidget from './ChatWidget';

/**
 * Embed page — renders ONLY the ChatWidget, auto-opened.
 * Served at /embed — used by embed.js iframe src.
 */
export default function EmbedPage() {
  useEffect(() => {
    // Auto-open the chat widget after a short delay
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-batutynas-chat'));
    }, 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', position: 'relative' }}>
      <ChatWidget />
    </div>
  );
}
