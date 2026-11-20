// @env browser
import { createApp } from 'vue'
import App from './App.vue'
import { registerElementPlus } from './plugins/elementPlus'
import './style.css'
import './element-theme.css'
import './theme-command.css'

const app = createApp(App)
registerElementPlus(app)
app.mount('#app')
