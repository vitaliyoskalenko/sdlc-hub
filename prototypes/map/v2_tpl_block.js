/* ===== Version 2 overrides for the one-screen layout ===== */
S.ver=T("Version 2","Версія 2");
S.introLead=T("How a team builds a feature when an LLM assistant does most of the writing and people make the decisions. Shown in Claude Code with GitLab; the same SDD plugin also installs into Codex CLI and Cursor.",
  "Як команда робить фічу, коли більшість тексту й коду пише LLM-асистент, а рішення приймають люди. Показано в Claude Code з GitLab; той самий плагін SDD ставиться також у Codex CLI та Cursor.");
S.introShow=T("The whole development of this feature in 18 steps, from idea to production: what each role does, with which tools, what it produces and whom it hands off to. Engineering is four teams, each with its own GitLab repository; Web, Android and iOS build against the backend's contract.",
  "Уся розробка цієї фічі за 18 кроків, від ідеї до продакшену: що робить кожна роль, якими інструментами, що лишає на виході й кому передає. Розробка складається з чотирьох команд, кожна зі своїм репозиторієм у GitLab; Web, Android та iOS будують під контракт backend.");
INTRO_ROLE.pm=T("confirms size and route, moves the tasks of four teams into Jira, gives the go or no-go","підтверджує розмір і маршрут, переносить задачі чотирьох команд у Jira, дає go або no-go");
INTRO_ROLE.des=T("designs the user flows and every screen in every state, for web, Android and iOS","проєктує шляхи користувача й кожен екран у кожному стані для вебу, Android та iOS");
INTRO_ROLE.dev=T("Backend, Web, Android, iOS: design, API contract, code through TDD, review and merge requests","Backend, Web, Android, iOS: дизайн, контракт API, код через TDD, рев'ю і merge request");
INTRO_ROLE.qa=T("test plan from the criteria, AI-assisted checks on web and mobile, bugs traced to the criteria","план тестів від критеріїв, перевірка з ШІ на вебі й мобільних, баги з прив'язкою до критеріїв");
INTRO_ROLE.ops=T("seats and policy, pipelines, staging, the release order, rollout and monitoring","місця й політики, пайплайни, стенд, порядок релізу, розкатка й моніторинг");
TABS=[["step",T("Details","Деталі")],["hand",T("Handoffs","Передачі")],["mcp",T("Tools","Інструменти")],["files",T("Repos & files","Репо й файли")],["cost",T("Cost","Вартість")],["rules",T("Rules","Правила")],["setup",T("Role setup","Інструкції")]];
LB.contract=T("Contract gap","Контракт"); LB.prod=T("Hotfix","Хотфікс");
U.roleProposal=T("SDD does not bind stages to roles and assumes one repository. The split by role and team, the hub repository, and the steps with Jira, Confluence, staging and the release are a proposal for your team.","SDD не закріплює стадії за ролями й розрахований на один репозиторій. Розподіл по ролях і командах, репозиторій-хаб і кроки з Jira, Confluence, стендом та релізом запропоновані під вашу команду.");

