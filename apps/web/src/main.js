import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import App from "./App.vue";
import { onUnauthorized } from "./api/client.js";
import { router } from "./router.js";
import { applyAuth } from "./store.js";
import "./style.css";

let redirectingToLogin = false;

onUnauthorized(async () => {
  applyAuth(null);
  if (router.currentRoute.value.name === "login" || redirectingToLogin) return;
  redirectingToLogin = true;
  try {
    await router.replace("/login");
  } finally {
    redirectingToLogin = false;
  }
});

createApp(App).use(ElementPlus).use(router).mount("#app");
