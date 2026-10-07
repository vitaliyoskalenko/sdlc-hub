// Command help: the dialog behind every "i" button.

import { Fragment } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { ASSISTANTS, COMMANDS, commandKey, hubCmd } from "./text.ts";
import { CopyButton, roleLabel, useApp } from "./ui.tsx";

export function CommandHelp({ text, close }: { text: string; close: () => void }) {
  const { me, assistant, features } = useApp();
  const key = commandKey(text);
  const ref = useRef<HTMLButtonElement>(null);
  // Move focus into the dialog before the page behind it becomes inert. Escape is handled by the app root.
  useLayoutEffect(() => {
    ref.current?.focus();
  }, [text]);
  if (!key) return null;
  const c = COMMANDS[key]!;
  const [word, ...args] = c.syntax.split(" ");
  const syntax = c.raw ? c.syntax : hubCmd(assistant, word!, args.join(" "));
  const slug = /\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/.exec(text.replace(/^\S+\s?/, ""))?.[1] ?? features[0]?.slug ?? "<slug>";
  const examples = c.raw ? [] : [...new Set(c.examples(slug).map((e) => hubCmd(assistant, word!, e)))];
  const elsewhere = c.raw ? [] : ASSISTANTS.filter(([a]) => a !== assistant).map(([a, n]) => [n, hubCmd(a, word!, args.join(" "))] as const);
  return (
    <div id="dlg" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
        <div class="sheet-top">
          <span class="k">Command help</span>
          <button type="button" class="btn sm" id="dlg-x" ref={ref} onClick={close}>
            Close ✕
          </button>
        </div>
        <div class="fhead">
          <h2 class="dlg-h" id="dlg-h">
            {c.title}
          </h2>
          <div class="cmd">
            <code>{text}</code>
            <CopyButton text={text} />
          </div>
          <p>{c.what}</p>
        </div>
        <div class="kv">
          <span class="k">Write it as</span>
          <span>
            <code>{syntax}</code>
          </span>
          {c.args.map(([a, d]) => (
            <Fragment key={a}>
              <span class="k">{a}</span>
              <span>{d}</span>
            </Fragment>
          ))}
          {elsewhere.length > 0 && (
            <>
              <span class="k">Elsewhere</span>
              <span>
                {elsewhere.map(([n, t], i) => (
                  <span key={n}>
                    {i ? " · " : ""}
                    {n}: <code>{t}</code>
                  </span>
                ))}
              </span>
            </>
          )}
          <span class="k">LLM</span>
          <span>{c.llm ? "Yes: the assistant does the work." : "No: it reads or records files only."}</span>
        </div>
        {examples.length > 0 && (
          <div class="dsec">
            <span class="k">Examples</span>
            {examples.map((e) => (
              <div class="cmd" key={e}>
                <code>{e}</code>
                <CopyButton text={e} />
              </div>
            ))}
          </div>
        )}
        <div class="dsec">
          <span class="k">Example of the output for {roleLabel(me)}</span>
          <pre class="out">{c.output(me.user, roleLabel(me), slug)}</pre>
          <p class="muted">An illustration: the hub plugin that prints it arrives in phase 2.</p>
        </div>
        <div class="dsec">
          <span class="k">What happens next</span>
          <p>{c.then}</p>
        </div>
      </div>
    </div>
  );
}
