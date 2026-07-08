<template>
  <main class="login-page">
    <el-card class="login-card" shadow="never">
      <template #header>
        <div class="login-brand">
          <img class="brand-icon" src="/icon.svg" alt="WebDrive" width="44" height="44" />
          <div>
            <h1>WebDrive</h1>
            <div class="subtitle">{{ t("login.subtitle") }}</div>
          </div>
        </div>
      </template>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="block-gap" />
      <el-form label-position="top" @submit.prevent="login">
        <el-form-item :label="t('login.username')">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item :label="t('login.password')">
          <el-input v-model="form.password" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-button type="primary" class="full-button" :loading="loading" @click="login">{{ t("login.signIn") }}</el-button>
      </el-form>
    </el-card>
  </main>
</template>

<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/client.js";
import { t, uiError } from "../i18n.js";
import { applyAuth } from "../store.js";

const router = useRouter();
const error = ref("");
const loading = ref(false);
const form = reactive({ username: "", password: "" });

async function login() {
  if (loading.value) return;
  error.value = "";
  loading.value = true;
  try {
    const data = await api.login(form);
    applyAuth(data.user);
    router.push("/");
  } catch (err) {
    error.value = uiError(err, "login.error");
  } finally {
    loading.value = false;
  }
}
</script>
