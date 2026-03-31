import ChatWidget from './ChatWidget';

/**
 * Embed page — renders ChatWidget in embedded mode (no FAB, always open).
 * Served at /embed — used by embed.js iframe src.
 * Close events are sent to parent via postMessage.
 */
export default function EmbedPage() {
  return (
    <div style={{ background: '#ffffff', width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <ChatWidget embedded />
    </div>
  );
}
