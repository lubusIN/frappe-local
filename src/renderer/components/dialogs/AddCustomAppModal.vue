<template>
  <Dialog
    :model-value="true"
    title="Add Custom App"
    size="xl"
    @update:model-value="(val) => { if (!val) close() }"
  >
    <template #default>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-ink-gray-9">Source Type</label>
          <TabButtons
            v-model="appType"
            :options="[
              { label: 'GitHub', value: 'github', iconLeft: 'github' },
              { label: 'Local', value: 'local', iconLeft: 'lucide-folder' }
            ]"
          />
        </div>

        <div
          v-if="appType === 'github'"
          class="flex flex-col gap-1.5"
        >
          <FormControl
            v-model="source"
            type="text"
            label="GitHub Repository URL"
            placeholder="e.g. https://github.com/frappe/hrms"
            :disabled="isExtracting || isSaving"
            :error="error || undefined"
          />
          
          <div
            v-show="!(source && !isCheckingVisibility && isRepoPrivate && !shareSshKeysEnabled)"
            class="h-5 mt-0.5 flex items-center transition-all duration-200"
          >
            <p
              v-if="!source"
              class="text-xs text-ink-gray-5"
            >
              We'll fetch metadata from it.
            </p>
            <p
              v-else-if="isCheckingVisibility"
              class="text-xs text-ink-gray-5 animate-pulse"
            >
              Checking repository visibility...
            </p>
            <p
              v-else-if="!isRepoPrivate"
              class="text-xs text-ink-green-6 flex items-center gap-1"
            >
              <svg
                class="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Repository is accessible.
            </p>
            <p
              v-else-if="isRepoPrivate && shareSshKeysEnabled"
              class="text-xs text-ink-green-6 flex items-center gap-1"
            >
              <svg
                class="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Private repository ready (SSH enabled).
            </p>
          </div>
          
          <div
            v-if="source && !isCheckingVisibility && isRepoPrivate && !shareSshKeysEnabled"
            class="mt-1"
          >
            <Alert
              title="This repository appears to be private or unreachable. You must enable SSH key sharing below to install it."
              theme="yellow"
              :dismissible="false"
            />
          </div>
        </div>

        <div
          v-else
          class="flex flex-col gap-1.5"
        >
          <div class="flex gap-2 items-end">
            <FormControl
              v-model="source"
              type="text"
              label="Local Folder Path"
              placeholder="/Users/username/projects/my-app"
              :disabled="isExtracting || isSaving"
              class="flex-1"
            />
            <Button
              :disabled="isExtracting || isSaving"
              @click="pickFolder"
            >
              Browse
            </Button>
          </div>
          <ErrorMessage
            v-if="error"
            :message="error"
          />
        </div>
        
        <div
          v-if="appType === 'github'"
          class="flex flex-row items-center gap-4 border-t border-outline-gray-1 pt-3"
        >
          <Switch
            v-model="shareSshKeysEnabled"
            size="sm"
            @update:model-value="onToggleSshKeys"
          />
          <div class="flex flex-col">
            <span class="text-sm font-medium text-ink-gray-9">Share SSH Keys with Benches</span>
            <p class="text-xs text-ink-gray-5">
              Mounts your local ~/.ssh directory into benches to fetch private GitHub repos.
            </p>
          </div>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2 w-full">
        <Button
          variant="subtle"
          @click="close"
        >
          Cancel
        </Button>
        <Button
          variant="solid"
          :disabled="!isValid || isExtracting || isSaving"
          :loading="isExtracting || isSaving"
          @click="onConfirm"
        >
          Add App
        </Button>
      </div>
    </template>
  </Dialog>
  
  <ConfirmationDialog
    :open="showSshConfirmation"
    title="Restart Running Benches?"
    message="Changing SSH Key sharing requires a restart of all running benches to apply the new volume mounts. Are you sure you want to proceed?"
    confirm-label="Restart & Proceed"
    @confirm="onConfirmSshSave"
    @cancel="onCancelSshSave"
  />
</template>

<script setup lang="ts">
import { Alert, Button, Dialog, Switch, TabButtons, FormControl, ErrorMessage, debounce, toast } from 'frappe-ui';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import { computed, onMounted, ref, watch } from 'vue';
import type { CustomAppListItem, ExtractedCustomAppMetadata } from '@frappe-local/shared/core';
import { useSshKeys } from '@frappe-local/renderer/composables/system';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'added', app: CustomAppListItem): void;
}>();

const appType = ref<'github' | 'local'>('github');
const source = ref('');
const isExtracting = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);

const shareSshKeysEnabled = ref(false);
const isRepoPrivate = ref(false);
const isCheckingVisibility = ref(false);

