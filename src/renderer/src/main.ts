import '@renderer/assets/css/main.css'
import '@renderer/assets/css/highlight.css'
import 'vue-sonner/style.css'

import { createApp } from 'vue'
import App from '@renderer/App.vue'
import { vHighlight } from '@renderer/utils/highlight'

createApp(App).directive('highlight', vHighlight).mount('#app')
