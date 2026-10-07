#!/usr/bin/env python3
"""Builds Version 2 (GitLab, four engineering teams, Ops role) from the Version 1 template and data.
Inputs:  compact.tpl.html, data_tasks.js (Version 1, untouched), v2_data_over.js, v2_tpl_block.js, v2_setup.js
Outputs: data_v2.js, v2.tpl.html, ai-sdlc-v2.html, check_v2.js, preview_v2.html"""
import re, os
here = os.path.dirname(os.path.abspath(__file__))
def rd(n): return open(os.path.join(here, n), encoding='utf-8').read()
def wr(n, s): open(os.path.join(here, n), 'w', encoding='utf-8').write(s)

# ---------- data ----------
d = rd('data_tasks.js')
d = re.sub(r'\bPR\b', 'MR', d)
for a, b in [
    ('pull request', 'merge request'), ('Pull request', 'Merge request'),
    ('GitHub', 'GitLab'), ('through gh', 'through glab'), ('через gh', 'через glab'), ('gh CLI', 'glab CLI'), ('gh auth login', 'glab auth login'),
    ('the preview environment', 'staging'), ('preview environment', 'staging'),
    ('preview-стенду', 'стенду'), ('preview-стенд', 'стенд'),
]:
    d = d.replace(a, b)
# drop the Shopify-only entries of Version 1
d = re.sub(r'\[SHO,T\("[^"]*","[^"]*"\)\],', '', d)
d = re.sub(r',\[SHO,T\("[^"]*","[^"]*"\)\]', '', d)
d = re.sub(r'\[SHO,T\("[^"]*","[^"]*"\)\]', '', d)
d = re.sub(r',\n \{name:"Shopify Dev MCP".*\n', '\n', d)
d = d.replace('five roles, sixteen steps', 'six roles, eighteen steps').replace("п'ять ролей, шістнадцять кроків", "шість ролей, вісімнадцять кроків")
d = d.replace('Step {n} of 16', 'Step {n} of 18').replace('Крок {n} з 16', 'Крок {n} з 18')
d = d.replace('sixteen steps across five role lanes', 'eighteen steps across six role lanes').replace("шістнадцять кроків у п'яти доріжках ролей", "вісімнадцять кроків у шести доріжках ролей")
d = d + rd('v2_data_over.js')
wr('data_v2.js', d)

# ---------- template ----------
s = rd('compact.tpl.html')
def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (s.count(a), a[:90])
    s = s.replace(a, b)
def cut(start, end, new):
    """replace from start marker (inclusive) up to end marker (exclusive)"""
    global s
    i = s.index(start); j = s.index(end, i)
    assert s.count(start) == 1, start
    s = s[:i] + new + s[j:]

rep('<title>AI-SDLC One-Screen Map</title>', '<title>AI-SDLC Map V2</title>')
# theme: one more role colour
rep('--qa:#127A52; --bug:#C2352B;', '--qa:#127A52; --ops:#66700F; --bug:#C2352B;')
rep('--qa:#55D3A0; --bug:#FF8073;', '--qa:#55D3A0; --ops:#C5CF5A; --bug:#FF8073;', 2)
rep('.role-qa{--rc:var(--qa)}', '.role-qa{--rc:var(--qa)} .role-ops{--rc:var(--ops)}')
rep('.lanes{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}', '.lanes{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}')
rep('.slots{display:grid;grid-template-columns:repeat(5,58px);gap:4px}', '.slots{display:grid;grid-template-columns:repeat(6,50px);gap:4px}')
rep('.stage{flex:1;min-height:0;display:grid;grid-template-columns:minmax(340px,.8fr) minmax(0,1.2fr);gap:16px}',
    '.stage{flex:1;min-height:0;display:grid;grid-template-columns:minmax(360px,.88fr) minmax(0,1.12fr);gap:16px}')
