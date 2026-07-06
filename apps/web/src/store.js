import { reactive } from "vue";
import { api } from "./api/client.js";

export const state = reactive({
  ready: false,
  authed: false,
  user: null,
  config: {}
});

export async function refreshApp() {
  const data = await api.app();
  state.ready = true;
  state.authed = Boolean(data.user);
  state.user = data.user || null;
  state.config = data.config || {};
  return data;
}

export function applyAuth(user) {
  state.authed = Boolean(user);
  state.user = user || null;
}