SUM.epic=T("The PM confirms size and route, places the feature in the roadmap and assigns the designer and four team leads.","PM підтверджує розмір і маршрут, ставить фічу в roadmap і призначає дизайнера та чотирьох лідів команд.");
SUM.uxflows=T("The designer maps one flow per user story and lists every screen, for web, Android and iOS.","Дизайнер описує шлях на кожну історію й складає перелік екранів для вебу, Android та iOS.");
SUM.design=T("The backend lead fits the feature into the existing architecture and the client leads review it. This is architecture, not UI.","Лід backend вписує фічу в наявну архітектуру, а ліди клієнтів це рев'юють. Це архітектура, а не UI.");
SUM.datamodel=T("Backend only: schema plus forward and rollback migrations. The client teams wait here.","Лише backend: схема й міграції вперед і назад. Клієнтські команди тут чекають.");
SUM.api=T("Backend derives the OpenAPI contract and the Web, Android and iOS leads approve it. After that the clients stop waiting.","Backend виводить OpenAPI-контракт, а ліди Web, Android та iOS його погоджують. Після цього клієнти перестають чекати.");
SUM.screens=T("The designer specifies every screen in every state for web, Android and iOS and links the Figma frames.","Дизайнер описує кожен екран у кожному стані для вебу, Android та iOS і додає фрейми Figma.");
SUM.tasks=T("Each of the four teams splits its own work into tasks of a day or less, in its own repository.","Кожна з чотирьох команд ділить свою роботу на задачі до одного дня у своєму репозиторії.");
SUM.sprint=T("Claude turns four tasks.json files into Jira stories and the PM plans the sprint around the backend dependency.","Claude переносить чотири tasks.json у задачі Jira, а PM планує спринт з урахуванням залежності від backend.");
SUM.plantests=T("QA maps every acceptance criterion to at least one test on each platform.","QA зіставляє кожен критерій приймання щонайменше з одним тестом на кожній платформі.");
SUM.implement=T("Backend builds the real API through TDD while Web, Android and iOS build against a mock of the contract.","Backend будує справжній API через TDD, а Web, Android та iOS тим часом будують на моку контракту.");
SUM.review=T("A clean-context reviewer checks each change against the spec, and a human code owner approves the merge request.","Рев'юер у чистому контексті звіряє кожну зміну зі spec, а merge request погоджує людина, власник коду.");
SUM.ship=T("Each team runs its part for real, writes the changelog and opens a merge request.","Кожна команда запускає свою частину по-справжньому, пише changelog і відкриває merge request.");
SUM.staging=T("Backend goes to staging first, the clients switch off the mock, and QA gets a web address and two test builds.","Backend першим іде на стенд, клієнти вимикають мок, а QA отримує вебадресу й дві тестові збірки.");
SUM.verify=T("QA and Claude walk staging in a browser and on mobile emulators and file bugs traced to AC.","QA з Claude проходять стенд у браузері й на мобільних емуляторах і заводять баги з прив'язкою до AC.");
SUM.fix=T("The team that owns the bug reproduces it, pins it with a failing test and fixes it through the same gate.","Команда-власник бага відтворює його, фіксує тестом, що падає, і виправляє через той самий гейт.");
SUM.accept=T("The analyst accepts the feature on staging and the PM gives the go or no-go.","Аналітик приймає фічу на стенді, а PM дає go або no-go.");
SUM.release=T("Backend, then web, then the mobile apps as a staged rollout, watched for the first day.","Backend, далі веб, далі мобільні застосунки поетапно, з наглядом першу добу.");

S.toolsIntro=T("The SDD plugin runs the stages inside Claude Code, Claude Design covers prototypes, MCP servers connect Claude to Jira, Figma and GitLab, and GitLab CI/CD does the deploys. Open a tool to see what it is for and where it is used.",
  "Плагін SDD запускає стадії всередині Claude Code, Claude Design закриває прототипи, MCP-сервери з'єднують Claude з Jira, Figma та GitLab, а GitLab CI/CD робить викладки. Відкрийте інструмент, щоб побачити, для чого він і де використовується.");