rep('/* reference tabs */\n.scroll{', '''/* teams strip, sign-off, repositories, seat inputs */
.scope{display:flex;flex-wrap:wrap;gap:5px 16px;align-items:center}
.teams,.repol{display:inline-flex;flex-wrap:wrap;gap:5px 6px;align-items:center;min-width:0}
.rl{display:inline-flex;align-items:baseline;gap:5px;border:1.5px solid var(--ink);border-radius:6px;padding:0 8px;font:600 .78rem/1.6 var(--f-mono);white-space:nowrap;background:var(--surface);color:var(--ink)}
.rl::before{content:"";align-self:center;width:7px;height:7px;border-radius:2px;background:var(--ink)}
.rl.ro{border-style:dashed;border-color:var(--muted);font-weight:500;color:var(--muted)}
.rl.ro::before{background:transparent;border:1.5px solid var(--muted)}
.rl i{font:400 .72rem/1 var(--f-body);font-style:normal}
.rl.any{font-family:var(--f-body)}
.rl.strong{background:var(--ink);color:var(--bg)}
.rl.strong::before{background:var(--bg)}
.rl.strong i{color:var(--bg)}
.tm{border:1.5px solid var(--dev);border-radius:6px;padding:0 8px;font-size:.8rem;line-height:1.55;white-space:nowrap;background:transparent}
.tm b{font-weight:600}
.tm-lead,.tm-real,.tm-first{background:var(--dev);color:var(--on-role)}
.tm-work,.tm-mr{background:color-mix(in srgb,var(--dev) 14%,var(--surface))}
.tm-wait{border-style:dashed;border-color:var(--bug);color:var(--bug)}
.gate{min-width:0}
.bracket{fill:none;stroke:var(--dev);stroke-width:1.6}
.bracket-t{fill:var(--dev);font-family:var(--f-body);font-weight:600}
.focus .bracket,.focus .bracket-t{opacity:.3}
table.files{min-width:640px}
.gate b{font-weight:600}
.gate .k{margin-right:4px}
.d-line.walkline{flex-wrap:nowrap;align-items:flex-start;justify-content:space-between}
.d-meta{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;min-width:0;padding-top:3px}
.walkline .walk{flex:none}
@container (max-width:470px){.d-line.walkline{flex-wrap:wrap}}
.mapcol{container-type:inline-size}
@container (min-width:480px) and (max-width:619px){
  .under{display:grid;grid-template-columns:max-content repeat(3,max-content);justify-content:start}
  .under .lbl{grid-row:span 2;align-self:center}
}
.repos{list-style:none;padding:0;display:flex;flex-direction:column;gap:4px}
.repos li{display:grid;grid-template-columns:8.4em minmax(0,1fr);gap:2px 10px;align-items:baseline;font-size:.9rem}
.repos li:first-child{padding-bottom:5px;margin-bottom:1px;border-bottom:1px dashed var(--line)}
.repos .who{display:inline-flex;gap:3px;margin-right:6px;vertical-align:1px}
.repos .v{color:var(--muted)}
@container (max-width:470px){.repos li{grid-template-columns:minmax(0,1fr)}}
.repo-rows li{grid-template-columns:minmax(0,13em) minmax(0,1fr)}
@container (max-width:470px){.repo-rows li{grid-template-columns:minmax(0,1fr)}}
.seat-in{width:3.6em;font:inherit;font-variant-numeric:tabular-nums;color:var(--ink);background:var(--surface);border:1.5px solid var(--line);border-radius:6px;padding:0 4px;text-align:right}
.seat-in:focus-visible{outline-offset:1px}
.assumed{margin-left:6px;font:500 .66rem/1.3 var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--bug)}
.rule-list code{font-size:.84em}

/* reference tabs */
.scroll{''')