onMounted(async () => {
  const settings = await window.frappeLocal?.getSettings();
  if (settings) {
    shareSshKeysEnabled.value = settings.shareSshKeys;
  }
});

const checkVisibility = debounce(async (url: string) => {
  if (!url || appType.value !== 'github') {
    isRepoPrivate.value = false;
    isCheckingVisibility.value = false;
    return;
  }
  isCheckingVisibility.value = true;
  try {
    const isPublic = await window.frappeLocal?.checkGithubRepoVisibility(url);
    if (source.value !== url) return;
    isRepoPrivate.value = !isPublic;
  } catch (err) {
    console.error('Failed to check repo visibility:', err);
    if (source.value !== url) return;
    // Assume private if check fails so they can still see the SSH option
    isRepoPrivate.value = true;
  } finally {
    if (source.value === url) {
      isCheckingVisibility.value = false;
    }
  }
}, 500);

watch(source, (newVal) => {
  if (newVal && appType.value === 'github') {
    isCheckingVisibility.value = true;
  } else {
    isCheckingVisibility.value = false;
    isRepoPrivate.value = false;
  }
  checkVisibility(newVal);
});

const { showSshConfirmation, pendingSshValue, handleSshToggle, performSshSave } = useSshKeys();

const onToggleSshKeys = async () => {
  const settings = await window.frappeLocal?.getSettings();
  if (settings && settings.shareSshKeys === shareSshKeysEnabled.value) {
    return; // Ignore if the value hasn't actually changed in the backend
  }
  await handleSshToggle(shareSshKeysEnabled.value);
};

const onConfirmSshSave = async () => {
  showSshConfirmation.value = false;
  await performSshSave(pendingSshValue.value, true);
};

const onCancelSshSave = () => {
  shareSshKeysEnabled.value = !shareSshKeysEnabled.value;
  showSshConfirmation.value = false;
};

const isValid = computed(() => {
  if (source.value.trim().length === 0) return false;
  if (appType.value === 'github') {
    if (isCheckingVisibility.value) return false;
    if (isRepoPrivate.value && !shareSshKeysEnabled.value) return false;
  }
  return true;
});

const close = () => {
  emit('close');
};

const pickFolder = async () => {
  const result = await window.frappeLocal?.pickBenchFolder();
  if (result) {
    source.value = result;
  }
};

watch(appType, () => {
  source.value = '';
  error.value = null;
});

const onConfirm = async () => {
  if (!isValid.value) return;

  error.value = null;
  let cleanSource = source.value.trim();

  if (appType.value === 'github') {
    cleanSource = cleanSource.replace(/\/+$/, '');
    
    if (isRepoPrivate.value) {
      if (cleanSource.startsWith('https://github.com/')) {
        cleanSource = `git@github.com:${cleanSource.substring('https://github.com/'.length)}`;
        if (!cleanSource.endsWith('.git')) cleanSource += '.git';
      }
    }
  }

  try {
    const existingApps = await window.frappeLocal?.listCustomApps();
    if (existingApps) {
      const isDuplicate = existingApps.some(app => {
        if (app.type === 'local' && appType.value === 'local') {
          return app.source.replace(/\/$/, '') === cleanSource.replace(/\/$/, '');
        }
        if (app.type === 'github' && appType.value === 'github') {
          const normalize = (s: string) => {
            return s.toLowerCase()
              .replace(/\/+$/, '')
              .replace(/\.git$/, '')
              .replace(/^https:\/\/github\.com\//, '')
              .replace(/^git@github\.com:/, '');
          };
          return normalize(app.source) === normalize(cleanSource);
        }
        return false;
      });

      if (isDuplicate) {
        error.value = 'An app with this source already exists.';
        return;
      }
    }
  } catch (err) {
    console.warn('Failed to check existing apps for duplicates:', err);
  }

  // For GitHub, if it's HTTPS, keep it for extraction, but we might want SSH later. 
  // Let's do extraction first.
  isExtracting.value = true;
  let metadata: ExtractedCustomAppMetadata;
  try {
    const res = await window.frappeLocal?.extractCustomApp(appType.value, cleanSource);
    if (!res) throw new Error('API not available or failed to extract app metadata');
    metadata = res;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to extract app metadata';
    isExtracting.value = false;
    return;
  }
  isExtracting.value = false;

  isSaving.value = true;
  try {
    const created = await window.frappeLocal?.createCustomApp({
      name: metadata.name,
      title: metadata.title,
      description: metadata.description || '',
      type: appType.value,
      source: cleanSource,
      branch: metadata.branch,
      icon: metadata.icon,
    });
    
    if (!created) throw new Error('API not available or failed to save app');

    toast.success(`App ${created.title || created.name} added successfully`);
    emit('added', created);
    close();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save app';
  } finally {
    isSaving.value = false;
  }
};
</script>