TOOLREG={
 sdd:{name:"SDD plugin",where:T("Claude Code, in the repo","Claude Code, у репозиторії")},
 cc:{name:"Claude Code",where:T("terminal, desktop or web","термінал, десктоп або веб")},
 cd:{name:"Claude Design",where:"claude.ai/design"},
 atl:{name:"Atlassian Rovo MCP",where:"Jira · Confluence"},
 fig:{name:"Figma MCP",where:"Figma"},
 gl:{name:"GitLab MCP / glab",where:"GitLab"},
 pw:{name:"Playwright MCP",where:T("web admin on staging","вебадмінка на стенді")},
 mae:{name:"Maestro MCP",where:"Android · iOS"},
 ci:{name:"GitLab CI/CD",where:T("pipelines","пайплайни")},
 mon:{name:T("Monitoring","Моніторинг"),where:T("your error and crash tracker","ваш трекер помилок і крешів")}
};
MCPKEY={"Atlassian Rovo":"atl","Figma":"fig","GitLab":"gl","Playwright":"pw","Maestro":"mae"};
STOOL.tasks=["sdd",T("writes the client design and `tasks.json` per repository","пише клієнтський дизайн і `tasks.json` у кожному репозиторії")];
STOOL.sprint=["cc",T("reads four `tasks.json` files and prepares the Jira stories","читає чотири файли `tasks.json` і готує задачі для Jira")];
STOOL.ship=["sdd",T("runs the team's part for real and writes the changelog","запускає частину команди по-справжньому й пише changelog")];
STOOL.staging=["cc",T("checks the pipelines, runs the smoke flow","перевіряє пайплайни, проходить smoke-сценарій")];
STOOL.verify=["cc",T("walks the flows and checks each AC","проходить шляхи й перевіряє кожен AC")];
STOOL.accept=["cc",T("drafts the release notes from the four changelogs","готує чернетку нотаток до релізу з чотирьох changelog")];
STOOL.release=["cc",T("prepares the checklist, compares error rates","готує чекліст, порівнює рівень помилок")];
var XTOOL={
 uxflows:[["cd",CDTOOL.uxflows]],
 screens:[["cd",CDTOOL.screens]],
 review:[["ci",T("tests and security scan; optional Claude review job","тести й перевірка безпеки; за бажанням job рев'ю від Claude")]],
 staging:[["ci",T("deploys to staging, builds the test builds","викладає на стенд, збирає тестові збірки")]],
 release:[["ci",T("production deploy jobs, started by a person","deploy-job на продакшен, запускає людина")],["mon",T("error and crash rates before and after","помилки та креші до і після")]]
};

/* rough estimates for the whole feature across four repositories */
EST={
 specify:[0.8,1.5,"opus",T("judgment: spec and critic","судження: spec і критик")],
 clarify:[0.5,1,"opus",T("judgment: hunting ambiguity","судження: пошук неоднозначностей")],
 epic:[0.1,0.3,"haiku",T("simple sizing and bookkeeping","просте оцінювання й облік")],
 uxflows:[0.8,1.5,"sonnet",T("derived from the spec, three platforms","виводиться зі spec, три платформи")],
 design:[1.5,3,"opus",T("architecture decisions","архітектурні рішення")],
 datamodel:[0.6,1.2,"sonnet",T("derived from the design","виводиться з дизайну")],
 api:[0.6,1.2,"sonnet",T("derived from the data model","виводиться з моделі даних")],
 screens:[1.5,3,"sonnet",T("many states on three platforms","багато станів на трьох платформах")],
 tasks:[2,4,"sonnet",T("four repositories, three short client designs","чотири репозиторії, три короткі клієнтські дизайни")],
 sprint:[0.4,0.8,"haiku",T("mechanical Jira entry","механічне внесення в Jira")],
 plantests:[0.6,1.2,"sonnet",T("mapping AC to tests and platforms","зіставлення AC з тестами й платформами")],
 implement:[26,60,"sonnet",T("four repositories: backend about 8–20M, each client about 6–13M","чотири репозиторії: backend близько 8–20 млн, кожен клієнт близько 6–13 млн")],
 review:[4,9,"opus",T("judgment over four merge requests","судження про чотири merge request")],
 ship:[2.5,5,"sonnet",T("run, changelog and merge request in four repositories","запуск, changelog і merge request у чотирьох репозиторіях")],
 staging:[0.3,0.8,"sonnet",T("pipeline checks and the smoke flow","перевірка пайплайнів і smoke-сценарій")],
 verify:[8,20,"sonnet",T("a browser and two mobile platforms","браузер і дві мобільні платформи")],
 fix:[1.5,3,"sonnet",T("per bug; opus if the cause is unclear","на один баг; opus, якщо причина неясна")],
 accept:[0.1,0.3,"haiku",T("short notes","короткі нотатки")],
 release:[0.3,0.8,"sonnet",T("checklist and monitoring summary","чекліст і підсумок моніторингу")]
};
SEATROLE.ops="std";
S.costIntro=T("Rough estimates for one M-size feature across backend, web, Android and iOS, counting every token the model processes, cached re-reads included. They are not measured on your project: run one pilot feature and read the real numbers with <code>/usage</code>.",
  "Грубі оцінки для однієї фічі розміру M на backend, вебі, Android та iOS з урахуванням усіх токенів, які обробляє модель, разом із перечитаним кешем. На вашому проєкті їх не вимірювали: проведіть одну пілотну фічу й подивіться справжні числа через <code>/usage</code>.");