# TOOLTAB: keys come from the data, plus GitLab CI/CD
rep('].concat(MCP.map(function(m,i){return {key:["atl","fig","gh","pw","shop"][i],name:m.name,what:m.what,cmds:[m.cmd],cells:m.cells};}));',
    '''].concat(MCP.map(function(m){return {key:m.key,name:m.name,what:m.what,cmds:[m.cmd],cells:m.cells};})).concat([
 {key:"ci",name:"GitLab CI/CD + Claude Code job",what:T("Pipelines run the tests, the scans and the deploys. An optional job runs Claude Code without a person: it reviews a merge request or acts on an @claude comment. The job needs an API key stored as a masked CI/CD variable and is billed per token, apart from the seats. Beta, maintained by GitLab.","Пайплайни запускають тести, перевірки й викладки. Необов'язкова job запускає Claude Code без людини: рев'ює merge request або реагує на коментар із @claude. Для неї потрібен API-ключ у masked-змінній CI/CD, і оплачується вона за токени, окремо від місць. Бета, підтримує GitLab."),cmds:[],link:["https://code.claude.com/docs/en/gitlab-ci-cd",T("Claude Code GitLab CI/CD","Claude Code GitLab CI/CD")],cells:{po:"-",pm:"-",des:"-",dev:"run",qa:"-",ops:"rw"}}
]);''')
rep('cells:{po:"run",pm:"run",des:"run",dev:"run",qa:"run"}}', 'cells:{po:"run",pm:"run",des:"run",dev:"run",qa:"run",ops:"-"}}')
rep('cmds:[],cells:{po:"-",pm:"-",des:"rw",dev:"r",qa:"-"}}', 'cmds:[],cells:{po:"-",pm:"-",des:"rw",dev:"r",qa:"-",ops:"-"}}')
rep('''  var out=[STOOL[s.id]];
  if(CDTOOL[s.id]) out.push(["cd",CDTOOL[s.id]]);''', '''  var out=[STOOL[s.id]];
  (XTOOL[s.id]||[]).forEach(function(x){out.push(x);});''')

# setup: new data and renderer
cut('var REPO_URL="https://github.com/YOUR-ORG/YOUR-REPO.git";', 'var setupOpen="s1";', rd('v2_setup.js'))
rep('U.inClaude=T("In Claude Code","У Claude Code"); U.onGit=T("On the Git host","На Git-хостингу");',
    'U.inClaude=T("In Claude Code","У Claude Code"); U.onGit=T("In GitLab","У GitLab"); U.inAdmin=T("In the Claude admin console","В адмін-консолі Claude");')
rep('U.sRepo=T("Get the repository","Отримати репозиторій");', 'U.sRepo=T("Get the repositories","Отримати репозиторії");')

# cost tab: editable headcount
rep('''sec("c3",U.cPlan,'<p>'+tr(S.planLead)+'</p><div class="scroll">''', '''sec("c3",U.cPlan,'<p id="plan-lead">'+planLead()+'</p><div class="scroll">''')
rep('''<td class="num">'+x[2]+'</td>''', '''<td class="nw"><input class="seat-in" type="number" min="0" max="99" step="1" value="'+x[2]+'" data-seat="'+i+'" aria-label="'+esc(tr(U.seatsOf)+" "+tr(x[1]))+'">'+(x[5]?'<span class="assumed">'+esc(tr(U.assumed))+'</span>':'')+'</td>''')
rep('SEATS.map(function(x){return \'<tr><td class="nw"><span class="rchip', 'SEATS.map(function(x,i){return \'<tr><td class="nw"><span class="rchip')
rep('''  var tt=totals(),mx=seatMix();
  $("hchips").innerHTML=''', '''  headerChips();
  $("intro-roles")''' + '''.innerHTML=ROLE_ORDER.map(function(r){return '<li><span>'+rchip(r)+'</span><span>'+esc(tr(INTRO_ROLE[r]))+'</span></li>';}).join("");
  lanesEl.innerHTML=ROLE_ORDER.map(function(r){return '<button type="button" class="lane-btn role-'+r+'" data-role="'+r+'" aria-pressed="false" title="'+esc(tr(ROLES[r].name))+'"><span class="l">'+esc(tr(ROLES[r].l))+'</span><span class="s">'+esc(tr(ROLES[r].s))+'</span></button>';}).join("");
  $("loopbtns").innerHTML=Object.keys(LOOPS).map(function(k){return '<button type="button" class="chipbtn loop-btn" data-loop="'+k+'" aria-pressed="false" title="'+esc(tr(LOOPS[k].btn))+'">'+esc(tr(LB[k]))+'</button>';}).join("");
  lastW=0; build(); renderPane();
}
function headerChips(){
  var tt=totals(),mx=seatMix();
  $("hchips").innerHTML=''')
