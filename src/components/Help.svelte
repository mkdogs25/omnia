<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { ACTIONS } from '../lib/settings'
  import { comboFor, displayCombo } from '../lib/shortcuts'
  import Modal from './Modal.svelte'

  // App-wide shortcuts follow whatever you set in Settings; the editor's own keys are fixed.
  const appKeys = $derived(ACTIONS.map(a => [displayCombo(comboFor(a.id, app.settings.shortcuts)), a.label] as [string[], string]))
  const editorKeys: [string, string][] = [
    ['Ctrl B / I / E', 'Bold, italic, inline code'],
    ['Ctrl K', 'Wrap selection as [[link]]'],
    ['Ctrl Alt F', 'Insert a footnote (type text after [^1]: at the end)'],
    ['Ctrl Enter', 'Toggle a task checkbox on the line'],
    ['Ctrl Shift C', 'Turn the selection into a cloze deletion'],
    ['Ctrl F', 'Find in note'],
    ['Esc', 'Leave focus mode']
  ]
</script>

<Modal onclose={() => (app.modal = null)} width={720} label="Help">
  <div class="wrap">
    <h2 class="section-title">Help</h2>
    <div class="cols">
      <section>
        <h3>Flashcards and quizzes live in your notes</h3>
        <pre>Unit of force :: newton
Unit of power ::: watt          (two-way)

What is the speed of light?
?
3 × 10^8 m/s

The {'{{c1::photon}}'} carries light</pre>
        <p class="muted">Write a <code>quiz</code> fenced block for hand-made questions:</p>
        <pre>```quiz
Which is a vector?
- Speed
+ Velocity
- Mass
> Velocity has direction.
```</pre>
        <p class="muted">No typing needed: open the <em>Cards</em> or <em>Quiz</em> tab and press <em>Auto-generate</em>. Omnia suggests cards and questions from definitions (<code>**Term**: meaning</code>), <code>**bold**</code> or <code>==highlighted==</code> words, figures and lists. You choose what to keep.</p>
        <p class="muted">Anything you get wrong goes into the <em>Error log</em> on the Study page, and leaves it after two right answers in a row.</p>
        <p class="muted">Drop a <code>.pdf</code> or <code>.docx</code> onto the file list to read it. Select text to highlight it or choose <em>Quote to notes</em>; the quote is saved with a link back to its page, such as <code>[[Book.pdf#page=12|p. 12]]</code>. A scanned PDF with no selectable text offers <em>Run OCR</em>, and the result can be downloaded as a searchable PDF.</p>
        <p class="muted">Use <code>- [ ] </code> for checkboxes, <code>[[Note]]</code> for links, <code>#tag</code> for tags, <code>$E=mc^2$</code> for maths.</p>
      </section>
      <section>
        <h3>Shortcuts</h3>
        <dl>
          {#each appKeys as [keys, what]}
            <dt>{#each keys as k}<kbd>{k}</kbd>{/each}</dt>
            <dd>{what}</dd>
          {/each}
          {#each editorKeys as [keys, what]}
            <dt>{#each keys.split(' ') as k}<kbd>{k}</kbd>{/each}</dt>
            <dd>{what}</dd>
          {/each}
        </dl>
        <p class="muted">Change any of these under Settings → Keyboard shortcuts.</p>
      </section>
    </div>
    <div class="row"><span class="grow"></span><button class="btn primary" onclick={() => (app.modal = null)}>Close</button></div>
  </div>
</Modal>

<style>
  .wrap { padding: 24px 28px; display: grid; gap: 16px; }
  h3 { font-family: var(--font-body); font-size: var(--fs-md); font-weight: 600; margin-bottom: 8px; }
  .cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 28px; }
  @media (max-width: 700px) { .cols { grid-template-columns: 1fr; } }
  pre { background: var(--code-bg); padding: 10px 12px; border-radius: 8px; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.55; overflow: auto; margin: 0 0 10px; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; margin: 0 0 10px; font-size: 13.5px; }
  dt { display: flex; gap: 3px; }
  dd { margin: 0; color: var(--text-muted); }
  p { font-size: 13.5px; line-height: 1.6; }
</style>