S.costTotal=T("<b>Whole feature: about {t} tokens, about {u} at API list prices.</b> The price assumes 90% cached re-reads, 8% new input and 2% output. Tasks, implement, review and ship are counted for all four repositories. On Team seats the work is not billed per step: it draws on each seat's allowance.",
  "<b>Уся фіча: приблизно {t} токенів, близько {u} за прайсовими цінами API.</b> Ціна виходить із припущення: 90% перечитаного кешу, 8% нового входу, 2% виходу. Tasks, implement, review і ship пораховано для всіх чотирьох репозиторіїв. На місцях Team робота не списується за крок: вона витрачає ліміт кожного місця.");
SEATS=[
 ["po",T("PO / analyst","PO / аналітик"),1,"std",T("short interview and spec stages","короткі стадії інтерв'ю та spec"),true],
 ["pm","PM",1,"std",T("sizing and Jira entry","оцінювання й внесення в Jira"),true],
 ["des",T("Designers","Дизайнери"),2,"std",T("ux-flows, screens, Claude Design","ux-flows, screens, Claude Design"),false],
 ["qa","QA",4,"std",T("browser and emulator checks are heavy: turn on usage credits and upgrade a seat that keeps hitting the limit","перевірки в браузері й на емуляторі важкі: увімкніть usage credits і підвищуйте місце, яке постійно впирається в ліміт"),false],
 ["dev","Backend",3,"prem",T("design, contract and the heaviest implement","дизайн, контракт і найважчий implement"),true],
 ["dev","Web",2,"prem",T("implement, review and fix","implement, review і fix"),true],
 ["dev","Android",2,"prem",T("the same","те саме"),false],
 ["dev","iOS",4,"prem",T("the same","те саме"),false],
 ["ops",T("DevOps / release","DevOps / реліз"),1,"std",T("pipeline checks and release notes","перевірка пайплайнів і нотатки до релізу"),true]
];
U.assumed=T("assumed","припущення"); U.seatsOf=T("Number of people:","Кількість людей:");
function planLead(){
  var m=seatMix(),n=m.std+m.prem,mo=m.std*25+m.prem*125;
  return LANG==="uk"
    ?"<b>Тариф Team, "+n+" місць: "+m.std+" Standard і "+m.prem+" Premium.</b> Це $"+m.month+" на місяць за річної оплати ("+m.std+" × $20 + "+m.prem+" × $100) або $"+mo+" за помісячної ("+m.std+" × $25 + "+m.prem+" × $125), без податків. Рядки з позначкою «припущення» вгадані: впишіть справжню кількість людей."
    :"<b>Team plan, "+n+" seats: "+m.std+" Standard and "+m.prem+" Premium.</b> That is $"+m.month+" a month billed annually ("+m.std+" × $20 + "+m.prem+" × $100) or $"+mo+" billed monthly ("+m.std+" × $25 + "+m.prem+" × $125), before tax. Rows marked “assumed” are guesses: type in your real headcount.";
}
S.planNotes=T(
 "<li>Every Team seat includes Claude Code and all models. Standard gives 1.25× the Pro per-session allowance, Premium 6.25×. The plan covers 2 to 150 seats, with SSO and spend controls.</li>"+
 "<li>Turn on usage credits with a spend limit per person, so nobody is blocked mid-task when a seat runs out.</li>"+
 "<li>The Claude job in GitLab CI does not use a seat. It runs on an API key from the Claude Console and is billed per token: give that key its own monthly limit.</li>"+
 "<li>Enterprise ($20 a seat plus all usage at API rates, self-serve from 20 seats) is worth it only if you need audit logs, SCIM or compliance controls.</li>"+
 "<li>For scale: Anthropic reports an average of about $13 per developer per active day at API rates for Claude Code, which is why Premium is the safer start for developers.</li>"+
 "<li>Check the seat mix after one pilot feature, using <code>/usage</code> and the admin spend report.</li>",
 "<li>Кожне місце Team містить Claude Code і всі моделі. Standard дає 1,25× ліміту Pro на сесію, Premium 6,25×. Тариф розрахований на 2–150 місць, із SSO та контролем витрат.</li>"+
 "<li>Увімкніть usage credits з лімітом витрат на людину, щоб ніхто не зупинявся посеред задачі, коли місце вичерпано.</li>"+
 "<li>Job Claude у GitLab CI не займає місця. Вона працює на API-ключі з Claude Console й оплачується за токени: дайте цьому ключу окремий місячний ліміт.</li>"+
 "<li>Enterprise ($20 за місце плюс усе використання за цінами API, самообслуговування від 20 місць) має сенс, лише якщо потрібні журнали аудиту, SCIM або комплаєнс-контролі.</li>"+
 "<li>Для масштабу: за даними Anthropic, Claude Code у середньому коштує близько $13 на розробника за активний день за цінами API, тому розробникам безпечніше стартувати з Premium.</li>"+
 "<li>Перегляньте розподіл місць після однієї пілотної фічі за <code>/usage</code> та адмінським звітом про витрати.</li>");

