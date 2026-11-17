import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'
import { listenSafe } from '../server.ts'

export async function menuFixture(initial: { state?: Record<string, unknown>; apps?: Array<{ id: string; name: string }>; settings?: boolean; storage?: Record<string, string> } = {}) {
  const client = fs.readFileSync(path.join(process.env.DFA_PROJECT!, 'lib/client.js'), 'utf8')
  let settingsBoot = ''
  if (initial.settings) {
    const build = createRequire(fs.realpathSync(path.join(process.cwd(), 'node_modules/tsx/package.json')))('esbuild').buildSync
    const rendererRequire = createRequire(path.join(process.cwd(), 'packages/client/ui-renderer/package.json'))
    settingsBoot = build({ stdin: { contents: `
      import React from ${JSON.stringify(rendererRequire.resolve('react'))};
      import {createRoot} from ${JSON.stringify(rendererRequire.resolve('react-dom/client'))};
      window.React = React; window.settingsSections = [];
      window.slotDeclared = new Set(['settings.section']);
      const root = createRoot(document.getElementById('settings'));
      window.slots = { inject(_name, fn) {return fn()}, register(meta, Component) {
        if (!window.slotDeclared.has(meta.name)) throw new Error('slot "' + meta.name + '" is not declared');
        if (meta.name === 'settings.section.icon') {
          const button = document.querySelector('#settings-nav button[data-section-id="' + meta.id + '"]');
          if (!button) return () => {};
          const host = document.createElement('span');
          button.prepend(host);
          const iconRoot = createRoot(host);
          iconRoot.render(React.createElement(Component, { size: 16, active: false }));
          return () => {iconRoot.render(null); host.remove()};
        }
        window.settingsSections.push(meta);
        const button = document.createElement('button');
        button.dataset.sectionId = meta.id;
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg><span></span>';
        button.querySelector('span').textContent = typeof meta.label === 'function' ? meta.label() : meta.label;
        document.getElementById('settings-nav').appendChild(button);
        root.render(React.createElement(Component));
        return () => {button.remove();root.render(null); window.settingsSections = window.settingsSections.filter(item => item !== meta)};
      }};
    `, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' }).outputFiles[0].text
  }

  const server = createServer((req, res) => {
    if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript'); res.end(client); return }
    if (req.url === '/icon.svg') { res.setHeader('content-type', 'image/svg+xml'); res.end(fs.readFileSync(path.join(process.env.DFA_PROJECT!, 'icon.svg'))); return }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><html lang="en" style="font-size:16px;color-scheme:dark"><head><meta charset="utf-8">
      <style>body{font:16px system-ui;background:#181818;color:#eee;padding:28px}button,code,a{margin:8px}
      .controls{display:flex;flex-wrap:wrap;max-width:500px}</style></head><body>
      <div class="controls"><button id="note" data-file-actions-path="note.txt">note.txt</button>
      <button id="image" data-file-actions-path="image.svg">image.svg</button>
      <button id="image2" data-file-actions-path="image2.svg">image2.svg</button>
      <button id="missing" data-file-actions-path="missing.txt">missing.txt</button>
      <code id="guess" tabindex="0">guess.txt</code><code id="nested" tabindex="0">docs/HANDOFF.md</code><span id="prose">missing-prose.txt</span>
      <span id="plain" tabindex="0">plain.txt</span>
      <code id="reference" tabindex="0">note.txt</code>
      <pre><code id="fenced">fenced-only.txt</code></pre>
      <a id="link" href="https://example.com/docs">Documentation</a>
      <div id="tree-row" class="row" role="button" title="C:/workspace/note.txt">note.txt</div>
      <div id="changed-card" data-changed-files data-single="true"><button id="changed-header" aria-describedby="changed-desc" aria-label="查看 note.txt 的改动"><span>已编辑 note.txt</span></button><span id="changed-desc" hidden>C:/workspace/changed-report.md</span></div>
      <div id="changed-multi" data-changed-files><button id="changed-row" aria-describedby="changed-row-desc" aria-label="查看 data.csv 的改动"><span>data.csv</span></button><span id="changed-row-desc" hidden>C:/workspace/changed-data.csv</span></div>
      <div id="changed-preview" data-changes-hover-preview><span data-changes-preview-path>C:/workspace/changed-report.md</span></div>
      <button id="media-image" type="button"><img id="media-img" src="/api/file?path=C%3A%5Cworkspace%5Cmedia-report.png" alt="media-report.png"></button></div>
      ${initial.settings ? '<section role="dialog" aria-label="Settings fixture"><nav id="settings-nav"><button id="other-section"><svg width="16" height="16"><circle cx="8" cy="8" r="6" /></svg><span>Other settings</span></button></nav><div id="settings"></div></section>' : '<div id="settings"></div>'}<script>${settingsBoot.replaceAll('</script', '<\/script')}</script>
      <script>window.__ModuleLoader__={load(def){window.plugin=def.factory(name=>{if(name==='react')return window.React;throw Error(name)})}};</script>
      <script src="/client.js"></script><script>
      window.state={missing:true,apps:'ready',delayApps:false,delayThumb:false};
      window.calls={opens:[],apps:0,stats:0,paths:[]}; window.lastPrevented=null;
      // Success toasts hide after 1.8s; a runner stall can outlive that window,
      // so record every toast text as it appears and assert against the log.
      window.toastLog=[];
      new MutationObserver(()=>{const el=document.querySelector('.dfa-toast');const text=el&&el.textContent;if(text&&!window.toastLog.includes(text))window.toastLog.push(text)}).observe(document.body,{childList:true,subtree:true,characterData:true});
      document.addEventListener('contextmenu',e=>window.lastPrevented=e.defaultPrevented);
      window.apps=[{id:'player',name:'Media Player'},{id:'code',name:'Visual Studio Code'},
        {id:'notepad',name:'Notepad',default:true},...Array.from({length:7},(_,i)=>({id:'other'+i,name:'Other '+i}))];
      Object.assign(window.state, ${JSON.stringify(initial.state || {})});
      if (${JSON.stringify(Boolean(initial.apps))}) window.apps=${JSON.stringify(initial.apps || [])};
      if(!sessionStorage.getItem('dfa-fixture-seeded')){for(const [key,value] of Object.entries(${JSON.stringify(initial.storage || {})}))localStorage.setItem(key,value);sessionStorage.setItem('dfa-fixture-seeded','1')}
      window.uiLanguage="en";
      window.ctx={get(name){return name==='slots'?window.slots:undefined},effect(fn){window.cleanup=fn()},sessions:{list:{getSnapshot:()=>({byId:{
        active:{id:'active',cwd:'/workspace',retainedBy:{mainView:1}}}})}},remote:{
        session:{openWorkspacePath:async request=>{calls.opens.push(request);return {ok:true,value:{opened:true}}},
          workspacePathApplications:async(request)=>{calls.apps++;(calls.appsPaths??=[]).push(request&&request.path);if(state.delayApps)await new Promise(r=>window.releaseApps=r);
            return state.apps==='failed'?{ok:false,error:{code:'gateway/internal'}}:{ok:true,value:state.apps==='empty'?[]:apps}}},
        workspaceFiles:{stat:async(id,path)=>{calls.stats++;calls.paths.push(path);
          if(state.exists!==undefined){const live=Array.isArray(state.exists)?state.exists:[state.exists];if(!live.includes(path))return {ok:false,error:{code:'workspace-file/not-found'}}}
          if((path.endsWith('missing.txt')&&state.missing)||path.endsWith('missing-prose.txt'))
            return {ok:false,error:{code:'workspace-file/not-found'}};
          return {ok:true,value:{absolutePath:path,bytes:32,version:'v1'}}},
          list:async(id,path,signal)=>{
            calls.lists=(calls.lists||0)+1;
            if(state.failListOnce&&path==='/workspace'){state.failListOnce=false;return {ok:false,error:{code:'gateway/internal'}}}
            if(state.delayList&&path==='/workspace')await new Promise((resolve,reject)=>{
              window.releaseList=resolve;
              signal?.addEventListener('abort',()=>{state.listAborted=true;reject(new Error('aborted'))},{once:true});
            });
            return state.dirs&&state.dirs[path]
              ?{ok:true,value:{path,entries:state.dirs[path],truncated:false}}
              :{ok:false,error:{code:'workspace-file/not-found'}}},
          readBytes:async(id,path)=>{if(state.delayThumb)await new Promise(r=>{const w=window;w.thumbWaiters??=[];
              w.thumbWaiters.push(r);w.releaseThumb=()=>{w.thumbWaiters.splice(0).forEach(fn=>fn())}});
            const marker=path.includes('image2')?'#00ff00':'#ff0000';
            const svg='<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><rect width="40" height="24" fill="'+marker+'"/></svg>';
            return {ok:true,value:{data:new TextEncoder().encode(svg),eof:true}}}
        }}};if(window.slots)ctx.locale={language:{getSnapshot:()=>window.uiLanguage}};plugin.apply(ctx);
      </script></body></html>`)
  })
  await listenSafe(server)
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true })
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1100, height: 850 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // Park away from fixture controls before navigation: Chromium may emit a
  // pointerover during the first paint, which would warm a supposedly cold case.
  await page.mouse.move(1090, 840)
  try { await page.goto(`http://127.0.0.1:${(server.address() as any).port}/`) }
  catch (error) { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); throw error }
  return { page, errors, async dispose() { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
