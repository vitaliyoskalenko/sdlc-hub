from playwright.sync_api import sync_playwright
import os
d='/tmp/claude-0/-home-claude/d249722f-912b-55c8-846a-81f9318768af/scratchpad'
ids=['specify','clarify','epic','uxflows','design','datamodel','api','screens','tasks','sprint','plantests','implement','review','ship','staging','verify','fix','accept','release']
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h,lang in [(1280,720,'en'),(1280,720,'uk'),(1366,768,'en'),(1366,768,'uk'),(1536,730,'en'),(1536,730,'uk'),(1440,900,'uk'),(1024,700,'en'),(390,800,'uk')]:
        pg=b.new_page(viewport={'width':w,'height':h}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('file://'+d+'/preview_v2.html'); pg.click('#intro .btn.primary')
        if lang=='uk': pg.click('#lang-uk')
        pg.wait_for_timeout(200); bad=[]; dense=[]; opened=0
        for i in ids:
            pg.evaluate("id=>document.querySelector('#map .node[data-id=\"'+id+'\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))",i); pg.wait_for_timeout(40)
            o=pg.evaluate("()=>{const pn=document.getElementById('panel'),de=document.documentElement;const cs=pn.querySelector('.coststrip');return [pn.scrollHeight-pn.clientHeight,de.scrollWidth-de.clientWidth,de.scrollHeight-de.clientHeight,pn.classList.contains('dense'),!!pn.querySelector('.more-body:not([hidden])'),Math.round(cs.getBoundingClientRect().height)]}")
            if o[0] or o[1] or (o[2] and w>=760 and h>=640): bad.append((i,o[:3]))
            if o[3]: dense.append(i)
            if o[4]: opened+=1
            if o[5]>40 and w>=760: bad.append((i,'strip wraps',o[5]))
        hdr=pg.evaluate("()=>Math.round(document.querySelector('.bar').getBoundingClientRect().height)")
        print(w,h,lang,'header',hdr,'| overflow:',bad,'| dense:',dense,'| what open:',opened,'/19',errs)
        if (w,h,lang)==(1280,720,'uk'):
            pg.evaluate("document.querySelector('#map .node[data-id=\"release\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))"); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v2-release-uk.png')
        if (w,h,lang)==(1280,720,'en'):
            pg.evaluate("document.querySelector('#map .node[data-id=\"api\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))"); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v2-api-en.png')
            pg.click('.lane-btn[data-role="qa"]'); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v2-role-qa.png')
        if w==390: pg.screenshot(path=d+'/v2-phone-top.png')
        pg.close()
    b.close()
