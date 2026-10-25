import '@fontsource-variable/inter'
import 'katex/dist/katex.min.css'
import './styles/theme.css'
import './styles/base.css'
import './styles/editor.css'
import './styles/docs.css'
import { mount } from 'svelte'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
