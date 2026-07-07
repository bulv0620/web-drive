<template>
  <main class="page">
    <div class="content-surface">
      <slot />
    </div>
  </main>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" }
});
</script>
