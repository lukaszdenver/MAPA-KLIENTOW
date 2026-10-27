// Preferencje użytkownika: powiadomienia e-mail o zmianach.
import { getPrefs, setNotify } from './db.js';

export async function mountPrefs(el) {
  el.innerHTML = '';
  el.classList.add('prefs');

  const label = document.createElement('label');
  label.className = 'check small';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.disabled = true;
  const text = document.createElement('span');
  text.textContent = 'Powiadomienia e-mail o zmianach';
  label.append(box, text);

  const msg = document.createElement('span');
  msg.className = 'prefs-msg small';
  msg.setAttribute('role', 'status');
  el.append(label, msg);

  try {
    const prefs = await getPrefs();
    box.checked = prefs.notify_changes;
    box.disabled = false;
  } catch (err) {
    msg.textContent = 'Ustawienia niedostępne';
    msg.title = err.message;
    return;
  }

  box.addEventListener('change', async () => {
    const wanted = box.checked;
    box.disabled = true;
    msg.textContent = '';
    msg.title = '';
    try {
      await setNotify(wanted);
    } catch (err) {
      box.checked = !wanted;
      msg.textContent = 'Nie zapisano';
      msg.title = err.message;
    } finally {
      box.disabled = false;
    }
  });
}
