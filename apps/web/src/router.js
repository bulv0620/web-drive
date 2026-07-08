import { createRouter, createWebHashHistory } from "vue-router";
import { refreshApp, state } from "./store.js";
import LoginView from "./views/LoginView.vue";
import FilesView from "./views/FilesView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: { name: "files" } },
    { path: "/files/:drivePath(.*)*", name: "files", component: FilesView, meta: { requiresAuth: true } },
    { path: "/login", name: "login", component: LoginView },
    { path: "/:pathMatch(.*)*", redirect: { name: "files" } }
  ]
});

router.beforeEach(async (to) => {
  if (!state.ready) await refreshApp();
  if (to.meta.requiresAuth && !state.authed) return "/login";
  if (to.name === "login" && state.authed) return { name: "files" };
  return true;
});
