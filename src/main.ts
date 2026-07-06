import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// Імпортуємо Toastification
import Toast, {type PluginOptions, POSITION } from "vue-toastification"
import "vue-toastification/dist/index.css"

const app = createApp(App)

// Налаштовуємо сповіщення
const toastOptions: PluginOptions = {
    position: POSITION.TOP_CENTER,
    timeout: 4000,
    closeOnClick: true,
    pauseOnFocusLoss: true,
    pauseOnHover: true,
}

app.use(Toast, toastOptions)
app.mount('#app')