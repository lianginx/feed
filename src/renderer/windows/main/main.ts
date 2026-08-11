import '@renderer/shared/assets/css/main.css'
import '@renderer/windows/main/assets/css/highlight.css'
import 'vue-sonner/style.css'

import { createApp } from 'vue'
import App from '@renderer/windows/main/App.vue'
import { vHighlight } from '@renderer/windows/main/utils/highlight'

createApp(App).directive('highlight', vHighlight).mount('#app')