# the old tail of renderChrome now belongs to headerChips: drop the duplicated lines after the chips
old_tail = '''  $("intro-roles").innerHTML=ROLE_ORDER.map(function(r){return '<li><span>'+rchip(r)+'</span><span>'+esc(tr(INTRO_ROLE[r]))+'</span></li>';}).join("");
  lanesEl.innerHTML=ROLE_ORDER.map(function(r){return '<button type="button" class="lane-btn role-'+r+'" data-role="'+r+'" aria-pressed="false" title="'+esc(tr(ROLES[r].name))+'"><span class="l">'+esc(tr(ROLES[r].l))+'</span><span class="s">'+esc(tr(ROLES[r].s))+'</span></button>';}).join("");
  $("loopbtns").innerHTML=Object.keys(LOOPS).map(function(k){return '<button type="button" class="chipbtn loop-btn" data-loop="'+k+'" aria-pressed="false" title="'+esc(tr(LOOPS[k].btn))+'">'+esc(tr(LB[k]))+'</button>';}).join("");
  lastW=0; build(); renderPane();
}
function setLang(l){'''
assert s.count(old_tail) == 1
s = s.replace(old_tail, '}\nfunction setLang(l){')
rep('''panel.addEventListener("click",function(e){
  var b=e.target.closest(".mt"); if(!b) return;''', '''panel.addEventListener("input",function(e){
  var t=e.target; if(!t.getAttribute||t.getAttribute("data-seat")===null) return;
  var i=+t.getAttribute("data-seat"),v=Math.max(0,Math.min(99,parseInt(t.value,10)||0));
  SEATS[i][2]=v; SEATS[i][5]=false;
  var tg=t.parentNode.querySelector(".assumed"); if(tg) tg.parentNode.removeChild(tg);
  var pl=$("plan-lead"); if(pl) pl.innerHTML=planLead();
  headerChips();
});
panel.addEventListener("click",function(e){
  var b=e.target.closest(".mt"); if(!b) return;''')

# helpers
rep('var TOOL=/^(Confluence|Jira|Figma|GitHub|Claude Design): (.*)$/;', 'var TOOL=/^(Confluence|Jira|Figma|GitLab|Claude Design): (.*)$/;')
rep('/* helpers */', rd('v2_tpl_block.js') + '\n/* helpers */')

# map: rows and lanes from the data, two more return paths
rep('if(free.matches){host.style.height=(8+16*(stacked.matches?(compact?40:42):34))+"px";} else host.style.height="";',
    'var NR=FLOW.length,NL=ROLE_ORDER.length;\n  if(free.matches){host.style.height=(8+NR*(stacked.matches?(compact?38:40):32))+"px";} else host.style.height="";')
