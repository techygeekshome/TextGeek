'use strict';
const api = typeof browser !== 'undefined' ? browser : chrome;
const DEFAULTS = { autoCopy: true, keepLines: true };
const $ = (id) => document.getElementById(id);
(async () => {
  const o = Object.assign({}, DEFAULTS, await api.storage.local.get(DEFAULTS));
  for (const k of Object.keys(DEFAULTS)) {
    $(k).checked = !!o[k];
    $(k).addEventListener('change', async () => {
      await api.storage.local.set({ [k]: $(k).checked });
      $('saved').hidden = false; clearTimeout(window.__t); window.__t = setTimeout(() => { $('saved').hidden = true; }, 1500);
    });
  }
  try {
    const cmds = await api.commands.getAll();
    const c = cmds.find((x) => x.name === '_execute_action');
    $('key').textContent = (c && c.shortcut) || 'not set';
  } catch (e) { /* keep the default text */ }
  const ff = typeof browser !== 'undefined' && /Firefox\//.test(navigator.userAgent);
  if (ff) $('keypage').textContent = 'Add-ons and themes, then the cog menu, then Manage Extension Shortcuts';
  else {
    const a = document.createElement('a'); a.href = '#'; a.textContent = 'the extension shortcuts page';
    a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); };
    $('keypage').replaceWith(a);
  }
})();
