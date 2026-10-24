<script lang="ts">
  import { app } from '../lib/app.svelte'
  import Modal from './Modal.svelte'

  const shortcuts: [string, string][] = [
    ['Ctrl O', 'Quick open or create a note'],
    ['Ctrl P', 'Command palette'],
    ['Alt N', 'New note'],
    ['Alt D', "Today's daily note"],
    ['Ctrl Shift F', 'Search all notes'],
    ['Alt ← / →', 'Back and forward'],
    ['Ctrl B / I / E', 'Bold, italic, inline code'],
    ['Ctrl K', 'Wrap selection as [[link]]'],
    ['Ctrl Enter', 'Toggle a task checkbox on the line'],
    ['Ctrl Shift C', 'Turn the selection into a cloze deletion'],
    ['Ctrl F', 'Find in note']
  ]
</script>

<Modal onclose={() => (app.modal = null)} width={720} label="Help">
  <div class="wrap">
    <h2>Help</h2>
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
        <p class="muted">Use <code>- [ ] </code> for checkboxes, <code>[[Note]]</code> for links, <code>#tag</code> for tags, <code>$E=mc^2$</code> for maths.</p>
      </section>
      <section>
        <h3>Shortcuts</h3>
        <dl>
          {#each shortcuts as [keys, what]}
            <dt>{#each keys.split(' ') as k}<kbd>{k}</kbd>{/each}</dt>
            <dd>{what}</dd>
          {/each}
        </dl>
      </section>
    </div>
    <div class="row"><span class="grow"></span><button class="btn primary" onclick={() => (app.modal = null)}>Close</button></div>
  </div>
</Modal>

<style>
  .wrap { padding: 24px 28px; display: grid; gap: 16px; }
  h2 { font-size: 28px; }
  h3 { font-size: 17px; margin-bottom: 8px; }
  .cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 28px; }
  @media (max-width: 700px) { .cols { grid-template-columns: 1fr; } }
  pre { background: var(--code-bg); padding: 10px 12px; border-radius: 8px; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.55; overflow: auto; margin: 0 0 10px; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; margin: 0; font-size: 13.5px; }
  dt { display: flex; gap: 3px; }
  dd { margin: 0; color: var(--text-muted); }
  p { font-size: 13.5px; line-height: 1.6; }
</style>