rep('var rowH=Math.min(50,(H-8)/16);', 'var rowH=Math.min(50,(H-8)/NR);')
rep('var numW=compact?16:24, railW=compact?22:34, laneW=(W-numW-railW)/5;', 'var numW=compact?16:24, railW=compact?22:34, laneW=(W-numW-railW)/NL;')
rep('var top=(H-16*rowH)/2;', 'var top=(H-NR*rowH)/2;')
rep('for(var r=0;r<16;r++){', 'for(var r=0;r<NR;r++){')
rep('var end=numW+5*laneW, rail1=end+railW*0.4, rail2=end+railW*0.82;', 'var end=numW+NL*laneW, rail1=end+railW*0.4, rail2=end+railW*0.82;')
rep('''  loop("review","M"+(rv.cx+rv.w/2+1)+" "+rv.cy+"C"+bx+" "+rv.cy+" "+bx+" "+im.cy+" "+(im.cx+im.w/2+2)+" "+im.cy);''',
    '''  loop("review","M"+(rv.cx+rv.w/2+1)+" "+rv.cy+"C"+bx+" "+rv.cy+" "+bx+" "+im.cy+" "+(im.cx+im.w/2+2)+" "+im.cy);
  var ap=P.api,rl=P.release,lx=numW-2;
  loop("contract","M"+(im.cx-im.w/2-1)+" "+im.cy+"H"+lx+"V"+ap.cy+"H"+(ap.cx-ap.w/2-2));
  loop("prod","M"+(rl.cx-rl.w/2-1)+" "+rl.cy+"H"+f.cx+"V"+(f.cy+f.h/2+2));
  /* backend-first phase: the client teams start after the contract */
  var td=P.design,dm=P.datamodel,kx=Math.max(td.cx+td.w/2,dm.cx+dm.w/2)+5,ky=(td.cy+ap.cy)/2;
  var bg=el("g",{},wires),bt=el("title",{},bg); bt.textContent=tr(U.beFirstTip);
  el("path",{d:"M"+(kx-4)+" "+(td.cy-td.h/2)+"H"+kx+"V"+(ap.cy+ap.h/2)+"H"+(kx-4),"class":"bracket"},bg);
  var kt=el("text",{x:kx+fs-1,y:ky,"text-anchor":"middle","dominant-baseline":"central","font-size":fs-1,"class":"bracket-t",transform:"rotate(-90 "+(kx+fs-1)+" "+ky+")"},bg); kt.textContent=tr(U.beFirst);''')

# step details: teams strip under the commands, sign-off next to the handoff
rep('''    (s.cmds.length?'<div class="cmdrow">'+s.cmds.map(function(c){return '<span class="cmd"><code>'+esc(c)+'</code>'+copyBtn(c)+'</span>';}).join("")+'</div>':'')+'</div>';
  var to=s.handoff''', '''    (s.cmds.length?'<div class="cmdrow">'+s.cmds.map(function(c){return '<span class="cmd"><code>'+esc(c)+'</code>'+copyBtn(c)+'</span>';}).join("")+'</div>':'')+
    '<div class="scope">'+(SREPO[s.id]===R4&&STEAM[s.id]?repoLabel(R4,STEAM[s.id]):repoLabel(SREPO[s.id])+(STEAM[s.id]?'<span class="teams"><span class="k">'+esc(tr(U.teamsK))+'</span>'+STEAM[s.id].map(function(st,i){return '<span class="tm tm-'+st+'"><b>'+TEAMS[i]+'</b> '+esc(tr(TSTATE[st]))+'</span>';}).join("")+'</span>':''))+'</div></div>';
  var to=s.handoff''')
rep('''return '<li><b>'+esc(g.name)+'</b><span><span class="tw">''', '''return '<li><b>'+esc(tr(g.name))+'</b><span><span class="tw">''')
rep('''(to.length?to.map(function(x){return rchip(x[0]);}).join(""):'<span class="plain">'+esc(tr(n?U.sameRole:U.endCycle))+'</span>')+'</div>';
  var pr=''', '''(to.length?to.map(function(x){return rchip(x[0]);}).join(""):'<span class="plain">'+esc(tr(n?U.sameRole:U.endCycle))+'</span>')+
    (GATE[s.id]?'<span class="gate"><span class="k">'+esc(tr(U.gateK))+'</span> <b>'+esc(tr(GATE[s.id][0]))+'</b> · '+esc(tr(GATE[s.id][1]))+'</span>':'')+'</div>';
  var pr=''')

# step 0
rep('''    '<li><span>'+rchip("dev")+'</span><span>'+tr(U.prepDev)+'</span></li>'+''', '''    '<li><span>'+rchip("ops")+'</span><span>'+tr(U.prepOps)+'</span></li>'+
    '<li><span>'+rchip("dev")+'</span><span>'+tr(U.prepDev)+'</span></li>'+''')