/* rules tab */
U.rGates=T("Who signs off what","Хто що погоджує"); U.rSec=T("Security and data","Безпека й дані"); U.rFast=T("Fast path for small changes","Короткий шлях для дрібних змін"); U.rPilot=T("Before the whole team switches","Перш ніж переходити всією командою");
U.thGate=T("Signs off","Погоджує"); U.thGateWhat=T("What","Що саме");
S.gateIntro=T("Claude drafts, checks and proposes. A named person approves at every step, and AI review never counts as an approval.","Claude пише, перевіряє та пропонує. На кожному кроці погоджує конкретна людина, а рев'ю від ШІ ніколи не рахується як погодження.");
S.secList=T(
 "<li><b>What may go into a prompt</b><span>Code and specs: yes. Secrets, production customer data and order exports: no. Staging runs on seeded data.</span></li>"+
 "<li><b>One policy for everyone</b><span>The admin sets server-managed settings in the Claude admin console: deny rules for <code>.env</code> and other secret files, and the allowed MCP servers (<code>allowedMcpServers</code>). Nobody can loosen them locally.</span></li>"+
 "<li><b>Text from Jira, Confluence and the web is data, not instructions</b><span>A ticket can contain text that tries to steer the model. Roles that read outside content stay in Manual mode and read what Claude proposes before accepting it.</span></li>"+
 "<li><b>Secrets live in GitLab</b><span>As masked CI/CD variables, never in a repository or in <code>CLAUDE.md</code>. The API key of the Claude job in CI has its own spend limit.</span></li>"+
 "<li><b>Scans on every merge request</b><span>The pipeline runs the security scanners you have. <code>/security-review</code> in Claude Code is a cheap extra pass before <code>ship</code>.</span></li>"+
 "<li><b>Training and retention</b><span>On Team plans Anthropic does not train models on your code or prompts. Check the retention terms against your own compliance needs.</span></li>",
 "<li><b>Що можна давати в промпт</b><span>Код і специфікації: так. Секрети, дані реальних клієнтів і вивантаження замовлень: ні. Стенд працює на підготовлених даних.</span></li>"+
 "<li><b>Одна політика для всіх</b><span>Адмін задає керовані сервером налаштування в адмін-консолі Claude: заборони для <code>.env</code> та інших файлів із секретами й дозволені MCP-сервери (<code>allowedMcpServers</code>). Локально їх ніхто не послабить.</span></li>"+
 "<li><b>Текст із Jira, Confluence та вебу — це дані, а не інструкції</b><span>У задачі може бути текст, який намагається керувати моделлю. Ролі, що читають зовнішній вміст, лишаються в режимі Manual і читають пропозиції Claude, перш ніж приймати.</span></li>"+
 "<li><b>Секрети живуть у GitLab</b><span>Як masked-змінні CI/CD, ніколи в репозиторії чи <code>CLAUDE.md</code>. API-ключ job Claude у CI має власний ліміт витрат.</span></li>"+
 "<li><b>Перевірки на кожному merge request</b><span>Пайплайн запускає сканери безпеки, які у вас є. <code>/security-review</code> у Claude Code дає дешевий додатковий прохід перед <code>ship</code>.</span></li>"+
 "<li><b>Навчання і зберігання</b><span>На тарифах Team Anthropic не навчає моделі на вашому коді чи промптах. Умови зберігання звірте з власними вимогами комплаєнсу.</span></li>");
