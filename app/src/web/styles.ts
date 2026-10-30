// CSS global untuk antarmuka desktop (hanya dimuat di web). Semua kelas berawalan iv-.
export const CSS = `
:root {
  --bg: #1a1a1a; --panel: #202020; --panel2: #2b2b2b; --card: #262626; --hover: #2e2e2e; --border: #333;
  --text: #ececec; --dim: #a3a3a3; --faint: #717171; --accent: #d97757; --blue: #5b9cf5; --ok: #4ade80;
  --warn: #fbbf24; --err: #f87171; --link: #8ab4ff; --code: #141414; --add: #1f3d2a; --del: #4a1f24;
  --sans: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  --mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
  color-scheme: dark;
}
html, body { height: 100%; margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); overflow: hidden; }
#root { display: flex; height: 100%; }
* { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: #3d3d3d transparent; }
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-thumb { background: #3d3d3d; border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
*::-webkit-scrollbar-thumb:hover { background: #555; background-clip: content-box; border: 2px solid transparent; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
button:disabled { cursor: default; }
input, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
::selection { background: #3b5b8a; }

.iv-app { flex: 1; display: flex; min-width: 0; height: 100%; font-size: 14px; line-height: 1.5; }
.iv-center { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--dim); }

/* ---------- sidebar ---------- */
.iv-side { position: relative; display: flex; flex-direction: column; background: var(--panel); border-right: 1px solid var(--border); flex: none; min-height: 0; }
.iv-side-head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 8px; }
.iv-brand { font-weight: 700; font-size: 16px; letter-spacing: .2px; }
.iv-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); flex: none; }
.iv-dot.ok { background: var(--ok); } .iv-dot.warn { background: var(--warn); } .iv-dot.err { background: var(--err); }
.iv-dot.run { background: var(--accent); animation: iv-pulse 1.2s ease-in-out infinite; }
@keyframes iv-pulse { 50% { opacity: .35; } }
.iv-icon-btn { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: var(--dim); flex: none; }
.iv-icon-btn:hover { background: var(--hover); color: var(--text); }
.iv-icon-btn.on { color: var(--text); background: var(--hover); }
.iv-new { display: flex; align-items: center; gap: 8px; margin: 4px 12px 8px; padding: 9px 12px; border-radius: 10px; background: var(--accent); color: #1a1a1a; font-weight: 700; }
.iv-new:hover { filter: brightness(1.08); }
.iv-kbd { margin-left: auto; font-size: 11px; font-weight: 600; opacity: .65; font-family: var(--sans); }
.iv-search { margin: 0 12px 6px; display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 0 10px; color: var(--faint); }
.iv-search:focus-within { border-color: #4a4a4a; }
.iv-search input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; padding: 8px 0; color: var(--text); }
.iv-search .iv-kbd { color: var(--faint); opacity: 1; }
.iv-list { flex: 1; overflow-y: auto; padding: 4px 8px 12px; min-height: 0; }
.iv-group { padding: 12px 8px 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: var(--faint); }
.iv-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border-radius: 10px; }
.iv-item:hover { background: var(--hover); }
.iv-item.active { background: var(--panel2); }
.iv-item-main { flex: 1; min-width: 0; }
.iv-item-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iv-item-sub { font-size: 12px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iv-badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--warn); color: #1a1a1a; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
.iv-tag { font-size: 11px; font-weight: 600; color: var(--link); flex: none; }
.iv-side-foot { display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-top: 1px solid var(--border); color: var(--dim); }
.iv-side-foot .iv-grow { flex: 1; font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iv-resizer { position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; z-index: 5; }
.iv-resizer:hover, .iv-resizer.drag { background: rgba(91,156,245,.35); }

.iv-side-tools { display: flex; align-items: center; gap: 6px; margin: 0 12px 6px; min-width: 0; }
.iv-side-tools .iv-pop-wrap { flex: none; }
.iv-side-tools .iv-pop-wrap:first-child { flex: 1 1 0; min-width: 0; } .iv-side-tools .iv-pop-wrap:first-child .iv-chip { width: 100%; justify-content: space-between; }
.iv-side-tools .iv-chip { max-width: 100%; min-width: 0; font-size: 12.5px; padding: 5px 8px; }
.iv-side-tools .iv-chip.grow { flex: none; margin-left: auto; font-variant-numeric: tabular-nums; }
.iv-bulk { display: flex; align-items: center; gap: 4px; margin: 0 12px 6px; padding: 5px 8px; border-radius: 10px; background: var(--panel2); font-size: 12.5px; animation: iv-pop .16s cubic-bezier(.2,.9,.3,1.15); }
.iv-bulk span { flex: 1; color: var(--dim); white-space: nowrap; } .iv-bulk button { padding: 3px 7px; border-radius: 7px; font-weight: 600; white-space: nowrap; } .iv-bulk button:hover { background: var(--hover); }
.iv-bulk .del { color: var(--err); } .iv-bulk .del:disabled { opacity: .4; }
.iv-check { width: 18px; height: 18px; flex: none; border-radius: 5px; border: 1.5px solid var(--faint); display: inline-flex; align-items: center; justify-content: center; }
.iv-check.on { background: var(--accent); border-color: var(--accent); }

/* ---------- main ---------- */
.iv-main { flex: 1; display: flex; min-width: 0; min-height: 0; position: relative; }
.iv-col { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; }
.iv-head { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 16px; border-bottom: 1px solid var(--border); flex: none; }
.iv-head-title { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 90px; flex: 0 1 auto; }
.iv-spacer { flex: 1; }
.iv-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: var(--panel2); color: var(--dim); font-size: 12px; font-weight: 600; flex: none; white-space: nowrap; }
.iv-pill.shrink { flex: 0 1 auto; min-width: 0; max-width: 300px; } .iv-pill.shrink > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iv-pill.ok { color: var(--ok); } .iv-pill.warn { color: var(--warn); } .iv-pill.run { color: var(--accent); } .iv-pill.blue { color: var(--link); }
.iv-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); color: var(--text); font-size: 13px; font-weight: 600; white-space: nowrap; max-width: 260px; }
.iv-chip:hover { background: var(--hover); }
.iv-seg { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--panel2); }
.iv-seg button { flex: 1; padding: 6px 4px; border: 0; border-radius: 8px; background: transparent; color: var(--dim); font-size: 13px; font-weight: 600; cursor: pointer; }
.iv-seg button:hover { color: var(--text); } .iv-seg button.on { background: var(--card); color: var(--text); } .iv-seg button.off { opacity: .5; }
.iv-seg-note { margin: 6px 2px 0; color: var(--dim); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.iv-chip > span { overflow: hidden; text-overflow: ellipsis; }
.iv-banner { padding: 8px 16px; background: #1d2a3f; color: var(--link); font-size: 13px; flex: none; }
.iv-banner.err { background: #3a1f1f; color: var(--err); display: flex; align-items: center; gap: 10px; }

.iv-scroll { flex: 1; overflow-y: auto; min-height: 0; padding: 24px 0 16px; }
.iv-stream { width: 100%; max-width: 820px; margin: 0 auto; padding: 0 24px; }
.iv-msg { position: relative; margin: 6px 0 14px; }
.iv-msg.user { display: flex; justify-content: flex-end; }
.iv-user { background: var(--panel2); border-radius: 16px; padding: 9px 14px; max-width: 80%; white-space: pre-wrap; word-break: break-word; }
.iv-user small { display: block; color: var(--dim); margin-top: 2px; }
.iv-copy { position: absolute; top: -4px; right: -4px; opacity: 0; transition: opacity .12s; background: var(--card); border: 1px solid var(--border); border-radius: 8px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--dim); }
.iv-msg:hover .iv-copy { opacity: 1; }
.iv-copy:hover { color: var(--text); }
.iv-sys { text-align: center; color: var(--faint); font-size: 12px; margin: 10px 0; }
.iv-think { color: var(--faint); font-style: italic; font-size: 13px; margin: 4px 0 10px; }
.iv-think summary { cursor: pointer; list-style: none; }
.iv-think summary::-webkit-details-marker { display: none; }
.iv-think[open] summary { margin-bottom: 4px; }
.iv-think div { white-space: pre-wrap; }
.iv-working { display: flex; align-items: center; gap: 8px; color: var(--dim); margin: 8px 0; }
.iv-dots span { display: inline-block; width: 5px; height: 5px; margin-right: 3px; border-radius: 50%; background: var(--accent); animation: iv-bounce 1.2s infinite ease-in-out; }
.iv-dots span:nth-child(2) { animation-delay: .15s; } .iv-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes iv-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }
.iv-top-note { text-align: center; color: var(--faint); font-size: 12px; margin: 4px 0 12px; }
.iv-jump { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%); background: var(--card); border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600; box-shadow: 0 6px 20px #0008; z-index: 4; }
.iv-jump:hover { background: var(--hover); }

/* ---------- tool block ---------- */
.iv-tools { margin: 4px 0 12px; }
.iv-tools-head { display: inline-flex; align-items: center; gap: 6px; color: var(--dim); padding: 3px 6px 3px 2px; border-radius: 8px; }
.iv-tools-head:hover { color: var(--text); background: var(--hover); }
.iv-chev { transition: transform .12s; flex: none; } .iv-chev.open { transform: rotate(90deg); }
.iv-steps { margin: 6px 0 0 8px; border-left: 1.5px solid var(--border); padding-left: 14px; }
.iv-step { margin: 2px 0; }
.iv-step-head { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 4px 6px; border-radius: 8px; color: var(--dim); }
.iv-step-head:hover { background: var(--hover); }
.iv-step-head b { color: var(--text); font-weight: 600; flex: none; }
.iv-step-head .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.iv-step-head.file .t { font-family: var(--mono); font-size: 12.5px; }
.iv-step-head.err b { color: var(--err); }
.iv-diff { display: inline-flex; border-radius: 6px; overflow: hidden; font-size: 12px; font-weight: 700; flex: none; }
.iv-diff i { font-style: normal; padding: 0 6px; } .iv-diff .a { background: var(--add); color: var(--ok); } .iv-diff .d { background: var(--del); color: var(--err); }
.iv-spin { width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: iv-rot .8s linear infinite; flex: none; }
@keyframes iv-rot { to { transform: rotate(360deg); } }
.iv-detail { margin: 4px 0 8px 26px; }
.iv-pre { position: relative; margin: 6px 0; }
.iv-pre pre { margin: 0; background: var(--code); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; overflow-x: auto; max-height: 360px; overflow-y: auto; font: 12.5px/1.55 var(--mono); white-space: pre; color: #d4d4d4; }
.iv-pre pre.err { color: var(--err); }
.iv-pre .iv-copy { top: 6px; right: 6px; opacity: 0; }
.iv-pre:hover .iv-copy { opacity: 1; }
.iv-pre .lbl { position: absolute; top: 6px; left: 12px; font-size: 11px; color: var(--faint); font-family: var(--sans); pointer-events: none; }
.iv-pre.has-lbl pre { padding-top: 26px; }

/* ---------- request cards ---------- */
.iv-req { border: 1px solid var(--warn); background: #2a2618; border-radius: 14px; padding: 14px 16px; margin: 10px 0 14px; }
.iv-req h4 { margin: 0 0 6px; color: var(--warn); font-size: 14px; }
.iv-req p { margin: 0 0 8px; }
.iv-req textarea, .iv-req input[type=text] { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; margin: 6px 0; outline: 0; resize: vertical; }
.iv-req-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.iv-btn { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); font-weight: 600; }
.iv-btn:hover { background: var(--hover); }
.iv-btn.primary { background: var(--accent); border-color: var(--accent); color: #1a1a1a; }
.iv-btn.primary:hover { filter: brightness(1.08); }
.iv-btn.ok { background: var(--ok); border-color: var(--ok); color: #0d1f12; }
.iv-btn.danger { color: var(--err); border-color: #5a2a2a; }
.iv-btn:disabled { opacity: .45; }
.iv-opt { display: block; width: 100%; text-align: left; border: 1px solid var(--border); background: var(--card); border-radius: 10px; padding: 9px 12px; margin: 6px 0; }
.iv-opt:hover { background: var(--hover); }
.iv-opt.on { border-color: var(--accent); background: #2b211c; }
.iv-opt small { display: block; color: var(--dim); }
.iv-qhead { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent); margin-top: 8px; }

/* ---------- composer ---------- */
.iv-compose-wrap { flex: none; padding: 0 24px 16px; }
.iv-compose { width: 100%; max-width: 820px; margin: 0 auto; background: var(--panel2); border: 1px solid var(--border); border-radius: 18px; padding: 10px 12px 8px; transition: border-color .12s; }
.iv-compose:focus-within { border-color: #4d4d4d; }
.iv-compose.drag { border-color: var(--blue); background: #22304a; }
.iv-compose textarea { display: block; width: 100%; background: none; border: 0; outline: 0; resize: none; padding: 4px 4px 8px; max-height: 260px; line-height: 1.55; font-size: 15px; }
.iv-compose-bar { display: flex; align-items: center; gap: 6px; }
.iv-send { width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: #1a1a1a; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.iv-send:disabled { opacity: .35; } .iv-send.stop { background: var(--err); }
.iv-hint { text-align: center; font-size: 11.5px; color: var(--faint); margin: 6px 0 0; }
.iv-attach-row { display: flex; gap: 8px; flex-wrap: wrap; padding: 2px 2px 8px; }
.iv-thumb { position: relative; } .iv-thumb img { width: 64px; height: 64px; object-fit: cover; border-radius: 10px; display: block; background: var(--card); }
.iv-thumb button { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: var(--err); color: #1a1a1a; display: flex; align-items: center; justify-content: center; }
.iv-dropmask { position: absolute; inset: 0; background: #1a1a1acc; border: 2px dashed var(--blue); border-radius: 14px; margin: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: var(--link); z-index: 20; pointer-events: none; }

/* ---------- popover & dialog ---------- */
@keyframes iv-fade { from { opacity: 0; } }
@keyframes iv-pop { from { opacity: 0; transform: scale(.94) translateY(6px); } }
@keyframes iv-toast { from { opacity: 0; transform: translate(-50%, 10px) scale(.96); } }
.iv-scrim { animation: iv-fade .16s ease-out; }
.iv-dialog { animation: iv-pop .22s cubic-bezier(.2,.9,.3,1.15); }
.iv-pop { animation: iv-pop .16s cubic-bezier(.2,.9,.3,1.15); }
.iv-toast { animation: iv-toast .2s cubic-bezier(.2,.9,.3,1.15); }
@media (prefers-reduced-motion: reduce) { .iv-scrim, .iv-dialog, .iv-pop, .iv-toast, .iv-bulk { animation: none; } }
.iv-pop-wrap { position: relative; display: inline-flex; }
.iv-pop { position: absolute; z-index: 30; min-width: 300px; max-width: 380px; background: var(--card); border: 1px solid #3d3d3d; border-radius: 14px; padding: 6px; box-shadow: 0 14px 44px #000a; max-height: 70vh; overflow-y: auto; }
.iv-pop.up { bottom: calc(100% + 8px); left: 0; } .iv-pop.down { top: calc(100% + 8px); left: 0; } .iv-pop.down.right { left: auto; right: 0; }
.iv-pop-title { padding: 8px 10px 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--faint); }
.iv-pop-item { display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border-radius: 9px; }
.iv-pop-item:hover { background: var(--hover); }
.iv-pop-item .n { font-weight: 600; } .iv-pop-item small { display: block; color: var(--dim); font-size: 12px; }
.iv-pop-item .ck { margin-left: auto; color: var(--blue); flex: none; margin-top: 2px; }
.iv-pop hr { border: 0; border-top: 1px solid var(--border); margin: 6px 4px; }
.iv-seg { display: flex; gap: 4px; padding: 4px 6px 8px; flex-wrap: wrap; }
.iv-seg button { padding: 5px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); font-size: 12.5px; font-weight: 600; color: var(--dim); }
.iv-seg button.on { background: #2b211c; border-color: var(--accent); color: var(--text); }
.iv-pop input.iv-pop-search { width: calc(100% - 12px); margin: 4px 6px 6px; padding: 7px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; outline: 0; }
.iv-scrim, .iv-toast { font-size: 14px; line-height: 1.5; font-family: var(--sans); }
.iv-scrim { position: fixed; inset: 0; background: #000a; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 24px; }
.iv-dialog { width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; background: var(--panel); border: 1px solid #3d3d3d; border-radius: 18px; box-shadow: 0 24px 80px #000c; }
.iv-dialog-head { display: flex; align-items: center; padding: 16px 20px 8px; }
.iv-dialog-head h3 { margin: 0; font-size: 17px; flex: 1; }
.iv-dialog-body { padding: 4px 20px 20px; }
.iv-sec { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; margin: 10px 0; }
.iv-sec h5 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: var(--accent); }
.iv-sec p { margin: 0 0 8px; color: var(--dim); font-size: 13px; }
.iv-line { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; } .iv-line span:first-child { color: var(--dim); } .iv-line span:last-child { text-align: right; word-break: break-all; }
.iv-bigcode { font: 700 40px/1.2 var(--mono); letter-spacing: 10px; text-align: center; margin: 12px 0; user-select: all; }
.iv-table { width: 100%; border-collapse: collapse; } .iv-table td { padding: 5px 0; } .iv-table td:first-child { color: var(--dim); width: 150px; }
.iv-key { font: 600 11px var(--mono); background: var(--bg); border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 6px; padding: 1px 6px; color: var(--text); margin-right: 3px; }

/* ---------- penggunaan ---------- */
.iv-panel { width: 340px; flex: none; border-left: 1px solid var(--border); background: var(--panel); overflow-y: auto; min-height: 0; padding: 14px 16px 24px; }
.iv-meter { height: 9px; border-radius: 5px; background: #3a3a3a; display: flex; overflow: hidden; }
.iv-meter.plan { background: #0f2747; } .iv-meter.plan i { background: var(--blue); }
.iv-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; }
.iv-card .row { display: flex; justify-content: space-between; margin-bottom: 8px; } .iv-card .row span:last-child { color: var(--dim); }
.iv-card small { display: block; color: var(--dim); margin-top: 8px; font-size: 12.5px; }
.iv-cat { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 13px; } .iv-cat .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .iv-cat .v { color: var(--dim); width: 56px; text-align: right; } .iv-cat .p { color: var(--dim); width: 48px; text-align: right; }
.iv-cat i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.iv-ring { transform: rotate(-90deg); }

/* ---------- selamat datang / pairing ---------- */
.iv-welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; min-height: 0; overflow-y: auto; }
.iv-welcome h1 { font-size: 30px; margin: 0 0 6px; font-weight: 700; text-align: center; }
.iv-welcome p.sub { color: var(--dim); margin: 0 0 26px; text-align: center; }
.iv-welcome .iv-compose-wrap { width: 100%; padding: 0; }
.iv-welcome-opts { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
.iv-pair { width: 100%; max-width: 440px; background: var(--panel); border: 1px solid var(--border); border-radius: 20px; padding: 28px; }
.iv-pair h2 { margin: 0 0 6px; font-size: 22px; } .iv-pair p { color: var(--dim); margin: 0 0 14px; }
.iv-pair label { display: block; font-size: 12px; font-weight: 700; color: var(--dim); margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .5px; }
.iv-pair input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; outline: 0; }
.iv-pair input:focus { border-color: #5a5a5a; }
.iv-pair input.code { font: 700 28px var(--mono); letter-spacing: 10px; text-align: center; }
.iv-pair .err { color: var(--err); margin: 10px 0 0; font-size: 13px; }
.iv-pair code { background: var(--code); padding: 2px 7px; border-radius: 6px; font-family: var(--mono); color: var(--accent); }

.iv-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: var(--card); border: 1px solid #444; border-radius: 12px; padding: 10px 16px; box-shadow: 0 10px 40px #000a; z-index: 80; max-width: 520px; }

/* ---------- markdown ---------- */
.iv-md { word-break: break-word; }
.iv-md > :first-child { margin-top: 0; } .iv-md > :last-child { margin-bottom: 0; }
.iv-md p { margin: .55em 0; font-size: 15px; line-height: 1.65; }
.iv-md h1, .iv-md h2, .iv-md h3, .iv-md h4 { margin: 1.1em 0 .4em; line-height: 1.3; } .iv-md h1 { font-size: 21px; } .iv-md h2 { font-size: 18px; } .iv-md h3 { font-size: 16px; } .iv-md h4 { font-size: 15px; }
.iv-md ul, .iv-md ol { margin: .4em 0; padding-left: 1.5em; } .iv-md li { margin: .2em 0; font-size: 15px; line-height: 1.6; } .iv-md li > p { margin: .2em 0; }
.iv-md a { color: var(--link); text-decoration: none; } .iv-md a:hover { text-decoration: underline; }
.iv-md blockquote { margin: .6em 0; padding: 2px 14px; border-left: 3px solid #4a4a4a; color: var(--dim); }
.iv-md hr { border: 0; border-top: 1px solid var(--border); margin: 1.2em 0; }
.iv-md code { font: 13px var(--mono); background: var(--code); border: 1px solid #2c2c2c; border-radius: 6px; padding: 1px 5px; }
.iv-md .iv-pre code { background: none; border: 0; padding: 0; }
.iv-md .iv-pre pre { padding-top: 30px; }
.iv-md .iv-pre .lbl { font-size: 11.5px; }
.iv-md .tbl { overflow-x: auto; margin: .7em 0; } .iv-md table { border-collapse: collapse; font-size: 14px; } .iv-md th, .iv-md td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; } .iv-md th { background: var(--card); }
.iv-md img { max-width: 100%; border-radius: 8px; }
.iv-md input[type=checkbox] { margin-right: 6px; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-section, .hljs-link { color: #ff7b72; }
.hljs-string, .hljs-title.class_, .hljs-regexp, .hljs-addition { color: #a5d6ff; }
.hljs-built_in, .hljs-type, .hljs-number, .hljs-attr, .hljs-attribute { color: #79c0ff; }
.hljs-title, .hljs-title.function_, .hljs-name, .hljs-selector-id, .hljs-selector-class { color: #d2a8ff; }
.hljs-comment, .hljs-quote, .hljs-meta { color: #8b949e; font-style: italic; }
.hljs-variable, .hljs-template-variable, .hljs-params, .hljs-symbol, .hljs-bullet { color: #ffa657; }
.hljs-deletion { color: #ffa198; background: #490202; } .hljs-addition { background: #04260f; }
.hljs-emphasis { font-style: italic; } .hljs-strong { font-weight: 700; }
.iv-dl { white-space: pre; padding: 0 4px; margin: 0 -4px; } .iv-dl.a { background: var(--add); color: #b7f0c8; } .iv-dl.d { background: var(--del); color: #ffc2c2; }
`