rep('''      '<li><span><code>.claude/sdd.local.md</code></span><span class="v">'+esc(tr(U.fLocal))+'</span></li></ul>',true)+''',
    '''      '<li><span><code>.claude/sdd.local.md</code></span><span class="v">'+esc(tr(U.fLocal))+'</span></li>'+
      '<li><span><code>.gitlab-ci.yml</code></span><span class="v">'+esc(tr(U.fCi))+'</span></li></ul>',true)+''')

# tools tab: optional documentation link
rep('''      (m.cmds.length?'<div class="mcp-cmd">'+m.cmds.map(function(c){return '<span class="cmd"><code>'+esc(c)+'</code>'+copyBtn(c)+'</span>';}).join("")+'</div>':'')+
      '</div></details>';}).join("")+''', '''      (m.cmds.length?'<div class="mcp-cmd">'+m.cmds.map(function(c){return '<span class="cmd"><code>'+esc(c)+'</code>'+copyBtn(c)+'</span>';}).join("")+'</div>':'')+
      (m.link?'<p class="sources">'+lk(m.link[0],tr(m.link[1]))+'</p>':'')+
      '</div></details>';}).join("")+''')

# files tab: repositories first, then the table with a repository column
cut('function filesHTML(){', 'function rulesHTML(){', '''function filesHTML(){
  return '<p class="intro">'+tr(S.artIntro)+'</p>'+
    cell(U.reposK,'<ul class="repos">'+REPOS.map(function(r){return '<li><code>'+esc(r[0])+'</code><span><span class="who">'+r[2].map(rchip).join("")+'</span><span class="v">'+esc(tr(r[1]))+'</span></span></li>';}).join("")+'</ul>')+
    '<ul class="rule-list">'+tr(S.repoFlow)+'</ul>'+
    '<div class="acc">'+sec("fl",U.filesAll,'<div class="scroll"><table class="tight files"><thead><tr><th>'+esc(tr(U.thFile))+'</th><th>'+esc(tr(U.thRepo))+'</th><th>'+esc(tr(U.thWrites))+'</th><th>'+esc(tr(U.thReads))+'</th><th>'+esc(tr(U.thCopy))+'</th></tr></thead><tbody>'+ARTS.map(function(a){
    return '<tr><td class="nw"><code>'+esc(a[0])+'</code></td><td class="nw">'+esc(tr(a[1]))+'</td><td class="nw">'+rchip(a[2])+'</td><td>'+esc(tr(a[3]))+'</td><td>'+esc(tr(a[4]))+'</td></tr>';}).join("")+'</tbody></table></div>',false)+'</div>'+
    '<p class="plain">'+tr(S.repoNote)+'</p>';
}
''')
# rules tab
cut('function rulesHTML(){', 'function renderPane(){', '''function rulesHTML(){
  var gates=ORDER.filter(function(id){return GATE[id];}).map(function(id){var st=BY[id],g=GATE[id];
    return '<tr><td class="nw"><button type="button" class="step-link role-'+st.role+'" data-nav="'+id+'">'+(st.row+1)+' · '+esc(tr(st.label))+'</button></td><td class="nw"><b>'+esc(tr(g[0]))+'</b></td><td>'+esc(tr(g[1]))+'</td></tr>';}).join("");
  return '<h2>'+esc(tr(S.rulesH))+'</h2><ul class="rule-list"><li>'+tr(S.rule1)+'</li><li>'+tr(S.rule2)+'</li><li>'+tr(S.rule3)+'</li></ul>'+
    '<p class="intro">'+esc(tr(U.roleProposal))+'</p>'+
    '<div class="acc">'+
    sec("gt",U.rGates,'<p class="plain">'+esc(tr(S.gateIntro))+'</p><div class="scroll"><table class="tight"><thead><tr><th>'+esc(tr(U.thStep))+'</th><th>'+esc(tr(U.thGate))+'</th><th>'+esc(tr(U.thGateWhat))+'</th></tr></thead><tbody>'+gates+'</tbody></table></div>',false)+
    sec("sc",U.rSec,'<ul class="rule-list">'+tr(S.secList)+'</ul>',false)+
    sec("fp",U.rFast,'<ul class="decide">'+tr(S.fastList)+'</ul>',false)+
    sec("pl",U.rPilot,'<ul class="rule-list">'+tr(S.pilotList)+'</ul>',false)+
    sec("hb",U.handBlock,'<figure><pre>'+esc(tr(S.figPre))+'</pre><figcaption>'+esc(tr(S.figCap))+'</figcaption></figure>',false)+
    sec("dec",S.decH,'<ul class="decide">'+tr(S.decList)+'</ul>',false)+'</div>'+
    '<p class="sources"><span>'+esc(tr(S.srcLabel))+'</span>'+lk("https://github.com/genkovich/sdd","genkovich/sdd")+lk("https://code.claude.com/docs/en/gitlab-ci-cd","Claude Code GitLab CI/CD")+lk("https://docs.gitlab.com/user/model_context_protocol/mcp_server/","GitLab MCP server")+lk("https://code.claude.com/docs/en/admin-setup",tr(T("Claude Code for organizations","Claude Code для організацій")))+lk("https://code.claude.com/docs/en/data-usage",tr(T("Data usage","Використання даних")))+lk("https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/","Atlassian Rovo MCP")+lk("https://maestro.dev/blog/maestro-mcp-for-ai-coding-agents","Maestro MCP")+'</p>';
}
''')
# step header: the walk buttons never drop to a second line
rep("""h+='<div class="d-top role-'+s.role+'"><div class="d-line">'+rchip(s.role)+""", """h+='<div class="d-top role-'+s.role+'"><div class="d-line walkline"><span class="d-meta">'+rchip(s.role)+""")
rep("""<span class="jira">Jira: <b>'+esc(s.jira)+'</b></span>'+
    '<span class="walk">""", """<span class="jira">Jira: <b>'+esc(s.jira)+'</b></span></span>'+
    '<span class="walk">""")
