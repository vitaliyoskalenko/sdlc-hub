from playwright.sync_api import sync_playwright
import os
d=os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in [(1536,730),(1280,720)]:
        pg=b.new_page(viewport={'width':w,'height':h})
        pg.goto('file://'+d+'/preview_v2.html'); pg.click('#intro .btn.primary'); pg.wait_for_timeout(200)
        out=[]
        for i in ['specify','clarify','epic','uxflows','design','datamodel','api','screens','tasks','sprint','plantests','implement','review','ship','staging','verify','fix','accept','release']:
            pg.evaluate("id=>document.querySelector('#map .node[data-id=\"'+id+'\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))",i); pg.wait_for_timeout(50)
            r=pg.evaluate("""()=>{const pn=document.getElementById('panel');const mb=pn.querySelector('.more-body[data-body="what"]');const wasHidden=mb.hidden;let last=pn.lastElementChild;const used=last.getBoundingClientRect().bottom-pn.getBoundingClientRect().top+10;mb.hidden=false;const wh=mb.getBoundingClientRect().height+10;mb.hidden=wasHidden;return {open:!wasHidden,slack:Math.round(pn.clientHeight-used),what:Math.round(wh)}}""")
            out.append(i+(':open' if r['open'] else ':closed need %d'%(r['what']-r['slack'])))
        print(w,h,' | '.join(out))
        pg.close()
    b.close()
