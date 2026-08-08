import { useEffect, useState } from 'react';
import { useChecklist } from '../lib/useChecklist';
import './styles.css';

/**
 * Track the visual viewport so the app shell can be sized to exactly the
 * on-screen area above the soft keyboard. The page itself never scrolls
 * (body is overflow: hidden); the list scrolls inside the shell instead,
 * so the toolbar — a normal flex child at the shell's bottom — cannot
 * drift while scrolling. Fixed-position chasing of the keyboard is what
 * causes the iOS "swimming toolbar"; this avoids it entirely.
 */
function useVisualViewportBox() {
  const [box, setBox] = useState(() => ({
    height: window.innerHeight,
    offsetTop: 0,
    keyboardOpen: false,
  }));
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setBox({
        height: vv.height,
        offsetTop: vv.offsetTop,
        keyboardOpen: window.innerHeight - vv.height > 100,
      });
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return box;
}

const SAMPLE = `# Hardware
Check the garage before buying any of this.
- [ ] screws
- [x] hinges
- [ ] wood glue

# Paint
- [ ] primer
- [ ] rollers
Ask at the store which primer works on old plaster.`;

export default function App() {
  const [showMarkdown, setShowMarkdown] = useState(false);
  const { rows, focus, dispatch, getRowProps, getCheckboxProps, toMarkdown } =
    useChecklist({ initial: SAMPLE });
  const viewport = useVisualViewportBox();
  const activeIndex = focus ? rows.findIndex((r) => r.id === focus.id) : -1;
  const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;

  // Toolbar commands: single dispatches — the reducer owns caret placement,
  // so no command needs to read or restore the DOM caret.
  const setRowType = (rowType: 'header' | 'item' | 'text') =>
    activeRow &&
    activeRow.type !== rowType &&
    dispatch({ type: 'setRowType', id: activeRow.id, rowType });
  const moveRow = (delta: -1 | 1) =>
    activeRow &&
    dispatch({ type: 'move', id: activeRow.id, toIndex: activeIndex + delta });

  return (
    <div
      className={`shell${viewport.keyboardOpen ? ' kb-open' : ''}`}
      style={{
        height: viewport.height,
        transform: `translateY(${viewport.offsetTop}px)`,
      }}
    >
      <div className="scroll-area">
        <div className="app">
          <header className="topbar">
        <h1>Checklist POC</h1>
        <div className="topbar-actions">
          <button
            className="bar-btn"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setShowMarkdown((v) => !v)}
          >
            {showMarkdown ? 'Hide MD' : 'Show MD'}
          </button>
          <button
            className="bar-btn"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => navigator.clipboard.writeText(toMarkdown())}
          >
            Copy MD
          </button>
        </div>
      </header>

      <div className="editor" role="list">
        {rows.map((row) =>
          row.type === 'header' ? (
            <div className="row row-header" key={row.id} role="listitem">
              <textarea
                className="field field-header"
                aria-label="Section header"
                {...getRowProps(row.id)}
              />
            </div>
          ) : row.type === 'text' ? (
            <div className="row row-text" key={row.id} role="listitem">
              <textarea
                className="field field-text"
                aria-label="Paragraph"
                {...getRowProps(row.id)}
              />
            </div>
          ) : (
            <div
              className={`row row-item${row.done ? ' is-done' : ''}`}
              key={row.id}
              role="listitem"
            >
              <button
                className="check"
                aria-label={row.done ? 'Mark not done' : 'Mark done'}
                aria-pressed={row.done}
                {...getCheckboxProps(row.id)}
              >
                {row.done ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path
                      d="M2.5 8.5l3.5 3.5 7-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
              <textarea
                className="field field-item"
                aria-label="Checklist item"
                {...getRowProps(row.id)}
              />
            </div>
          ),
        )}
      </div>

      <p className="hint">
        Enter → next item · Enter on an empty item → plain text · Backspace at
        start → merge · tap circle → toggle · paste multi-line markdown to
        import · <code>#&nbsp;</code> at the start of a line also makes a
        heading
      </p>

          {showMarkdown && <pre className="md-preview">{toMarkdown()}</pre>}
        </div>
      </div>

      {/* Accessory toolbar: a plain flex child at the shell's bottom — never
          position: fixed, so it cannot swim while the list scrolls.
          preventDefault on pointerdown at the container so no tap in the bar
          (buttons, disabled buttons, gaps) blurs the field or drops the
          keyboard (spec §6). */}
      <div className="toolbar" onPointerDown={(e) => e.preventDefault()}>
        <div className="toolbar-inner">
          <div className="tb-seg" role="group" aria-label="Row type">
            <button
              className={`tb-btn tb-heading${activeRow?.type === 'header' ? ' is-on' : ''}`}
              disabled={!activeRow}
              aria-pressed={activeRow?.type === 'header'}
              aria-label="Heading"
              onClick={() => setRowType('header')}
            >
              <span className="tb-heading-glyph">H</span>
            </button>
            <button
              className={`tb-btn${activeRow?.type === 'item' ? ' is-on' : ''}`}
              disabled={!activeRow}
              aria-pressed={activeRow?.type === 'item'}
              aria-label="List item"
              onClick={() => setRowType('item')}
            >
              <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M5.2 8.3l2 2 3.6-4.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={`tb-btn${activeRow?.type === 'text' ? ' is-on' : ''}`}
              disabled={!activeRow}
              aria-pressed={activeRow?.type === 'text'}
              aria-label="Plain text"
              onClick={() => setRowType('text')}
            >
              <span className="tb-heading-glyph">¶</span>
            </button>
          </div>
          <div className="tb-spacer" />
          <button
            className="tb-btn"
            disabled={!activeRow || activeIndex <= 0}
            aria-label="Move row up"
            onClick={() => moveRow(-1)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className="tb-btn"
            disabled={!activeRow || activeIndex === rows.length - 1}
            aria-label="Move row down"
            onClick={() => moveRow(1)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 3v10M3.5 8.5L8 13l4.5-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
