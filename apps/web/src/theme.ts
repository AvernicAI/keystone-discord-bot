import { ACCENTS } from "@keystone/ui";

/**
 * The dashboard palette is derived from the same tokens the Discord panels use.
 *
 * There is deliberately no second colour language: an operator who sees green
 * for "healthy" in a panel sees green for "enabled" here, and the audit script
 * rejects a hard-coded accent in a web surface just as it does in a module.
 */
function cssHex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

export const WEB_ACCENTS = {
  brand: cssHex(ACCENTS.brand),
  ok: cssHex(ACCENTS.ok),
  attention: cssHex(ACCENTS.attention),
  danger: cssHex(ACCENTS.danger),
  muted: cssHex(ACCENTS.muted),
} as const;

/**
 * One stylesheet for every page. It is intentionally small: system fonts, no
 * external requests, no client JavaScript. The CSP can therefore stay at
 * `default-src 'none'` and the dashboard still looks like one product.
 */
export const WEB_STYLES = `
:root{
  color-scheme:dark;
  --bg:#0a0c11;--bg-soft:#0e1118;--panel:#12161f;--panel-2:#171c27;--panel-3:#1c2230;
  --line:#252d3b;--line-soft:#1c2330;--text:#e8ecf3;--muted:#97a2b2;--faint:#6f7a8b;
  --brand:${WEB_ACCENTS.brand};--brand-soft:rgba(88,101,242,.14);--brand-line:rgba(88,101,242,.42);
  --ok:${WEB_ACCENTS.ok};--ok-soft:rgba(87,242,135,.12);
  --warn:${WEB_ACCENTS.attention};--warn-soft:rgba(254,231,92,.12);
  --danger:${WEB_ACCENTS.danger};--danger-soft:rgba(237,66,69,.12);
  --muted-accent:${WEB_ACCENTS.muted};
  --radius:12px;--radius-sm:8px;
  --shadow:0 1px 0 rgba(255,255,255,.03),0 14px 40px rgba(0,0,0,.28);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:
  radial-gradient(1200px 600px at 78% -10%,rgba(88,101,242,.12),transparent 62%),
  radial-gradient(900px 500px at 8% 0%,rgba(87,242,135,.05),transparent 55%),
  var(--bg);
  color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:#aab6ff;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:2px}
h1,h2,h3{line-height:1.2;letter-spacing:-.015em;margin:0}
h1{font-size:clamp(24px,2.4vw,31px);font-weight:680}
h2{font-size:17px;font-weight:650}
h3{font-size:15px;font-weight:650}
p{margin:0 0 12px}ul{margin:8px 0;padding-left:20px}li{margin:4px 0}
code,pre,kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
code{background:var(--panel-3);border:1px solid var(--line-soft);border-radius:5px;padding:1px 5px;font-size:12.5px;color:#d7def0}
pre{white-space:pre-wrap;word-break:break-word;background:#0a0e15;border:1px solid var(--line);border-radius:var(--radius-sm);padding:14px;overflow:auto;font-size:12.5px}
.muted{color:var(--muted)}.faint{color:var(--faint)}.error{color:#ffb4b4}
.icon{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:-3px}
.small{font-size:13px}.tiny{font-size:12px}.nowrap{white-space:nowrap}
.skip{position:absolute;left:-9999px;top:8px;background:var(--brand);color:#fff;padding:8px 12px;border-radius:8px;z-index:50}
.skip:focus{left:8px}
:focus-visible{outline:2px solid #aab6ff;outline-offset:2px;border-radius:6px}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;
  min-height:60px;padding:10px 22px;border-bottom:1px solid var(--line-soft);
  background:rgba(10,12,17,.84);backdrop-filter:blur(12px)}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--text);font-weight:700;letter-spacing:-.01em}
.brand:hover{text-decoration:none}
.brand-mark{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(145deg,var(--brand),#7c84ff 55%,#3d47c9);
  box-shadow:0 0 0 1px rgba(255,255,255,.12) inset,0 6px 18px rgba(88,101,242,.35);
  font-size:15px;font-weight:800;color:#fff}
.brand-sub{color:var(--faint);font-weight:500;font-size:13px;border-left:1px solid var(--line);padding-left:12px;margin-left:2px}
.topbar-spacer{flex:1}
.topbar-link{color:var(--muted);font-size:13px;padding:7px 10px;border-radius:8px}
.topbar-link:hover{color:var(--text);background:var(--panel-2);text-decoration:none}
.account{position:relative}
.account>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 9px 5px 5px;border:1px solid transparent;border-radius:999px}
.account>summary::-webkit-details-marker{display:none}
.account>summary:hover{border-color:var(--line);background:var(--panel-2)}
.account .who{font-size:13px;color:var(--text);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.menu{position:absolute;right:0;top:calc(100% + 8px);min-width:220px;background:var(--panel);border:1px solid var(--line);
  border-radius:10px;padding:6px;box-shadow:var(--shadow);display:grid;gap:2px}
.menu a,.menu button{display:block;width:100%;text-align:left;background:none;border:0;color:var(--text);
  padding:9px 10px;border-radius:7px;font:inherit;font-size:13px;cursor:pointer}
.menu a:hover,.menu button:hover{background:var(--panel-2);text-decoration:none}
.menu .danger{color:#ffb4b4}
.avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;background:var(--panel-3);display:grid;place-items:center;
  font-size:11px;font-weight:700;color:#cfd7ff;border:1px solid var(--line)}
.avatar.lg{width:38px;height:38px;font-size:13px;border-radius:11px}
.layout{display:grid;grid-template-columns:238px minmax(0,1fr);gap:30px;max-width:1320px;margin:0 auto;padding:26px 24px 60px}
.layout.solo{grid-template-columns:minmax(0,1fr)}
.sidebar{position:sticky;top:86px;align-self:start;display:grid;gap:18px}
.guild-chip{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:var(--radius);
  background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow)}
.guild-chip .name{display:block;font-weight:640;font-size:14px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.guild-chip .scope{display:block;font-size:11.5px;color:var(--faint);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav{display:grid;gap:2px}
.nav-group{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--faint);font-weight:650;padding:12px 10px 5px}
.nav-link{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;color:var(--muted);font-size:13.5px;border:1px solid transparent}
.nav-link:hover{color:var(--text);background:var(--panel-2);text-decoration:none}
.nav-link[aria-current="page"]{color:#fff;background:var(--brand-soft);border-color:var(--brand-line)}
.nav-link .icon{opacity:.85}
.sidebar-foot{padding:10px;border-top:1px solid var(--line-soft);display:grid;gap:4px}
.content{min-width:0}
.breadcrumb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--faint);font-size:12.5px;margin-bottom:14px}
.breadcrumb a{color:var(--muted)}
.page-head{display:flex;gap:18px;align-items:flex-start;justify-content:space-between;margin:2px 0 22px;flex-wrap:wrap}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--brand);font-weight:700;margin-bottom:7px}
.lede{color:var(--muted);max-width:72ch;margin-top:8px;font-size:14.5px}
.page-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}
.fact{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--panel);
  border-radius:999px;padding:6px 11px;font-size:12.5px;color:var(--muted)}
.fact b{color:var(--text);font-weight:650}
.fact .dot{width:7px;height:7px;border-radius:50%;background:var(--muted-accent);flex:none}
.fact .dot.ok{background:var(--ok)}.fact .dot.warn{background:var(--warn)}.fact .dot.brand{background:var(--brand)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start}
.grid.three{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.stat{background:linear-gradient(180deg,var(--panel-2),var(--panel));border:1px solid var(--line);border-radius:var(--radius);
  padding:15px 16px;min-height:88px;display:flex;flex-direction:column;justify-content:space-between}
.stat .label{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:7px}
.stat b{display:block;font-size:27px;font-weight:680;letter-spacing:-.02em;margin-top:10px}
.stat a{font-size:12px;color:var(--muted)}
.card,.panel{background:linear-gradient(180deg,rgba(23,28,39,.9),var(--panel));border:1px solid var(--line);border-radius:var(--radius);
  padding:18px;margin:0 0 16px;box-shadow:var(--shadow)}
.panel h2{margin-bottom:8px}
.card.tight{padding:15px}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
.card-head p{margin:4px 0 0;color:var(--muted);font-size:13px}
.card-link{font-size:12.5px;color:var(--muted);white-space:nowrap}
.section-title{display:flex;align-items:center;gap:9px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);font-weight:700;margin:26px 0 10px}
#modules{scroll-margin-top:84px}
.pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 9px;font-size:11.5px;font-weight:650;
  border:1px solid var(--line);background:var(--panel-3);color:var(--muted);white-space:nowrap}
.pill.ok{color:#b9ffd0;border-color:rgba(87,242,135,.32);background:var(--ok-soft)}
.pill.warn{color:#fff6b8;border-color:rgba(254,231,92,.32);background:var(--warn-soft)}
.pill.danger{color:#ffc9c9;border-color:rgba(237,66,69,.34);background:var(--danger-soft)}
.pill.brand{color:#dbe0ff;border-color:var(--brand-line);background:var(--brand-soft)}
.pill.off{opacity:.75}
.module-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.module{background:linear-gradient(180deg,var(--panel-2),var(--panel));border:1px solid var(--line);border-radius:var(--radius);
  padding:15px;display:flex;flex-direction:column;gap:10px;min-height:156px;transition:border-color .15s,transform .15s}
.module:hover{border-color:#38445a}
.module-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.module h3{display:flex;align-items:center;gap:8px;font-size:14.5px}
.module p{margin:0;color:var(--muted);font-size:13px;line-height:1.5;flex:1}
.module-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--line-soft);padding-top:10px}
.toggle-form{margin:0}
.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:7px;background:var(--panel-3);color:var(--text);
  border:1px solid var(--line);border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.btn:hover,button:hover{border-color:#3b475c;background:#222938;text-decoration:none}
.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.btn.primary:hover{background:#6a76ff}
.btn.ghost{background:transparent}
.btn.small{padding:4px 9px;font-size:12px;border-radius:7px}
.btn.danger{color:#ffc9c9;border-color:rgba(237,66,69,.4);background:var(--danger-soft)}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.notice,.form-error,.empty{border-radius:10px;padding:12px 14px;margin:0 0 14px;font-size:13.5px;border:1px solid}
.notice{border-color:rgba(87,242,135,.3);background:var(--ok-soft);color:#c9ffdb}
.form-error{border-color:rgba(237,66,69,.42);background:var(--danger-soft);color:#ffd4d4}
.empty{border-color:var(--line);background:var(--panel);color:var(--muted)}
.empty strong{display:block;color:var(--text);margin-bottom:3px}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line-soft);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--faint);font-weight:650;background:rgba(255,255,255,.015)}
tr:last-child td{border-bottom:0}
tbody tr:hover td{background:rgba(255,255,255,.012)}
.checklist{display:grid;gap:10px}
.check-item{display:flex;gap:12px;align-items:flex-start;padding:12px 13px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2)}
.check-mark{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:12px;
  background:var(--panel-3);color:var(--muted);border:1px solid var(--line)}
.check-mark.done{background:var(--ok-soft);color:var(--ok);border-color:rgba(87,242,135,.35)}
.check-item .body{min-width:0;flex:1}
.check-item .label{font-weight:640;font-size:13.5px}
.check-item .detail{color:var(--muted);font-size:12.5px;margin-top:2px}
.check-item a{font-size:12.5px;white-space:nowrap}
.progress{height:7px;border-radius:999px;background:var(--panel-3);overflow:hidden;margin:10px 0 4px}
.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--brand),#8a92ff);border-radius:999px}
.bar-row{display:grid;grid-template-columns:190px minmax(0,1fr) 56px;gap:14px;align-items:center;padding:8px 0;font-size:13px}
.bar-row .source{display:flex;flex-direction:column;gap:1px;min-width:0}
.bar-row .source b{font-weight:600;font-size:13px;line-height:1.3}
.bar-row .source code{align-self:flex-start;font-size:11.5px;color:var(--faint);background:none;border:0;padding:0}
.bar{height:8px;border-radius:999px;background:var(--panel-3);overflow:hidden}
.bar span{display:block;height:100%;background:var(--brand);border-radius:999px}
.bar-row .num{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
fieldset{border:1px solid var(--line);border-radius:10px;margin:16px 0;padding:6px 16px 14px;background:rgba(255,255,255,.01)}
legend{padding:0 7px;font-weight:650;font-size:13px}
.field{display:flex;flex-direction:column;gap:5px;margin:13px 0}
.field.check{flex-direction:row;align-items:center;gap:9px;margin:10px 0}
.field label,.field .label{font-weight:600;font-size:13.5px}
.field input[type=text],.field input[type=number],.field input[type=url],.field input[type=password],.field select{
  background:#0a0e15;border:1px solid var(--line);border-radius:8px;padding:9px 11px;color:var(--text);font:inherit;width:100%;max-width:560px}
.field input[type=checkbox]{width:17px;height:17px;accent-color:var(--brand)}
.field input[type=file]{background:var(--panel-3);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--muted);font:inherit;width:100%;max-width:560px}
.field input[type=file]::file-selector-button{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:7px;
  padding:6px 10px;margin-right:10px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.field textarea{width:100%;max-width:720px;min-height:90px;background:#0a0e15;border:1px solid var(--line);border-radius:8px;
  padding:10px 11px;color:var(--text);font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}
.field small{color:var(--faint);font-size:12px}
.field p.error{margin:0;font-size:12.5px}
.form-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--line-soft)}
.form-actions .hint{color:var(--faint);font-size:12.5px}
.channel-group{margin-bottom:16px}
.channel-group h3{display:flex;align-items:center;gap:8px;margin-bottom:6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.07em}
.channel-row{display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--line-soft);font-size:13.5px}
.channel-row:last-child{border-bottom:0}
.channel-row .id{margin-left:auto}
.channel-row .icon{color:var(--faint)}
.role-dot{width:10px;height:10px;border-radius:50%;flex:none;border:1px solid rgba(255,255,255,.18)}
.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.tool{display:block;border:1px solid var(--line);border-radius:10px;padding:13px;background:var(--panel);color:var(--text)}
.tool:hover{border-color:#38445a;text-decoration:none}
.tool b{display:block;font-size:13.5px;margin-bottom:3px}
.tool span{color:var(--muted);font-size:12.5px;line-height:1.45}
.hero{padding:34px 0 8px;max-width:820px}
.hero h1{font-size:clamp(34px,5vw,54px);letter-spacing:-.035em;line-height:1.02}
.hero .lede{font-size:17px;max-width:64ch;margin:18px 0 24px}
.hero-actions{display:flex;gap:10px;flex-wrap:wrap}
.feature{display:flex;gap:12px;align-items:flex-start}
.feature .icon{width:20px;height:20px;color:var(--brand);margin-top:2px}
.footer{border-top:1px solid var(--line-soft);color:var(--faint);font-size:12px;padding:18px 24px 30px;max-width:1320px;margin:0 auto;
  display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.footer a{color:var(--muted)}
hr.sep{border:0;border-top:1px solid var(--line-soft);margin:18px 0}
.kbd{font-size:11px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;color:var(--muted);background:var(--panel-2)}
@media (max-width:900px){
  .layout{grid-template-columns:1fr;gap:18px;padding:18px 16px 48px}
  .sidebar{position:static;gap:10px}
  .nav{display:flex;overflow-x:auto;gap:4px;padding-bottom:4px}
  .nav-group{display:none}
  .nav-link{white-space:nowrap;background:var(--panel);border-color:var(--line)}
  .sidebar-foot{display:none}
  .module-grid{grid-template-columns:1fr}
  .topbar{padding:8px 14px;gap:8px}
  .brand-sub{display:none}
  .bar-row{grid-template-columns:100px minmax(0,1fr) 48px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;
