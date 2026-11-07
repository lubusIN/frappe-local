// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import ConfirmationDialog from '../../../src/renderer/components/dialogs/ConfirmationDialog.vue';
import StatePanel from '../../../src/renderer/components/ui/StatePanel.vue';
import ErrorNotice from '../../../src/renderer/components/ui/ErrorNotice.vue';

enableAutoUnmount(afterEach);

const dialogProps = { open: true, title: 'Delete bench', message: 'This removes the bench.' };
const findButton = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === text);

describe('rendered accessibility and keyboard behavior', () => {
  it('renders a named dialog and allows explicit cancellation', async () => {
    const wrapper = mount(ConfirmationDialog, { props: dialogProps, attachTo: document.body });
    await flushPromises();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const title = document.getElementById(dialog.getAttribute('aria-labelledby'));
    expect(title?.textContent).toContain('Delete bench');
    findButton('Cancel').click();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('keeps the explicitly non-dismissible confirmation open on Escape', async () => {
    const wrapper = mount(ConfirmationDialog, { props: dialogProps, attachTo: document.body });
    await flushPromises();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flushPromises();
    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('requires the confirmation phrase before Enter or button confirmation', async () => {
    const wrapper = mount(ConfirmationDialog, {
      props: { ...dialogProps, confirmationPhrase: 'demo', typedValue: '' }, attachTo: document.body,
    });
    await flushPromises();
    const input = document.querySelector('input');
    expect(findButton('Confirm').disabled).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wrapper.emitted('confirm')).toBeUndefined();
    input.value = 'demo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(wrapper.emitted('update:typedValue')?.at(-1)).toEqual(['demo']);
    await wrapper.setProps({ typedValue: 'demo' });
    expect(findButton('Confirm').disabled).toBe(false);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('focuses a control when the confirmation opens', async () => {
    const wrapper = mount(ConfirmationDialog, { props: { ...dialogProps, open: false }, attachTo: document.body });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });

  it('updates loading announcements and emits the retry action', async () => {
    const wrapper = mount(StatePanel, { props: { kind: 'loading', title: 'Benches' } });
    expect(wrapper.attributes()).toMatchObject({ role: 'status', 'aria-live': 'polite', 'aria-busy': 'true', 'aria-label': 'Loading: Benches' });
    await wrapper.setProps({ kind: 'error', actionLabel: 'Retry' });
    expect(wrapper.attributes('aria-busy')).toBe('false');
    await wrapper.get('button[aria-label="Retry: retry this action"]').trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
  });

  it('renders an error alert with an actionable label', async () => {
    const wrapper = mount(ErrorNotice, { props: { notice: {
      title: 'Cannot start', reason: 'Runtime unavailable', steps: ['Start Podman'],
      actions: [{ id: 'retry', label: 'Retry' }],
    } } });
    expect(wrapper.attributes()).toMatchObject({ role: 'alert', 'aria-live': 'polite', 'aria-atomic': 'true' });
    expect(wrapper.text()).toContain('Runtime unavailable');
    await wrapper.get('button[aria-label="Retry: take action to resolve this error"]').trigger('click');
    expect(wrapper.emitted('action')).toEqual([['retry']]);
  });
});
