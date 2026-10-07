var GROUP_URL="https://gitlab.com/YOUR-GROUP/";
var X_JC=T("Jira and Confluence","Jira й Confluence"), X_GLAB="GitLab CLI (glab)", X_NODE="Node.js", X_MAE="Maestro CLI";
var L_GLAB="https://gitlab.com/gitlab-org/cli#installation", L_NODE="https://nodejs.org/en/download", L_MAE="https://docs.maestro.dev/";
var SETUP={
 po:{
  extra:[[X_JC,T("an account that can edit the SHOP project and space","обліковий запис із правом редагування проєкту й простору SHOP"),null,[]]],
  clone:"product-specs",
  repos:[["product-specs",T("your spec lives here as `docs/features/tasks-issues/spec.md`, and every later stage reads it from disk","ваш spec лежить тут як `docs/features/tasks-issues/spec.md`, і кожна наступна стадія читає його з диска")]],
  flow3:T("Answer Claude's questions. Read `spec.md` before you accept it: it is the contract for everyone after you.","Відповідайте на питання Claude. Прочитайте `spec.md`, перш ніж приймати: це контракт для всіх після вас."),
  allow:["Edit(/docs/features/**/spec.md)","Edit(/CONTEXT.md)"], deny:["Edit(/docs/features/**/contracts/**)","Edit(/docs/features/**/screens.md)","Bash(git push --force *)"],
  owns:T("`spec.md` and `CONTEXT.md`","`spec.md` і `CONTEXT.md`"),
  updates:["docs/features/tasks-issues/spec.md",".size, .route","CONTEXT.md"],
  reads:["docs/roadmap.md","ux-flows.md","screens.md","contracts/openapi.yaml","test-plan.md","changelog"],
  noedit:T("code in any team repository, `sad.md`, `contracts/`","код у репозиторіях команд, `sad.md`, `contracts/`")},
 pm:{
  extra:[[X_JC,T("an account that can create issues, manage sprints and edit pages","обліковий запис, який може створювати задачі, керувати спринтами й редагувати сторінки"),null,[]]],
  clone:"product-specs",
  repos:[["product-specs",T("you keep `docs/roadmap.md` here. The four `tasks.json` files you read through GitLab MCP, without cloning the team repositories","тут ви ведете `docs/roadmap.md`. Чотири файли `tasks.json` читаєте через GitLab MCP, не клонуючи репозиторії команд")]],
  flow3:T("Check the size and route, then let Claude create the Jira stories from the four `tasks.json` files. Review the cross-team links before the sprint.","Перевірте розмір і маршрут, потім дайте Claude створити задачі Jira з чотирьох файлів `tasks.json`. Перед спринтом перегляньте зв'язки між командами."),
  allow:["Edit(/docs/roadmap.md)","Edit(/docs/features/**/.size)","Edit(/docs/features/**/.route)"], deny:["Edit(/docs/features/**/spec.md)","Edit(/docs/features/**/contracts/**)","Bash(git push --force *)"],
  owns:T("`docs/roadmap.md`","`docs/roadmap.md`"),
  updates:["docs/roadmap.md",".size, .route"],
  reads:["spec.md",T("tasks.json in four repositories","tasks.json у чотирьох репозиторіях"),"test-plan.md","review record","changelog"],
  noedit:T("`spec.md`, design files, code","`spec.md`, файли дизайну, код")},
 des:{
  extra:[["Figma",T("an account with edit access to the team library","обліковий запис із правом редагування командної бібліотеки"),"https://www.figma.com/",[]],
         ["Claude Design",T("prototypes on a canvas; included in the Claude seat","прототипи на полотні; входить у місце Claude"),"https://claude.ai/design",[]]],
  clone:"product-specs",
  repos:[["product-specs",T("`ux-flows.md`, `screens.md` and `docs/design-system.md` are written here. The visuals stay in Figma, and the manifest links to them","тут пишуться `ux-flows.md`, `screens.md` і `docs/design-system.md`. Візуал лишається у Figma, а маніфест на нього посилається")]],
  flow3:T("Draw the frames in Figma for web, Android and iOS, link them in `screens.md` and check that every state is there.","Намалюйте фрейми у Figma для вебу, Android та iOS, додайте посилання в `screens.md` і перевірте, що є кожен стан."),
  allow:["Edit(/docs/design-system.md)","Edit(/docs/features/**/ux-flows.md)","Edit(/docs/features/**/screens.md)"], deny:["Edit(/docs/features/**/spec.md)","Edit(/docs/features/**/contracts/**)","Bash(git push --force *)"],
  owns:T("`ux-flows.md`, `screens.md` and `docs/design-system.md`","`ux-flows.md`, `screens.md` і `docs/design-system.md`"),
  updates:["docs/design-system.md","ux-flows.md","screens.md"],
  reads:["spec.md","CONTEXT.md","sad.md","contracts/openapi.yaml"],
  noedit:T("`spec.md`, code, contracts","`spec.md`, код, контракти")},
 dev:{
  extra:[[X_GLAB,T("merge requests and pipelines from the terminal","merge request і пайплайни з термінала"),L_GLAB,["glab auth login"]],
         [X_NODE,T("needed for MCP servers that start with npx, such as Playwright for the Web team","потрібен для MCP-серверів, які стартують через npx, як-от Playwright для команди Web"),L_NODE,[]],
         [X_MAE,T("Android and iOS teams: drives the emulator or simulator for UI checks","команди Android та iOS: керує емулятором або симулятором для перевірок UI"),L_MAE,[]],
         [T("IDE extension","Розширення для IDE"),T("optional: the same seat covers Claude Code in VS Code and JetBrains IDEs","за бажанням: те саме місце покриває Claude Code у VS Code та IDE від JetBrains"),null,[]]],
  clone:"YOUR-TEAM-REPO",
  repos:[[T("your team's repository","репозиторій вашої команди"),T("`backend`, `web-admin`, `android-app` or `ios-app`: the design docs, the tasks and the code. The shared files arrive in `docs/features/tasks-issues/` by merge request and are read-only there","`backend`, `web-admin`, `android-app` або `ios-app`: документи дизайну, задачі й код. Спільні файли потрапляють у `docs/features/tasks-issues/` через merge request і там лише для читання")],
         ["product-specs",T("team leads only: the backend lead publishes the contract here and the client leads approve it","лише ліди команд: лід backend публікує тут контракт, а ліди клієнтів його погоджують")]],
  flow3:T("Let `implement` run task by task. Step in when it stops on a red test, on a conflict with the spec or on a gap in the contract.","Дайте `implement` іти задача за задачею. Втручайтесь, коли він зупиняється на червоному тесті, конфлікті зі spec або прогалині в контракті."),
  allow:["Bash(git commit *)"], deny:["Edit(/docs/features/**/spec.md)","Edit(/docs/features/**/screens.md)","Bash(git push --force *)","Read(./.env)"],
  owns:T("the design docs, tasks and code of your team","документи дизайну, задачі й код вашої команди"),
  updates:["docs/architecture-map.md","sad.md, adr/*",T("backend: data-model.md, migrations/, contracts/openapi.yaml","backend: data-model.md, migrations/, contracts/openapi.yaml"),"tasks/*, tasks.json",T("source code and tests","код і тести"),"_fixes/","CLAUDE.md, .mcp.json, .claude/settings.json"],
  reads:[T("everything in your team's repository","усе в репозиторії вашої команди"),T("synced: spec.md, ux-flows.md, screens.md, the contract","синхронізовані: spec.md, ux-flows.md, screens.md, контракт")],
  noedit:T("the synced shared files, another team's repository, the contract outside a merge request in `product-specs`","синхронізовані спільні файли, репозиторій іншої команди, контракт поза merge request у `product-specs`")},
 qa:{
  extra:[[X_NODE,T("Playwright MCP starts with npx","Playwright MCP стартує через npx"),L_NODE,[]],
         [X_MAE,T("drives the Android emulator and the iOS simulator","керує емулятором Android і симулятором iOS"),L_MAE,[]],
         [T("Android emulator and iOS simulator","Емулятор Android і симулятор iOS"),T("Android Studio provides the emulator; the iOS simulator needs a Mac with Xcode","емулятор дає Android Studio; для симулятора iOS потрібен Mac з Xcode"),null,[]],
         [X_GLAB,T("to read merge requests and their pipelines","щоб читати merge request та їхні пайплайни"),L_GLAB,["glab auth login"]]],
  clone:"product-specs",
  repos:[["product-specs",T("`test-plan.md` lives here, next to the spec you test against","тут лежить `test-plan.md`, поруч зі spec, проти якого ви тестуєте")],
         ["web-admin, android-app, ios-app",T("the e2e tests you add: Playwright specs and Maestro flows under `e2e/`","e2e-тести, які ви додаєте: специ Playwright і flows Maestro в `e2e/`")]],
  flow3:T("Have Claude walk staging in the browser and on the emulators. You decide what is a bug and file it with the AC it breaks, the platform and the team that owns it.","Дайте Claude пройти стенд у браузері й на емуляторах. Ви вирішуєте, що є багом, і заводите його з AC, який він порушує, платформою та командою-власником."),
  allow:["Edit(/docs/features/**/test-plan.md)","Edit(/e2e/**)","mcp__playwright__*","mcp__maestro__*"], deny:["Edit(/src/**)","Bash(git push --force *)"],
  owns:T("`test-plan.md` and the e2e tests","`test-plan.md` та e2e-тести"),
  updates:["test-plan.md",T("e2e tests under e2e/ in the client repositories","e2e-тести в e2e/ у клієнтських репозиторіях")],
  reads:["spec.md","ux-flows.md","screens.md","contracts/openapi.yaml","tasks.json",T("merge request diffs","diff у merge request")],
  noedit:T("`spec.md`, application code","`spec.md`, код застосунків")},
 ops:{
  extra:[[T("Claude admin console","Адмін-консоль Claude"),T("owner or admin role: seats, spend limits, managed settings, the spend report","роль власника або адміна: місця, ліміти витрат, керовані налаштування, звіт про витрати"),"https://code.claude.com/docs/en/admin-setup",[]],
         ["GitLab",T("Maintainer or Owner on the group: protected branches, CI/CD variables, runners","Maintainer або Owner у групі: захищені гілки, змінні CI/CD, ранери"),"https://docs.gitlab.com/user/project/repository/branches/protected/",[]],
         [X_GLAB,T("pipelines and merge requests from the terminal","пайплайни й merge request із термінала"),L_GLAB,["glab auth login"]],
         [T("API key for the Claude job in CI","API-ключ для job Claude у CI"),T("optional: created in the Claude Console and stored as the masked CI/CD variable `ANTHROPIC_API_KEY`, with its own spend limit","за бажанням: створюється в Claude Console і зберігається як masked-змінна CI/CD `ANTHROPIC_API_KEY`, з власним лімітом витрат"),"https://code.claude.com/docs/en/gitlab-ci-cd",[]]],
  clone:"product-specs",
  repos:[[T("all five repositories","усі п'ять репозиторіїв"),T("you own `.gitlab-ci.yml` in each of them, and the sync job in `product-specs`","ви відповідаєте за `.gitlab-ci.yml` у кожному з них і за sync-job у `product-specs`")]],
  flow:[T("Once: assign seats, set spend limits and managed settings, create `product-specs` with the sync job, protect `main` everywhere, add the pipeline and staging with seeded data.","Один раз: роздайте місця, задайте ліміти витрат і керовані налаштування, створіть `product-specs` із sync-job, захистіть `main` усюди, додайте пайплайн і стенд із підготовленими даними."),
        T("Per feature, after `ship`: deploy the backend to staging first, then the clients. Hand QA the address, the build numbers and the test accounts.","На кожну фічу, після `ship`: викладіть на стенд спершу backend, потім клієнтів. Передайте QA адресу, номери збірок і тестові облікові записи."),
        T("After the go: release in order, backend, web, Android, iOS. A person starts every production job.","Після go: реліз по черзі, backend, веб, Android, iOS. Кожну job на продакшені запускає людина."),
        T("Watch error and crash rates for a day. If they jump, turn the flag off or roll back and open a bug for `/sdd:fix`.","Добу стежте за помилками та крешами. Якщо вони стрибнули, вимкніть flag або відкотіть і заведіть баг для `/sdd:fix`."),
        T("Each month: read the spend report, adjust seats and limits, and update the allowed MCP servers.","Щомісяця: перегляньте звіт про витрати, скоригуйте місця й ліміти та оновіть дозволені MCP-сервери.")],
  allow:["Edit(/.gitlab-ci.yml)","Bash(glab ci status *)","Bash(glab mr view *)"], deny:["Bash(glab ci run *)","Bash(git push --force *)","Read(./.env)"],
  git:T("Maintainer on the five projects: you manage protected branches, CI/CD variables and who may merge and deploy. Production jobs are manual and run only from protected branches or tags.","Maintainer у п'яти проєктах: ви керуєте захищеними гілками, змінними CI/CD і тим, хто може мержити й викладати. Job на продакшені ручні й запускаються лише із захищених гілок або тегів."),
  admin:T("You set the policy for everyone with server-managed settings: deny rules for `.env` and other secret files, the allowed MCP servers (`allowedMcpServers`) and no bypass mode (`permissions.disableBypassPermissionsMode`).","Ви задаєте політику для всіх через керовані сервером налаштування: заборони для `.env` та інших файлів із секретами, дозволені MCP-сервери (`allowedMcpServers`) і вимкнений режим bypass (`permissions.disableBypassPermissionsMode`)."),
  owns:T("`.gitlab-ci.yml` and the deploy configuration","`.gitlab-ci.yml` і конфігурацію викладки"),
  updates:[".gitlab-ci.yml",T("deploy configuration","конфігурація викладки"),"CODEOWNERS",T(".mcp.json and .claude/settings.json, with the team leads",".mcp.json і .claude/settings.json, разом із лідами команд")],
  reads:["test-plan.md","changelog","review record",T("pipelines and merge requests","пайплайни й merge request")],
  noedit:T("`spec.md`, application code","`spec.md`, код застосунків")}
};
function setupHTML(){
  var k=setupRole,d=SETUP[k],dev=k==="dev",term=dev||k==="ops";
  var mine=STEPS.filter(function(x){return x.role===k;}).sort(function(a,b){return a.row-b.row;});
  var cmds=[]; mine.forEach(function(x){x.cmds.forEach(function(c){if(cmds.indexOf(c)<0)cmds.push(c);});});
  var seat="Team "+tr(SEATROLE[k]==="prem"?U.seatPrem:U.seatStd);
  function item(name,note,href,cs){return '<li><div><b>'+(href?lk(href,tr(name)):esc(tr(name)))+'</b> <span class="v">'+fmt(note)+'</span></div>'+(cs&&cs.length?'<div class="cmds">'+cs.map(cmdLine).join("")+'</div>':'')+'</li>';}
  var install='<ul class="setup-list">'+
    item(T("Claude account","Обліковий запис Claude"),T("a seat on the team plan ("+seat+"). The free plan does not include Claude Code.","місце в командному тарифі ("+seat+"). Безкоштовний тариф не містить Claude Code."),"https://claude.ai/",[])+
    (term?item(T("Claude Code in the terminal","Claude Code у терміналі"),T("macOS, Linux and WSL use the first command, Windows PowerShell the second. Then run `claude` in the project folder and sign in.","macOS, Linux і WSL використовують першу команду, Windows PowerShell другу. Потім запустіть `claude` у теці проєкту й увійдіть."),"https://code.claude.com/docs/en/setup",["curl -fsSL https://claude.ai/install.sh | bash","irm https://claude.ai/install.ps1 | iex"])
        :item(T("Claude desktop app, Code tab","Десктоп-застосунок Claude, вкладка Code"),T("no terminal needed. If you prefer the terminal, the setup guide has the install commands.","термінал не потрібен. Якщо зручніше в терміналі, команди встановлення є в інструкції."),"https://claude.com/download",[]))+
    (term?'':'<li><div class="v">'+lk("https://code.claude.com/docs/en/desktop-quickstart",tr(T("Desktop quickstart","Швидкий старт для десктопу")))+' · '+lk("https://code.claude.com/docs/en/setup",tr(T("Terminal setup","Встановлення в терміналі")))+' · '+lk("https://code.claude.com/docs/en/terminal-guide",tr(T("Terminal guide for beginners","Термінал для початківців")))+'</div></li>')+
    item("Git",T("to clone the repository and switch branches. On Windows install Git for Windows.","щоб клонувати репозиторій і перемикати гілки. На Windows встановіть Git for Windows."),"https://git-scm.com/downloads",[])+
    (k==="ops"?'':item(T("SDD plugin","Плагін SDD"),T("run both commands once inside Claude Code.","виконайте обидві команди один раз усередині Claude Code."),"https://github.com/genkovich/sdd",["/plugin marketplace add genkovich/sdd","/plugin install sdd@sdd"]))+
    d.extra.map(function(x){return item(x[0],x[1],x[2],x[3]);}).join("")+'</ul>';
  var servers=MCP.filter(function(m){return m.cells[k]!=="-";});
  var mcp='<p>'+fmt(T("Project servers are listed in the repository's `.mcp.json`. After you open the project, run `/mcp` and sign in to each one with your own account.","Сервери проєкту описані в `.mcp.json` у репозиторії. Відкривши проєкт, виконайте `/mcp` і ввійдіть у кожен під своїм обліковим записом."))+'</p><ul class="setup-list">'+
    servers.map(function(m){return '<li><div><b>'+esc(m.name)+'</b> <span class="tw">'+esc(tr(U[m.cells[k]]))+'</span><span class="v">'+esc(tr(m.what))+'</span></div><div class="cmds">'+cmdLine(m.cmd)+'</div></li>';}).join("")+'</ul>'+
    ((k==="qa"||dev)?'<p class="plain">'+esc(tr(T("Playwright is for the web admin, Maestro for Android and iOS. Connect the one your platform needs.","Playwright потрібен для вебадмінки, Maestro для Android та iOS. Підключайте той, що потрібен вашій платформі.")))+'</p>':'')+
    '<p class="sources">'+lk("https://code.claude.com/docs/en/mcp",tr(T("MCP in Claude Code","MCP у Claude Code")))+lk("https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/","Atlassian Rovo MCP")+(servers.some(function(m){return m.key==="gl";})?lk("https://docs.gitlab.com/user/model_context_protocol/mcp_server/","GitLab MCP server"):"")+(servers.some(function(m){return m.key==="mae";})?lk("https://maestro.dev/blog/maestro-mcp-for-ai-coding-agents","Maestro MCP"):"")+'</p>';
  var ask=tr(T("Switch to branch feature/tasks-issues and pull the latest changes.","Перейди на гілку feature/tasks-issues і підтягни останні зміни."));
  var repo='<p>'+fmt(T("Yes. SDD stages read and write files in a repository, and each team has its own.","Так. Стадії SDD читають і пишуть файли в репозиторії, а в кожної команди він свій."))+'</p>'+
    '<ul class="rows repo-rows">'+d.repos.map(function(r){var n=tr(r[0]);return '<li><span>'+(/ /.test(n)&&!/,/.test(n)?'<b>'+esc(n)+'</b>':'<code>'+esc(n)+'</code>')+'</span><span class="v">'+fmt(r[1])+'</span></li>';}).join("")+'</ul>'+
    '<div class="cmds">'+cmdLine("git clone "+GROUP_URL+d.clone+".git")+cmdLine("cd "+d.clone)+(term?cmdLine("claude"):"")+'</div>'+
    '<p>'+fmt(term?T("`YOUR-GROUP` and the repository names are placeholders. Work on the feature branch, for example `feature/tasks-issues`. `main` only changes through a merge request.","`YOUR-GROUP` і назви репозиторіїв умовні. Працюйте у гілці фічі, наприклад `feature/tasks-issues`. `main` змінюється лише через merge request.")
               :T("`YOUR-GROUP` is a placeholder. In the desktop app open the Code tab and choose the cloned folder as the project. Work on the feature branch, never on `main`. You do not need Git commands: ask Claude in plain words.","`YOUR-GROUP` — умовна назва. У десктоп-застосунку відкрийте вкладку Code й оберіть клоновану теку як проєкт. Працюйте у гілці фічі, не в `main`. Команди Git знати не потрібно: попросіть Claude звичайними словами."))+'</p>'+
    '<div class="pblock"><div class="caprow"><p class="cap">'+esc(tr(T("Ask Claude:","Попросіть Claude:")))+'</p>'+copyBtn(ask)+'</div><pre class="wrap">'+esc(ask)+'</pre></div>'+
    '<p class="sources">'+lk("https://docs.gitlab.com/topics/git/clone/",tr(T("Cloning a repository from GitLab","Клонування репозиторію з GitLab")))+lk("https://git-scm.com/downloads",tr(T("Download Git","Завантажити Git")))+'</p>';
  var flowItems=d.flow?d.flow.map(function(x){return '<li>'+fmt(x)+'</li>';}).join(""):
    '<li>'+fmt(T("Open the repository in Claude Code and update the feature branch.","Відкрийте репозиторій у Claude Code й оновіть гілку фічі."))+'</li>'+
    '<li>'+fmt(T("Run your stage. Start each one with `/clear` so it reads its inputs from disk.","Запустіть свою стадію. Кожну починайте з `/clear`, щоб вона читала вхідні файли з диска."))+(cmds.length?'<div class="chips" style="margin-top:4px">'+cmds.map(function(c){return '<code>'+esc(c)+'</code>';}).join("")+'</div>':'')+'</li>'+
    '<li>'+fmt(d.flow3)+'</li>'+
    '<li>'+fmt(dev?T("Accept the commits Claude proposes. `ship` opens the merge request; a code owner approves it and a person merges it.","Приймайте коміти, які пропонує Claude. `ship` відкриває merge request; його погоджує власник коду, а мержить людина.")
                 :T("Accept the commit Claude proposes, push the branch and open a merge request.","Прийміть коміт, який пропонує Claude, запуште гілку й відкрийте merge request."))+'</li>'+
    '<li>'+fmt(T("Paste the handoff block into the Jira ticket, so the next role knows what to review and what to run.","Вставте блок передачі в задачу Jira, щоб наступна роль знала, що переглянути й що запускати."))+'</li>';
  var flow='<ol class="loop-steps">'+flowItems+'</ol>'+
    '<div class="steps-in role-'+k+'">'+mine.map(function(x){return '<button type="button" class="step-link" data-nav="'+x.id+'">'+(x.row+1)+' · '+esc(tr(x.label))+'</button>';}).join("")+'</div>';
  var json=JSON.stringify({permissions:{allow:d.allow,deny:d.deny}},null,2);
  var perm='<ul class="rule-list">'+
    (d.admin?'<li><b>'+esc(tr(U.inAdmin))+'</b><span>'+fmt(d.admin)+'</span></li>':'')+
    '<li><b>'+esc(tr(U.inClaude))+'</b><span>'+fmt(term?T("Manual mode by default; accept-edits mode is fine while a long stage runs. Do not use bypassPermissions on your own machine.","Типово режим Manual; режим accept-edits доречний, поки працює довга стадія. Не вмикайте bypassPermissions на своїй машині.")
        :T("Stay in Manual mode: Claude asks before every edit and command. Add the rules below to `.claude/settings.local.json` so it edits only your files.","Лишайтесь у режимі Manual: Claude питає перед кожною правкою й командою. Додайте правила нижче в `.claude/settings.local.json`, щоб він редагував лише ваші файли."))+'</span></li></ul>'+
    '<div class="pblock"><div class="caprow"><p class="cap"><code>.claude/settings.local.json</code> · '+esc(tr(T("the paths are examples: adjust them to your repository","шляхи умовні: підлаштуйте їх під свій репозиторій")))+'</p>'+copyBtn(json)+'</div><pre>'+esc(json)+'</pre></div>'+
    '<ul class="rule-list">'+
    '<li><b>'+esc(tr(U.onGit))+'</b><span>'+(d.git?fmt(d.git):fmt(T("Developer role on the project, so you can push your branch and open merge requests. `main` is protected: changes land through a merge request with an approval. Code Owners send ","Роль Developer у проєкті, щоб пушити свою гілку й відкривати merge request. `main` захищена: зміни потрапляють через merge request із погодженням. Code Owners надсилають "))+fmt(d.owns)+fmt(T(" to your role for review."," на рев'ю вашій ролі.")))+'</span></li>'+
    '<li><b>'+esc(tr(U.inApps))+'</b><span>'+fmt(T("MCP uses your own sign-in, so Claude can do only what your account can.","MCP працює під вашим входом, тож Claude може лише те, що може ваш обліковий запис."))+'</span></li></ul>'+
    '<p class="plain">'+fmt(T("Claude Code rules guide its file tools; they are not a security boundary. Protected branches in GitLab are what enforce who can change what. Required approvals and Code Owners need GitLab Premium or Ultimate.","Правила Claude Code скеровують його файлові інструменти, але не є межею безпеки. Хто що може змінювати, насправді забезпечують захищені гілки в GitLab. Обов'язкові погодження й Code Owners потребують GitLab Premium або Ultimate."))+'</p>'+
    '<p class="sources">'+lk("https://code.claude.com/docs/en/permissions",tr(T("Claude Code permissions","Права в Claude Code")))+lk("https://docs.gitlab.com/user/project/repository/branches/protected/",tr(T("Protected branches","Захищені гілки")))+lk("https://docs.gitlab.com/user/project/codeowners/","Code Owners")+(d.admin?lk("https://code.claude.com/docs/en/server-managed-settings",tr(T("Server-managed settings","Керовані сервером налаштування"))):"")+'</p>';
  var files='<div class="grid2">'+cell(U.upd,'<div class="chips">'+d.updates.map(src).join("")+'</div>')+cell(U.rd,'<div class="chips">'+d.reads.map(function(x){var t=tr(x);return /[.\/_]/.test(t)&&!/ /.test(t.replace(/, /g,""))?'<code>'+esc(t)+'</code>':'<span class="src">'+esc(t)+'</span>';}).join("")+'</div>')+'</div>'+
    '<div class="handline"><span class="k">'+esc(tr(U.noEdit))+'</span><span>'+fmt(d.noedit)+'</span></div>'+
    '<p class="plain">'+fmt(T("Feature files sit in `docs/features/tasks-issues/` of the repository they belong to. The Repos & files tab shows which file lives where.","Файли фічі лежать у `docs/features/tasks-issues/` того репозиторію, до якого належать. Вкладка «Репо й файли» показує, що де лежить."))+'</p>';
  return '<div class="rolepick" role="group" aria-label="'+esc(tr(U.setupIntro))+'">'+ROLE_ORDER.map(function(x){return '<button type="button" class="lane-btn role-'+x+'" data-setup="'+x+'" aria-pressed="'+String(x===k)+'">'+esc(tr(ROLES[x].l))+'</button>';}).join("")+'</div>'+
    '<div class="d-top role-'+k+'"><h2>'+esc(tr(ROLES[k].name))+'</h2><p class="sum">'+esc(tr(ROLES[k].scope))+'</p></div>'+
    '<div class="acc">'+sec("s1",U.sInstall,install,setupOpen==="s1")+sec("s2",U.sMcp,mcp,setupOpen==="s2")+sec("s3",U.sRepo,repo,setupOpen==="s3")+sec("s4",U.sFlow,flow,setupOpen==="s4")+sec("s5",U.sPerm,perm,setupOpen==="s5")+sec("s6",U.sFiles,files,setupOpen==="s6")+'</div>';
}
