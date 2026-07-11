<template>
  <span class="file-icon" :class="resolvedKind">
    <el-icon><component :is="resolvedIcon" /></el-icon>
  </span>
</template>

<script setup>
import { computed } from "vue";
import { fileIconFor, fileKind } from "../utils/file-icons.js";

const props = defineProps({
  item: {
    type: Object,
    default: () => ({})
  },
  kind: {
    type: String,
    default: ""
  }
});

const resolvedItem = computed(() => (props.kind ? { ...props.item, kind: props.kind } : props.item));
const resolvedKind = computed(() => props.kind || props.item.kind || fileKind(props.item));
const resolvedIcon = computed(() => fileIconFor(resolvedItem.value));
</script>
