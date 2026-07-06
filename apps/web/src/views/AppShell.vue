<template>
  <main class="page">
    <div class="topbar compact">
      <div class="title">
        <h1>{{ title }}</h1>
        <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
      </div>
      <el-dropdown trigger="click">
        <div class="avatar">{{ initial }}</div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :icon="SwitchButton" :disabled="loggingOut" @click="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <div class="content-surface">
      <slot />
    </div>
  </main>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { SwitchButton } from "@element-plus/icons-vue";
import { api } from "../api/client.js";
import { applyAuth, state } from "../store.js";

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" }
});

const router = useRouter();
const loggingOut = ref(false);
const initial = computed(() => (state.user?.username || "U").slice(0, 1).toUpperCase());

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await api.logout();
    applyAuth(null);
    router.push("/login");
  } catch (err) {
    ElMessage.error(err.message || "退出失败");
  } finally {
    loggingOut.value = false;
  }
}
</script>
