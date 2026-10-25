import '@fontsource-variable/inter'
import 'katex/dist/katex.min.css'
import './styles/theme.css'
import './styles/base.css'
import './styles/editor.css'
import './styles/docs.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { app } from './lib/app.svelte'

// Handy for tests and debugging in `npm run dev`; not exposed in production builds.
if (import.meta.env.DEV) (window as unknown as { __omnia: typeof app }).__omnia = app

mount(App, { target: document.getElementById('app')! })