S.fastList=T(
 "<li><b>XS and S take the quick route.</b> SDD skips a stage when its work does not exist: clarify with no open questions, sequences with no multi-step flow, data-model with no schema change, plan-tests kept inside the spec.</li>"+
 "<li><b>M takes standard</b>, which is this map. <b>L and XL take full.</b></li>"+
 "<li><b>A production bug or a one-line text change skips the map.</b> The owning team runs <code>/sdd:fix</code>, QA retests, Ops ships a hotfix.</li>"+
 "<li><b>A change in one client only</b>, such as an Android layout fix, has no backend steps and no contract review. The other teams are not involved.</li>"+
 "<li>The PM confirms the route at step 3, and <code>/sdd:classify-size</code> re-checks it if the scope grows.</li>",
 "<li><b>XS і S ідуть маршрутом quick.</b> SDD пропускає стадію, якщо для неї немає роботи: clarify без відкритих питань, sequences без багатокрокового потоку, data-model без зміни схеми, plan-tests усередині spec.</li>"+
 "<li><b>M іде маршрутом standard</b>, це і є ця карта. <b>L та XL ідуть full.</b></li>"+
 "<li><b>Баг із продакшену чи зміна одного рядка тексту карту не проходять.</b> Команда-власник запускає <code>/sdd:fix</code>, QA робить ретест, Ops випускає хотфікс.</li>"+
 "<li><b>Зміна лише в одному клієнті</b>, наприклад правка верстки в Android, не має кроків backend і рев'ю контракту. Інші команди не залучені.</li>"+
 "<li>PM підтверджує маршрут на кроці 3, а <code>/sdd:classify-size</code> перевіряє його знову, якщо обсяг росте.</li>");
