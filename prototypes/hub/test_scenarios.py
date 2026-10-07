from playwright.sync_api import sync_playwright
import os
d=os.path.dirname(os.path.abspath(__file__))
# The prototype is a page fragment: wrap it the way the Artifact host does before opening it.
open(d+'/preview.html','w',encoding='utf-8').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#f6f6f4}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+open(d+'/sdlc-hub-prototype.html',encoding='utf-8').read()+'</body></html>')
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1366,'height':900}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('file://'+d+'/preview.html'); pg.wait_for_timeout(300)
    A=lambda: pg.evaluate("()=>{const a=document.activeElement;return a?(a.id||a.getAttribute('data-ftab')||a.getAttribute('data-page')||a.tagName):null}")
    # step panel commands
    pg.click('.nb[data-page="features"]'); print('focus after nav:',A())
    pg.click('.linkbtn'); pg.wait_for_timeout(50); print('focus after open feature:',A())
    pg.click('.node[data-step="specify"]'); print('done step cmd:',pg.inner_text('#steppanel .cmd code'))
    pg.click('.node[data-step="fix"]'); print('fix cmd:',pg.inner_text('#steppanel .cmd code'))
    pg.click('.node[data-step="autotests"]'); print('autotests cmd:',pg.inner_text('#steppanel .cmd code'))
    pg.select_option('#featsel','returns-portal'); pg.select_option('#persona','olena'); print('signoff cmd:',pg.inner_text('#steppanel .cmd code'),'| now:',pg.inner_text('.now').replace('\n',' / '))
    pg.click('#steppanel [data-info]'); print('signoff help:',pg.inner_text('#dlg pre.out').replace('\n',' / ')[:230]); pg.keyboard.press('Escape'); print('focus back:',A())
    pg.click('.tab[data-ftab="docs"]'); print('focus after tab:',A())
    # maksym blocked
    pg.select_option('#persona','maksym'); pg.select_option('#featsel','bulk-order-export'); pg.click('.tab[data-ftab="flow"]'); print('blocked now:',pg.inner_text('.now').replace('\n',' / ')[:160]); pg.screenshot(path=d+'/w-blocked.png')
    # QA path with return then pass
    pg.select_option('#persona','iryna'); pg.select_option('#featsel','tasks-issues'); pg.click('.tab[data-ftab="qa"]')
    pg.click('[data-act="retform"]'); pg.screenshot(path=d+'/w-return.png',full_page=True); pg.click('[data-act="qareturn"]'); print('returned now:',pg.inner_text('.now').replace('\n',' / ')[:170])
    pg.select_option('#persona','taras'); pg.click('.nb[data-page="home"]'); print('taras actions:',[x.inner_text().split('\n')[1] for x in pg.query_selector_all('[data-task]')])
    pg.select_option('#persona','iryna'); pg.click('.nb[data-page="features"]'); pg.click('.linkbtn'); pg.click('.tab[data-ftab="qa"]'); pg.click('[data-act="simfix"]')
    pg.select_option('select[data-bug="BUG-0012"]','closed'); print('pass enabled with medium bug open:',pg.is_enabled('[data-act="qapass"]'))
    pg.click('[data-act="qapass"]'); pg.wait_for_timeout(50)
    pg.select_option('#persona','olena'); pg.click('.nb[data-page="home"]'); print('olena actions:',[x.inner_text().split('\n')[1] for x in pg.query_selector_all('[data-task]')])
    pg.click('[data-task="0"]'); pg.click('#sheet .btn.pri[data-go]'); pg.click('[data-act="accept"]')
    pg.select_option('#persona','maksym'); pg.click('[data-act="nogo"]'); print('nogo:',pg.inner_text('.now').replace('\n',' / ')[:140]); pg.click('[data-act="go"]')
    pg.select_option('#persona','bohdan')
    for i in range(4): pg.click(f'[data-act="deploy"][data-id="{i}"]')
    for i in (2,3):
        for _ in range(3):
            if pg.query_selector(f'[data-act="roll"][data-id="{i}"]'): pg.click(f'[data-act="roll"][data-id="{i}"]')
    print('released now:',pg.inner_text('.now').replace('\n',' / ')[:120]); pg.click('.nb[data-page="home"]'); print('home tiles:',[x.inner_text().replace('\n',' ') for x in pg.query_selector_all('.kpis.four .kpi')][:8]); print('bohdan actions:',[x.inner_text().split('\n')[1] for x in pg.query_selector_all('[data-task]')])
    # github sign
    pg.select_option('#persona','nazar'); pg.click('.nb[data-page="settings"]'); pg.screenshot(path=d+'/w-settings.png',full_page=True); pg.click('[data-act="host"][data-id="github"]'); pg.click('#guidebtn'); pg.query_selector_all('#main [data-info]')[0].click(); t=pg.inner_text('#dlg'); print('github leftovers:',[k for k in ['!2','GitLab','merge request','ipeline'] if k in t]); pg.keyboard.press('Escape')
    pg.click('.nb[data-page="settings"]'); pg.click('[data-act="host"][data-id="gitlab"]'); pg.click('[data-asst="cursor"]'); pg.wait_for_timeout(50); print('cursor still checked (Petro uses it):',pg.is_checked('[data-asst="cursor"]'))
    # add person
    pg.click('.nb[data-page="people"]'); pg.click('[data-act="apform"]'); pg.fill('#ap-user','lesia.b'); pg.fill('#ap-name','Lesia B.'); pg.click('[data-act="addperson"]'); print('people rows:',len(pg.query_selector_all('#main table tbody tr')), 'persona opts:',len(pg.query_selector_all('#persona option')))
    pg.screenshot(path=d+'/w-people.png')
    print('errors',errs); pg.close()
    pg=b.new_page(viewport={'width':1366,'height':900}); pg.goto('file://'+d+'/preview.html#admin'); pg.wait_for_timeout(200); print('hash admin ->',pg.inner_text('h1'),pg.input_value('#persona')); pg.close()
    pg=b.new_page(viewport={'width':390,'height':800}); pg.goto('file://'+d+'/preview.html'); pg.click('.nb[data-page="features"]'); pg.click('.linkbtn'); pg.wait_for_timeout(100); pg.screenshot(path=d+'/w-ph-feature.png'); print('phone overflow',pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")); pg.close()
    b.close()
