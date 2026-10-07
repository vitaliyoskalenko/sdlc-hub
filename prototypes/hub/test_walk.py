from playwright.sync_api import sync_playwright
import os,sys
d=os.path.dirname(os.path.abspath(__file__))
# The prototype is a page fragment: wrap it the way the Artifact host does before opening it.
open(d+'/preview.html','w',encoding='utf-8').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#f6f6f4}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+open(d+'/sdlc-hub-prototype.html',encoding='utf-8').read()+'</body></html>')
PEOPLE=['olena','maksym','daria','taras','petro','andrii','sofiia','iryna','bohdan','nazar']
PAGES=['home','features','people','settings']
FT=['flow','docs','tasks','qa','release','costs']
FEATS=['tasks-issues','bulk-order-export','returns-portal','order-notes-fix','staff-permissions']
def ov(pg): return pg.evaluate("()=>{const de=document.documentElement;return de.scrollWidth-de.clientWidth}")
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in [(1366,820),(390,800)]:
        pg=b.new_page(viewport={'width':w,'height':h}); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('file://'+d+'/preview.html'); pg.wait_for_timeout(300)
        bad=[]; ntask=0; ninfo=0
        for person in PEOPLE:
            pg.select_option('#persona',person)
            pg.click('#guidebtn'); pg.wait_for_timeout(15)
            if ov(pg): bad.append((person,'guide',ov(pg)))
            for k in range(len(pg.query_selector_all('#main [data-info]'))):
                pg.query_selector_all('#main [data-info]')[k].click(); pg.wait_for_timeout(10); ninfo+=1
                assert pg.is_visible('#dlg .dlg'),'dlg'
                if ov(pg) or pg.evaluate("()=>{const s=document.querySelector('.dlg');return s.scrollWidth-s.clientWidth}")>1: bad.append((person,'info',k))
                pg.keyboard.press('Escape'); assert not pg.is_visible('#dlg')
            for page in PAGES:
                pg.click(f'.nb[data-page="{page}"]'); pg.wait_for_timeout(15)
                if ov(pg): bad.append((person,page,ov(pg)))
                if page=='home':
                    n=len(pg.query_selector_all('[data-task]'))
                    for i in range(n):
                        pg.click(f'[data-task="{i}"]'); pg.wait_for_timeout(15); ntask+=1
                        assert pg.is_visible('#sheet .sheet'), 'sheet'
                        sw=pg.evaluate("()=>{const s=document.querySelector('.sheet');return s.scrollWidth-s.clientWidth}")
                        if sw>1 or ov(pg): bad.append((person,'task',i,sw,ov(pg)))
                        for b2 in pg.query_selector_all('#sheet [data-info]'):
                            b2.click(); pg.wait_for_timeout(10); ninfo+=1
                            assert pg.is_visible('#dlg .dlg'); pg.keyboard.press('Escape')
                        assert pg.is_visible('#sheet .sheet')
                        pg.keyboard.press('Escape'); assert not pg.is_visible('#sheet')
                if page=='features':
                    pg.click('[data-fview="graph"]'); pg.wait_for_timeout(15)
                    if ov(pg): bad.append((person,'graph',ov(pg)))
                    for ff in ['mine','progress','released','all']:
                        pg.click(f'[data-ffilter="{ff}"]')
                        if ov(pg): bad.append((person,'graph',ff,ov(pg)))
                    pg.click('[data-fview="list"]')
                    pg.click('tr.click'); 
                    for ft in FEATS:
                        pg.select_option('#featsel',ft)
                        for t in FT:
                            pg.click(f'.tab[data-ftab="{t}"]'); pg.wait_for_timeout(8)
                            if ov(pg): bad.append((person,ft,t,ov(pg)))
                    pg.select_option('#featsel','tasks-issues'); pg.click('.tab[data-ftab="flow"]')
                if page=='people':
                    pg.click('[data-act="script"][data-id="iryna"]'); 
                    if ov(pg): bad.append((person,'script',ov(pg)))
                    pg.click('[data-act="dlscript"]')
        print(w,h,'tasks opened',ntask,'info dialogs',ninfo,'errors',errs[:3],'overflow',bad[:12])
        pg.close()
    # screenshots
    pg=b.new_page(viewport={'width':1366,'height':900}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('file://'+d+'/preview.html'); pg.wait_for_timeout(400)
    pg.screenshot(path=d+'/v-home.png',full_page=True)
    pg.click('[data-task="0"]'); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v-task-qa.png')
    pg.click('#sheet .btn.pri[data-go]'); pg.wait_for_timeout(100); print('after task go:',pg.inner_text('.tab[aria-selected="true"]'), pg.is_visible('#sheet'))
    pg.screenshot(path=d+'/v-feature.png')
    pg.select_option('#persona','olena'); pg.click('.nb[data-page="home"]'); pg.click('[data-task="0"]'); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v-task-signoff.png')
    pg.click('#sheet [data-act="signoff"]'); pg.wait_for_timeout(100); print('signoff in sheet ok:', 'Done' in pg.inner_text('#sheet'))
    pg.keyboard.press('Escape')
    pg.select_option('#persona','maksym'); pg.click('.nb[data-page="home"]'); pg.click('[data-task="0"]'); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v-task-tasks.png'); pg.click('#sheet-x')
    pg.click('.nb[data-page="features"]'); pg.click('[data-fview="graph"]'); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v-graph.png',full_page=True)
    pg.click('.fm.m-ready'); pg.wait_for_timeout(80); print('graph click ->',pg.inner_text('h1'), '| step panel:', pg.inner_text('#steppanel h3'))
    pg.select_option('#persona','nazar'); pg.click('.nb[data-page="people"]'); pg.click('[data-act="script"][data-id="iryna"]'); pg.wait_for_timeout(80); pg.screenshot(path=d+'/v-script.png')
    pg.click('#guidebtn'); pg.screenshot(path=d+'/v-guide.png',full_page=True); pg.click('#main [data-info]'); pg.wait_for_timeout(80); pg.screenshot(path=d+'/v-info.png'); pg.keyboard.press('Escape')
    print('errors',errs); pg.close()
    pg=b.new_page(viewport={'width':390,'height':800}); pg.goto('file://'+d+'/preview.html'); pg.wait_for_timeout(300); pg.screenshot(path=d+'/v-ph-home.png',full_page=True)
    pg.click('[data-task="0"]'); pg.screenshot(path=d+'/v-ph-task.png'); pg.close()
    pg=b.new_page(viewport={'width':1366,'height':900},color_scheme='dark'); pg.goto('file://'+d+'/preview.html'); pg.click('.nb[data-page="features"]'); pg.click('[data-fview="graph"]'); pg.screenshot(path=d+'/v-dark-graph.png',full_page=True); pg.close()
    b.close()