rep('.pane-body{flex:1;min-height:0;overflow:auto;padding:12px 18px 12px;display:flex;flex-direction:column;gap:12px}', '.pane-body{flex:1;min-height:0;overflow:auto;padding:10px 18px 9px;display:flex;flex-direction:column;gap:9px}')
rep('mapcol.classList.toggle("compact",compact||laneW<84);', 'mapcol.classList.toggle("compact",compact||laneW<100);')
rep('var lab=tr((compact&&s.short)?s.short:s.label);', 'var lab=tr(((compact||laneW<90)&&s.short)?s.short:s.label);')
rep("""esc(tr(U.hPlan))+': <b>'+mx.std+' Standard + '+mx.prem+' Premium</b> · <b>$'+mx.month+'</b>'+esc(tr(U.perMonth))""", """esc(tr(U.hPlan))+': <b>'+(mx.std+mx.prem)+' '+esc(tr(U.seatsWord))+'</b> · <b>$'+mx.month+'</b>'+esc(tr(U.perMonth))""")
# intro dialog: six roles have to fit
rep('.intro-body{flex:0 1 auto;min-height:0;overflow:auto;padding:20px 26px 16px;display:flex;flex-direction:column;gap:13px}', '.intro-body{flex:0 1 auto;min-height:0;overflow:auto;padding:14px 26px 10px;display:flex;flex-direction:column;gap:8px}')
rep('.intro-block .rows{margin-top:4px;font-size:.92rem}', '.intro-block .rows{margin-top:3px;font-size:.9rem;gap:2px}')
rep('.abbr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 22px;border-block:1px solid var(--line);padding-block:12px}', '.abbr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 22px;border-block:1px solid var(--line);padding-block:9px}')
rep('<button class="btn primary" type="button" data-close="1" data-i18n="introStart"></button>', '<button class="btn primary" type="button" data-close="1" data-i18n="introStart" autofocus></button>')
# role card: the repositories the role works in
rep("""<p class="sum">'+esc(tr(r.scope))+'</p>'+
    '<div class="steps-in">'+mine.map(""", """<p class="sum">'+esc(tr(r.scope))+'</p>'+
    '<div class="scope">'+repoLabel(RROLE[k])+'</div>'+
    '<div class="steps-in">'+mine.map(""")