S.pilotList=T(
 "<li><b>Pilot first</b><span>One M-size feature, one person per role, all four teams. Hold a retro before anyone else starts.</span></li>"+
 "<li><b>Take a baseline now</b><span>Lead time from idea to production, bugs found after release, review time, and how long the clients wait for backend. Measure the same after the pilot.</span></li>"+
 "<li><b>Real cost</b><span>The token numbers here are estimates. Read real spend per person in the admin spend report and with <code>/usage</code>.</span></li>"+
 "<li><b>Owners of shared context</b><span>Each team lead owns the team's <code>CLAUDE.md</code> and <code>architecture-map.md</code>, the analyst owns <code>CONTEXT.md</code>, DevOps owns <code>.mcp.json</code>, the pipelines and the sync job. Context with no owner goes stale.</span></li>"+
 "<li><b>Prove the five-repository layout</b><span>SDD assumes one repository. The pilot has to show that the sync merge requests and the contract review work for you.</span></li>"+
 "<li><b>Close the loop after release</b><span>What production showed (errors, crashes, support tickets) goes back to the analyst as input for the next spec.</span></li>",
 "<li><b>Спершу пілот</b><span>Одна фіча розміру M, одна людина на роль, усі чотири команди. Проведіть ретро, перш ніж починатимуть інші.</span></li>"+
 "<li><b>Зніміть базові показники зараз</b><span>Час від ідеї до продакшену, баги після релізу, час на рев'ю і скільки клієнти чекають на backend. Після пілота виміряйте те саме.</span></li>"+
 "<li><b>Справжня вартість</b><span>Числа токенів тут є оцінками. Справжні витрати на людину дивіться в адмінському звіті про витрати та через <code>/usage</code>.</span></li>"+
 "<li><b>Власники спільного контексту</b><span>Лід кожної команди відповідає за <code>CLAUDE.md</code> і <code>architecture-map.md</code> своєї команди, аналітик за <code>CONTEXT.md</code>, DevOps за <code>.mcp.json</code>, пайплайни та sync-job. Контекст без власника застаріває.</span></li>"+
 "<li><b>Перевірте схему з п'яти репозиторіїв</b><span>SDD розрахований на один репозиторій. Пілот має показати, що sync merge request і рев'ю контракту у вас працюють.</span></li>"+
 "<li><b>Замкніть цикл після релізу</b><span>Те, що показав продакшен (помилки, креші, звернення в підтримку), повертається аналітику як вхід для наступного spec.</span></li>");
S.decList=T(
 "<li><b>Whether the analyst, designer and tester work directly in the hub repository.</b> The flow assumes it, because stages read files from disk. Claude Code runs in the terminal, on desktop and on the web, so no IDE is needed for this.</li>"+
 "<li><b>Who builds the sync job.</b> It is a small pipeline in <code>product-specs</code>, owned by DevOps. Until it exists, team leads copy the shared files by hand.</li>"+
 "<li><b>Sync direction with Jira and Confluence.</b> One way is simpler: from the repositories outwards. The analyst carries edits made in Confluence back into <code>spec.md</code>.</li>"+
 "<li><b>Mockup tool.</b> <code>docs/design-system.md</code> fixes it once for everyone: Figma MCP, Pencil MCP or markdown wireframes.</li>"+
 "<li><b>Document language.</b> <code>artifact_language</code> in <code>.claude/sdd.local.md</code> takes <code>en</code> or <code>uk</code>. Section headings and machine tokens stay in English either way.</li>"+
 "<li><b>Who merges and who deploys.</b> <code>ship</code> opens the merge request and stops. Merging, deploying and every rollout stage stay with named people.</li>",
 "<li><b>Чи працюють аналітик, дизайнер і тестувальник прямо в репозиторії-хабі.</b> Флоу на це розрахований, бо стадії читають файли з диска. Claude Code є в терміналі, десктопі та вебі, тож IDE для цього не потрібна.</li>"+
 "<li><b>Хто робить sync-job.</b> Це невеликий пайплайн у <code>product-specs</code>, за який відповідає DevOps. Поки його немає, ліди команд копіюють спільні файли вручну.</li>"+
 "<li><b>Напрям синхронізації з Jira та Confluence.</b> Простіше в один бік: з репозиторіїв назовні. Правки з Confluence аналітик вносить у <code>spec.md</code> сам.</li>"+
 "<li><b>Інструмент макетів.</b> Його один раз для всіх фіксує <code>docs/design-system.md</code>: Figma MCP, Pencil MCP або wireframe в markdown.</li>"+
 "<li><b>Мова документів.</b> <code>artifact_language</code> у <code>.claude/sdd.local.md</code> приймає <code>en</code> або <code>uk</code>. Заголовки секцій і машинні токени в обох випадках лишаються англійською.</li>"+
 "<li><b>Хто мержить і хто викладає.</b> <code>ship</code> відкриває merge request і зупиняється. Мерж, викладка й кожен етап розкатки лишаються за конкретними людьми.</li>");

