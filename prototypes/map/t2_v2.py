from playwright.sync_api import sync_playwright
import os
d=os.path.dirname(os.path.abspath(__file__))
def launch(p):
    return p.chromium.launch()
def node(pg,i):
    pg.evaluate("id=>document.querySelector('#map .node[data-id=\"'+id+'\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))",i); pg.wait_for_timeout(120)
def stat(pg):
    return pg.evaluate("""()=>{const de=document.documentElement,pn=document.getElementById('panel');return {x:de.scrollWidth-de.clientWidth,y:de.scrollHeight-de.clientHeight,p:pn.scrollHeight-pn.clientHeight}}""")
with sync_playwright() as p:
    b=launch(p)
    pg=b.new_page(viewport={'width':1280,'height':720})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('file://'+d+'/preview_v2.html')
    pg.screenshot(path=d+'/v2-intro.png')
    pg.click('#intro .btn.primary'); pg.wait_for_timeout(200)
    pg.screenshot(path=d+'/v2-step1.png')
    opens=[]
    for i in ['specify','clarify','epic','uxflows','design','datamodel','api','screens','tasks','sprint','plantests','implement','review','ship','staging','verify','fix','accept','release']:
        node(pg,i); opens.append((i,pg.evaluate("()=>{const o=document.querySelector('#panel .more-body:not([hidden])');return o?o.getAttribute('data-body'):null}")))
    print('open at 1280x720:',opens)
    node(pg,'verify'); pg.screenshot(path=d+'/v2-verify.png')
    node(pg,'release'); pg.screenshot(path=d+'/v2-release.png')
    node(pg,'tasks'); pg.click('.mt[data-sec="prompt"]'); pg.wait_for_timeout(100); pg.screenshot(path=d+'/v2-tasks-prompt.png')
    pg.click('.lane-btn[data-role="ops"]'); pg.wait_for_timeout(120); print('role ops',stat(pg)); pg.screenshot(path=d+'/v2-role-ops.png')
    pg.click('.lane-btn[data-role="dev"]'); pg.wait_for_timeout(120); print('role dev',stat(pg))
    pg.click('.loop-btn[data-loop="contract"]'); pg.wait_for_timeout(120); print('loop contract',stat(pg)); pg.screenshot(path=d+'/v2-loop-contract.png')
    pg.click('.loop-btn[data-loop="prod"]'); pg.wait_for_timeout(120); print('loop prod',stat(pg)); pg.screenshot(path=d+'/v2-loop-prod.png')
    pg.click('#prep'); pg.wait_for_timeout(120); print('prep',stat(pg)); pg.screenshot(path=d+'/v2-prep.png')
    for t in ['hand','mcp','files','cost','rules','setup']:
        pg.click('.tab[data-tab="'+t+'"]'); pg.wait_for_timeout(150); print('tab',t,stat(pg)); pg.screenshot(path=d+'/v2-tab-'+t+'.png')
    # cost: plan section and editing a seat
    pg.click('.tab[data-tab="cost"]'); pg.click('details[data-sec="c3"] summary'); pg.wait_for_timeout(150)
    pg.fill('.seat-in[data-seat="4"]','5'); pg.wait_for_timeout(100)
    print('after seat edit:',pg.inner_text('#hchips'),'|',pg.inner_text('#plan-lead')[:90], '| assumed left:',pg.locator('.assumed').count())
    pg.screenshot(path=d+'/v2-cost-plan.png')
    # rules sections
    pg.click('.tab[data-tab="rules"]')
    for sid in ['gt','sc','fp','pl']:
        pg.click('details[data-sec="'+sid+'"] summary'); pg.wait_for_timeout(120); pg.screenshot(path=d+'/v2-rules-'+sid+'.png')
    # setup: ops and dev, each section
    pg.click('.tab[data-tab="setup"]')
    for role in ['ops','dev','qa']:
        pg.click('[data-setup="'+role+'"]'); pg.wait_for_timeout(100)
        for sid in ['s1','s3','s5']:
            pg.click('details[data-sec="'+sid+'"] summary'); pg.wait_for_timeout(100)
            st=stat(pg)
            if role in('ops','dev'): pg.screenshot(path=d+'/v2-setup-'+role+'-'+sid+'.png')
            print('setup',role,sid,st)
    print('errors',errs)
    pg.close()
    # phone
    pg=b.new_page(viewport={'width':390,'height':800})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('file://'+d+'/preview_v2.html'); pg.click('#intro .btn.primary'); pg.wait_for_timeout(200)
    print('phone',stat(pg),errs)
    pg.screenshot(path=d+'/v2-phone.png',full_page=True)
    for t in ['mcp','files','cost','rules','setup']:
        pg.click('.tab[data-tab="'+t+'"]'); pg.wait_for_timeout(120); print('phone tab',t,stat(pg)['x'])
    pg.close()
    # dark
    pg=b.new_page(viewport={'width':1366,'height':768},color_scheme='dark')
    pg.goto('file://'+d+'/preview_v2.html'); pg.click('#intro .btn.primary'); pg.wait_for_timeout(200)
    node(pg,'staging'); pg.screenshot(path=d+'/v2-dark.png')
    pg.close()
    b.close()
