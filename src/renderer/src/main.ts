import { createApp } from 'vue'
import App from './App.vue'
import './assets/css/main.css'
import './assets/css/highlight.css'
import { vHighlight } from './utils/highlight'

const app = createApp(App)
app.directive('highlight', vHighlight)
app.mount('#app')