U.seatsWord=T("seats","місць");
U.beFirst=T("backend first","спершу backend"); U.beFirstTip=T("Backend designs the feature and agrees the contract first. Web, Android and iOS start after step 7.","Backend першим проєктує фічу й погоджує контракт. Web, Android та iOS стартують після кроку 7.");
U.filesAll=T("Which file lives where","Який файл де лежить");

/* repositories a step works in: [name, read-only?]; "*" means the repository of the team that owns the bug */
var R4=[["backend"],["web-admin"],["android-app"],["ios-app"]], RH=[["product-specs"]];
var SREPO={specify:RH,clarify:RH,epic:RH,uxflows:RH,screens:RH,plantests:RH,
 design:[["backend"]],datamodel:[["backend"]],api:[["backend"],["product-specs"]],
 tasks:R4,implement:R4,review:R4,ship:R4,staging:R4,release:R4,
 sprint:R4.map(function(x){return [x[0],true];}),
 verify:[["product-specs",true],["web-admin"],["android-app"],["ios-app"]],
 fix:[["*"]],accept:[["product-specs",true]]};
var RROLE={po:RH,pm:RH.concat(R4.map(function(x){return [x[0],true];})),des:RH,dev:R4,qa:[["product-specs"],["web-admin"],["android-app"],["ios-app"]],ops:RH.concat(R4)};
U.repoK=T("Repository","Репозиторій"); U.reposShortK=T("Repositories","Репозиторії"); U.readOnly=T("read","читає"); U.ownerRepo=T("of the team that owns the bug","команди-власника бага");
U.repoTipW=T("This step writes to this repository","Цей крок пише в цей репозиторій"); U.repoTipR=T("This step only reads from this repository","Цей крок лише читає з цього репозиторію");
function repoLabel(list,states){
  if(!list||!list.length) return "";
  return '<span class="repol"><span class="k">'+esc(tr(list.length>1?U.reposShortK:U.repoK))+'</span>'+list.map(function(x,i){
    if(x[0]==="*") return '<span class="rl any">'+esc(tr(U.ownerRepo))+'</span>';
    if(states){var st=states[i],strong=st==="lead"||st==="real"||st==="first";return '<span class="rl'+(strong?' strong':'')+'" title="'+esc(TEAMS[i])+'">'+esc(x[0])+' <i>'+esc(tr(TSTATE[st]))+'</i></span>';}
    return '<span class="rl'+(x[1]?' ro':'')+'" title="'+esc(tr(x[1]?U.repoTipR:U.repoTipW))+'">'+esc(x[0])+(x[1]?' <i>'+esc(tr(U.readOnly))+'</i>':'')+'</span>';}).join("")+'</span>';
}
U.repoK=T("Repo","Репо"); U.reposShortK=T("Repos","Репо"); U.ownerRepo=T("of the team that owns the bug","команди-власника бага");
TSTATE.after=T("next","далі"); TSTATE.work=T("works","працює"); TSTATE.mr=T("opens MR","відкриває MR");
U.tagTeam=T("team convention","крок команди");
BY.verify.reads=["spec.md (AC)","ux-flows.md","screens.md","test-plan.md",T("staging and the test builds","стенд і тестові збірки")];
TSTATE.mock=T("mock","мок"); U.ownerRepo=T("the owning team's repo","репо команди-власника");
