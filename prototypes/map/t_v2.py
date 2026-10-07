from playwright.sync_api import sync_playwright
import os, sys, json
d=os.path.dirname(os.path.abspath(__file__))
def launch(p):
    return p.chromium.launch()
with sync_playwright() as p:
    b=launch(p)
    for w,h,lang in [(1280,720,'en'),(1366,768,'uk'),(1440,900,'en')]:
        pg=b.new_page(viewport={'width':w,'height':h})
        errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.goto('file://'+d+'/preview_v2.html')
        pg.click('#intro .btn.primary')
        if lang=='uk': pg.click('#lang-uk')
        pg.wait_for_timeout(300)
        ids=pg.evaluate("Array.from(document.querySelectorAll('#map .node')).map(n=>n.getAttribute('data-id'))")
        res=[]
        for i in ids:
            pg.evaluate("id=>document.querySelector('#map .node[data-id=\"'+id+'\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))",i)
            pg.wait_for_timeout(60)
            r=pg.evaluate("""()=>{const de=document.documentElement,pn=document.getElementById('panel');const open=pn.querySelector('.more-body:not([hidden])');return {x:de.scrollWidth-de.clientWidth,y:de.scrollHeight-de.clientHeight,p:pn.scrollHeight-pn.clientHeight,open:open?open.getAttribute('data-body'):null,free:pn.clientHeight-pn.scrollHeight}}""")
            res.append((i,r['x'],r['y'],r['p'],r['open']))
        print(w,h,lang,'errors:',errs)
        for r in res: print('  ',r)
        tabsov=pg.evaluate("()=>{const t=document.getElementById('tabs');return t.scrollWidth-t.clientWidth}")
        print('  tabs overflow',tabsov)
        if w==1280:
            pg.evaluate("document.querySelector('#map .node[data-id=\"implement\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
            pg.wait_for_timeout(150)
            pg.screenshot(path=d+'/v2-1280-implement.png')
            pg.evaluate("document.querySelector('#map .node[data-id=\"api\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
            pg.wait_for_timeout(150)
            pg.screenshot(path=d+'/v2-1280-api.png')
        if w==1366:
            pg.evaluate("document.querySelector('#map .node[data-id=\"staging\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
            pg.wait_for_timeout(150)
            pg.screenshot(path=d+'/v2-1366-staging-uk.png')
        pg.close()
    b.close()
