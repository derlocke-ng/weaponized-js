// Loadout's own settings: the home screen, on the settings view every app
// shares. Account, relays, backup, language and appearance are the site's.

import { app } from '../app.js';
import { t, tErr } from '../../../shared/i18n.js';
import { $, icon, toast } from '../ui.js';
import { h } from '../util.js';
import { STARTER_KEYS, starters } from './home.js';
import { settingsView } from '../../../shared/settingsview.js';

export function renderAccount(view) {
  const home = `
      <div class="card">
        <h2>${icon('list-checks')}${h(t('settings.home'))}</h2>
        <label class="check-row"><input type="checkbox" id="showStarters" ${app.settings?.get('showStarters', true) ?? true ? 'checked' : ''}><span>${h(t('settings.showStarters'))}</span></label>
        <details class="templates">
          <summary>${h(t('settings.starters'))}</summary>
          <p class="muted small">${h(t('settings.startersText'))}</p>
          <form class="form" id="startersForm">
            ${starters()
              .map(
                (st) => `
              <fieldset class="starter-edit" data-key="${st.key}">
                <legend>${h(t(`home.starter.${st.key}`))} · ${h(t(`type.${st.kind}`))}</legend>
                <label class="field">${h(t('settings.starterTitle'))}<input name="title-${st.key}" maxlength="120" value="${h(st.title)}"></label>
                <label class="field">${h(t('settings.starterText'))}<textarea name="text-${st.key}" rows="5" spellcheck="false">${h(st.text)}</textarea></label>
                <button type="button" class="link-btn" data-reset="${st.key}">${h(t('settings.reset'))}</button>
              </fieldset>`,
              )
              .join('')}
            <div class="form-actions"><button class="btn btn-primary">${h(t('common.save'))}</button></div>
          </form>
        </details>
      </div>`;
  view.innerHTML = settingsView({
    identity: app.identity,
    title: t('app.settings.title', { app: 'Loadout' }),
    backLabel: t('app.backToBoards'),
    cards: [home],
    how: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`account.how.${i}`)),
  });

  view.addEventListener('click', onClick);
  view.addEventListener('change', onChange);
  view.addEventListener('submit', onSubmit);

  function onClick(e) {
    const reset = e.target.closest('[data-reset]')?.dataset.reset;
    if (!reset) return;
    const form = $('#startersForm', view);
    form.elements[`title-${reset}`].value = t(`home.starter.${reset}`);
    form.elements[`text-${reset}`].value = t(`home.template.${reset}`);
  }

  function onChange(e) {
    if (e.target.id === 'showStarters') app.settings?.set({ showStarters: e.target.checked }).catch((err) => toast(tErr(err), 'error'));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (e.target.id !== 'startersForm') return;
    const form = e.target;
    const custom = {};
    for (const { key } of STARTER_KEYS) {
      const title = form.elements[`title-${key}`].value.trim();
      const text = form.elements[`text-${key}`].value;
      const o = {};
      if (title && title !== t(`home.starter.${key}`)) o.title = title.slice(0, 120);
      if (text !== t(`home.template.${key}`)) o.text = text.slice(0, 20_000);
      if (Object.keys(o).length) custom[key] = o;
    }
    try {
      await app.settings.set({ starters: custom });
      toast(t('settings.saved'), 'success');
    } catch (err) {
      toast(tErr(err), 'error');
    }
  }

  return () => {
    view.removeEventListener('click', onClick);
    view.removeEventListener('change', onChange);
    view.removeEventListener('submit', onSubmit);
  };
}
