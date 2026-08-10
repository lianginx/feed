import '@/assets/css/main.css'
import '@/assets/css/highlight.css'
import 'vue-sonner/style.css'

import { createApp } from 'vue'
import App from '@/App.vue'
import { vHighlight } from '@/utils/highlight'

createApp(App).directive('highlight', vHighlight).mount('#app')
