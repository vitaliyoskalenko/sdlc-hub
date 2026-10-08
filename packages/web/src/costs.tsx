// The Costs screen of a feature: tokens and API-equivalent cost by step against the estimate, for everyone from the
// open totals (groups of three people or more), and for the admin and the PM each person's usage, decrypted on their
// own machine. Nobody else sees per-person spend.

import { useEffect, useState } from "preact/hooks";
import { api, type Costs as CostsData, type FeatureDetail, type Tokens } from "./api.ts";
import { PendingList, useAction, usePending } from "./saves.tsx";
import { personName, useApp } from "./ui.tsx";

const total = (t: Tokens) => t.input + t.cache_write_5m + t.cache_write_1h + t.cache_read + t.output;
const mtok = (n: number) => `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
const usd = (c: number | null) => (c === null ? "no price" : `$${c.toFixed(c >= 100 ? 0 : 2)}`);

export function Costs({ detail }: { detail: FeatureDetail }) {
  const { me, project, session, version } = useApp();
  const slug = detail.state.slug;
  const [data, setData] = useState<CostsData | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.costs(slug, session.demo ? me.user : undefined).then((d) => live && (setData(d), setMonth((m) => m ?? d.months[0] ?? null)));
    return () => {
      live = false;
    };
  }, [slug, me.user, version]);
  if (!data) return <p class="muted">Loading costs…</p>;

  const t = data.totals.find((x) => x.month === month);
  const people = data.people.filter((p) => p.month === month);
  const est = data.estimate.feature;
  const stepIds = project.flow.steps.map((s) => s.id);
  // Flow order; fix and other return paths, which are not steps, come last.
  const order = (id: string) => (stepIds.includes(id) ? stepIds.indexOf(id) : stepIds.length);
  const steps = [...(t?.steps ?? [])].sort((a, b) => order(a.step) - order(b.step));

  return (
    <div class="stack" id="costs">
      <div class="row">
        <label class="fld">
          <span>Month</span>
          <select id="cost-month" value={month ?? ""} onChange={(e) => setMonth(e.currentTarget.value)} disabled={!data.months.length}>
            {data.months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        {!data.months.length && <span class="reason">No usage published yet: it arrives when people run hub sync.</span>}
      </div>

      <div class="grid2">
        <div class="card" id="cost-total">
          <h3>This feature</h3>
          {t?.feature ? (
            <div class="kv">
              <span class="k">Tokens</span>
              <span>{mtok(total(t.feature.tokens))}</span>
              <span class="k">Cost</span>
              <b>{usd(t.feature.cost)}</b>
              <span class="k">People</span>
              <span>{t.feature.people}</span>
            </div>
          ) : (
            <p class="muted">Fewer than three people worked on it this month, so its usage is counted in "other" for everyone.{data.perPerson ? " Your own view below has it." : ""}</p>
          )}
        </div>
        <Estimate detail={detail} actual={t?.feature ? total(t.feature.tokens) : null} estimate={est} />
      </div>

      <section>
        <h2>By step</h2>
        {steps.length ? (
          <div class="scroll">
            <table id="cost-steps">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>People</th>
                  <th>Tokens</th>
                  <th>Estimate</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((r) => {
                  const e = data.estimate.steps[r.step];
                  const over = e && total(r.tokens) / 1e6 > e[1];
                  return (
                    <tr key={r.step} data-step={r.step}>
                      <td class="nw">
                        <code>{r.step}</code>
                      </td>
                      <td class="nw">{r.people}</td>
                      <td class="nw">{mtok(total(r.tokens))}</td>
                      <td class="nw">{e ? <span class={over ? "bad-text" : ""}>{`${e[0]}–${e[1]}M`}</span> : <span class="muted">none</span>}</td>
                      <td class="nw">{usd(r.cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="muted">No step of this feature had three people or more this month.</p>
        )}
        <p class="muted">Only steps that three people or more worked on are shown, so a total never shows one person. Estimates per step come from estimate_tokens_m in .hub/flow.yaml, set by the admin.</p>
      </section>

      {data.perPerson && (
        <section id="cost-people">
          <h2>Each person</h2>
          {people.length ? (
            <div class="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Step</th>
                    <th>Model</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p, k) => (
                    <tr key={k} data-person={p.user}>
                      <td class="nw">{personName(project, p.user)}</td>
                      <td class="nw">
                        <code>{p.step ?? "—"}</code>
                      </td>
                      <td class="nw">{p.model}</td>
                      <td class="nw">{mtok(total(p.tokens))}</td>
                      <td class="nw">{usd(p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p class="muted">Nothing to show: no usage of this feature this month, or this machine has no usage key (run your setup script).</p>
          )}
          <p class="note warn">Only the admin and the PM see this. It is decrypted on this machine with its key and never published.</p>
        </section>
      )}
      <p class="muted">API-equivalent cost at the list prices of {data.pricesAsOf}; on seats the work is not billed per token. The admin can change prices in .hub/config.yaml.</p>
    </div>
  );
}

function Estimate({ detail, actual, estimate }: { detail: FeatureDetail; actual: number | null; estimate: [number, number] | null }) {
  const { me } = useApp();
  const slug = detail.state.slug;
  const pm = me.roles.includes("pm");
  const [lo, setLo] = useState(String(estimate?.[0] ?? ""));
  const [hi, setHi] = useState(String(estimate?.[1] ?? ""));
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "estimate");
  const a = Number(lo);
  const b = Number(hi);
  const invalid =
    lo === "" || hi === "" || !(a >= 0 && b >= a) ? "Give the low and the high estimate in millions of tokens, low first" : estimate && a === estimate[0] && b === estimate[1] ? "Change the numbers to save a new estimate" : "";
  return (
    <div class="card" id="estimate">
      <h3>Estimate</h3>
      <p>
        {estimate ? `${estimate[0]}–${estimate[1]}M tokens` : "No estimate yet."}
        {estimate && actual !== null ? ` · used ${mtok(actual)}${actual / 1e6 > estimate[1] ? ", over the estimate" : ""}` : ""}
      </p>
      {pm ? (
        <div class="row">
          <input type="number" min="0" step="1" id="est-lo" value={lo} aria-label="Low estimate, millions of tokens" onInput={(e) => setLo(e.currentTarget.value)} />
          <span>to</span>
          <input type="number" min="0" step="1" id="est-hi" value={hi} aria-label="High estimate, millions of tokens" onInput={(e) => setHi(e.currentTarget.value)} />
          <span>M tokens</span>
          <button type="button" class="btn" id="est-save" disabled={!!invalid || busy || pending.some((p) => p.state === "pending")} onClick={() => void run("estimate", { slug, tokens_m: [a, b] })}>
            Save
          </button>
          {invalid && <span class="reason">{invalid}</span>}
        </div>
      ) : (
        <p class="reason">The PM sets the estimate.</p>
      )}
      {problem}
      <PendingList saves={pending} />
    </div>
  );
}
