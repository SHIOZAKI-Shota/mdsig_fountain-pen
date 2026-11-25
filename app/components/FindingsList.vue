<script setup lang="ts">
import { computed } from "vue";
import { countByKind, scanBody, type FindingKind } from "../lib/findings.ts";
import { state, revealLine } from "../services/doc.ts";
import { tr, lang } from "../services/lang.ts";

const LABEL: Record<FindingKind, string> = {
  comment: "Hidden comments",
  removed: "Elements removed from the preview",
  html: "Raw HTML",
  chars: "Invisible or direction-changing characters",
  linkdef: "Link reference definitions (not shown)",
  link: "Links whose text differs from the destination",
  image: "External images (not loaded)",
};

const groups = computed(() => {
  void lang.value;
  return state.doc ? countByKind(scanBody(state.doc.text)) : [];
});
</script>

<template>
  <section v-if="groups.length" class="findings t-warn" aria-live="polite">
    <h3>⚠ {{ tr("Content that may not appear as written") }}</h3>
    <p class="note">{{ tr("These are part of what is signed, but the rendered document may hide or change them. Check them in the source before signing.") }}</p>
    <details v-for="[kind, list] in groups" :key="kind">
      <summary>{{ tr(LABEL[kind]) }} <b>{{ tr("{0} item(s)", list.length) }}</b></summary>
      <ul>
        <li v-for="(f, i) in list.slice(0, 50)" :key="i">
          <button type="button" class="link" @click="revealLine(f.line)">{{ tr("Line {0}", f.line) }}</button>
          <code>{{ f.text }}</code>
        </li>
        <li v-if="list.length > 50" class="more-items">{{ tr("and {0} more", list.length - 50) }}</li>
      </ul>
    </details>
  </section>
</template>
