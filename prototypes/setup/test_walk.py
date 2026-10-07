from playwright.sync_api import sync_playwright
import os,re
d=os.path.dirname(os.path.abspath(__file__))
s=open(d+'/sdlc-hub-setup.html',encoding='utf-8').read()
open(d+'/setup-check.js','w').write(re.search(r'<script>(.*)</script>',s,re.S).group(1))
open(d+'/setup-preview.html','w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#f6f6f4}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+s+'</body></html>')
assert os.system('node --check '+d+'/setup-check.js')==0
def ov(pg): return pg.evaluate("()=>{const de=document.documentElement;return de.scrollWidth-de.clientWidth}")
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h,tag in [(1366,860,'d'),(390,800,'p')]:
        for host in ['gitlab','github']:
            pg=b.new_page(viewport={'width':w,'height':h}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); bad=[]
            pg.goto('file://'+d+'/setup-preview.html'); pg.wait_for_timeout(400)
            def chk(n,shot=False):
                if ov(pg): bad.append((n,ov(pg)))
                if shot: pg.screenshot(path=f'{d}/u-{tag}-{host}-{n}.png',full_page=True)
            chk('start',host=='gitlab')
            pg.click('[data-act="begin"]'); pg.click(f'[data-set="host"][data-val="{host}"]')
            assert pg.is_disabled('[data-act="next"]')
            pg.click('[data-act="signin"]')
            if host=='github':
                pg.click('[data-act="plan"]'); assert pg.is_disabled('[data-act="next"]'); chk('s1free',tag=='d'); pg.click('[data-act="advisory"]')
            chk('s1',True); pg.click('[data-act="next"]')
            # repositories: flexible list
            pg.click('[data-act="addteam"]'); pg.keyboard.type('Desktop'); pg.fill('#f-t4-repo','desktop-app'); pg.select_option('#f-t4-kind','desktop')
            pg.click('[data-act="rmteam"][data-i="2"]'); chk('s2',True)
            if host=='github': pg.click('[data-act="preset"][data-i="2"]'); chk('s2one',tag=='d')
            pg.click('[data-act="next"]')
            pg.click('[data-set="tracker"][data-val="none"]'); chk('s3none',host=='gitlab' and tag=='d'); pg.click('[data-set="tracker"][data-val="jira"]')
            if host=='gitlab':
                pg.fill('#f-jira-key',''); assert pg.is_disabled('[data-act="next"]'); pg.fill('#f-jira-key','SHOP'); chk('s3jira',True)
            pg.click('[data-act="next"]'); chk('s4',host=='gitlab' and tag=='d'); pg.click('[data-act="next"]'); chk('s5',True)
            # validation: break screen 2, the rail must not reach review
            pg.click('#rail-1'); pg.fill('#f-ns',''); assert pg.is_disabled('#rail-4'), 'rail not locked'; pg.fill('#f-ns','shop'); pg.click('#rail-4'); assert pg.is_enabled('[data-act="install"]')
            pg.click('[data-act="install"]'); pg.wait_for_selector('a.btn.pri',timeout=15000); chk('done',True)
            print(tag,host,'errors',errs[:3],'overflow',bad, '| log:', pg.inner_text('.log').replace('\n',' / ')[-330:])
            pg.close()
    pg=b.new_page(viewport={'width':1366,'height':860},color_scheme='dark'); pg.goto('file://'+d+'/setup-preview.html'); pg.click('[data-act="begin"]'); pg.click('[data-act="signin"]'); pg.click('[data-act="next"]'); pg.screenshot(path=d+'/u-dark-s2.png',full_page=True)
    b.close()