# header: cost chips sit under the buttons, so the header stays two lines in both languages
rep("""<span class="meta" data-i18n="featMeta"></span><span class="hchips" id="hchips"></span></p>""", """<span class="meta" data-i18n="featMeta"></span></p>""")
rep("""        <button type="button" id="lang-uk" data-lang="uk" aria-pressed="false">УКР</button>
      </div>
    </div>
  </header>""", """        <button type="button" id="lang-uk" data-lang="uk" aria-pressed="false">УКР</button>
      </div>
      </div>
      <span class="hchips" id="hchips"></span>
    </div>
  </header>""")
rep('''    <div class="bar-right">
      <button class="btn restart" id="about"''', '''    <div class="bar-right">
      <div class="bar-btns">
      <button class="btn restart" id="about"''')
rep('.bar-right{flex:none;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:8px 10px}', '.bar-right{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0}\n.bar-btns{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:8px 10px}\n@media (max-width:759px){.bar-right{flex:1 1 100%;align-items:flex-start}.bar-btns{justify-content:flex-start}}')
rep('.app{height:100%;max-width:1480px;margin-inline:auto;padding-inline:clamp(16px,2vw,28px);padding-block:12px;display:flex;flex-direction:column;gap:10px}', '.app{height:100%;max-width:1480px;margin-inline:auto;padding-inline:clamp(16px,2vw,28px);padding-block:10px;display:flex;flex-direction:column;gap:8px}')
rep('.more{display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--line);padding-bottom:12px}', '.more{display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--line);padding-bottom:9px}')
rep('.hchips{display:inline-flex;flex-wrap:wrap;gap:6px}', '.hchips{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}\n@media (max-width:759px){.hchips{justify-content:flex-start}}')
# cost strip: one line in both languages
rep("""<b>Team '+esc(tr(SEATROLE[s.role]==="prem"?U.seatPrem:U.seatStd))+'</b></span>'+
    '<button type="button" class="info-btn\"""", """<b>'+esc(tr(SEATROLE[s.role]==="prem"?U.seatPrem:U.seatStd))+'</b></span>'+
    '<button type="button" class="info-btn\"""")
rep('.coststrip{display:flex;flex-wrap:wrap;gap:2px 14px;', '.coststrip{display:flex;flex-wrap:wrap;gap:2px 11px;')
# last resort when a step still does not fit: drop the "where it runs" tags
rep("""    if(mb){mb.hidden=true; var bt=panel.querySelector('.mt[aria-expanded="true"]'); if(bt) bt.setAttribute("aria-expanded","false");}
  }""", """    if(mb){mb.hidden=true; var bt=panel.querySelector('.mt[aria-expanded="true"]'); if(bt) bt.setAttribute("aria-expanded","false");}
    if(panel.scrollHeight>panel.clientHeight+2) panel.classList.add("dense");
  }""")
rep("""  panel.innerHTML=tab==="hand"?handHTML()""", """  panel.classList.remove("dense");
  panel.innerHTML=tab==="hand"?handHTML()""")
rep('.gate{min-width:0}', '.gate{min-width:0}\n.dense .tools .tw{display:none}\n.dense .sum{max-width:none}')
for a_, b_ in [('the preview environment', 'staging'), ('preview environment', 'staging'), ('GitHub (gh CLI)', 'GitLab'), ('GitHub', 'GitLab'), ('in 16 steps', 'in 18 steps'), ('за 16 кроків', 'за 18 кроків')]:
    s = s.replace(a_, b_)
wr('v2.tpl.html', s)

out = s.replace('/*__DATA__*/', d)
wr('ai-sdlc-v2.html', out)
wr('check_v2.js', re.search(r'<script>(.*)</script>', out, re.S).group(1))
wr('preview_v2.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + out + '</body></html>')
print('built', len(out))
for w in ['Shopify', 'GitHub', 'pull request', 'preview', 'sixteen', 'Step {n} of 16', '16 steps', 'five roles', "п'ять ролей"]:
    print(w, out.count(w))
