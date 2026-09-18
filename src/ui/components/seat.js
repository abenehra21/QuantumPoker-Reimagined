/**
 * ui/components/seat.js — a player at the table.
 *
 * Name, avatar, chips, current bet, status badges and whatever they are
 * saying. The seat is also where a bot's personality shows: the avatar
 * pulses while it thinks, and the speech bubble carries its voice.
 */
import { h, num } from '../dom.js';
import { attach } from '../tooltip.js';
import { avatarArt } from '../../render/art.js';

export function seatEl(player, opts = {}) {
  const accent = player.bot && player.bot.accent ? player.bot.accent : 'var(--cyan)';
  const el = h('div.seat', {
    dataset: { seat: player.seat },
    style: { '--seat-accent': accent }
  }, [
    h('div.avatar', { html: avatarArt(player.avatar || (player.bot ? player.bot.avatar : 'hero')) }),
    h('div.grow', [
      h('div.seat-name', { text: player.name }),
      h('div.seat-chips', { text: num(player.chips) }),
      h('div.seat-bet'),
      h('div.seat-status')
    ])
  ]);

  if (player.bot) {
    attach(el, {
      title: `${player.bot.name} — ${player.bot.title || ''}`,
      body: `<p>${player.bot.bio || ''}</p>`,
      hint: player.bot.tell,
      tone: accent
    });
  }
  if (opts.boss) el.classList.add('boss');
  return el;
}

export function updateSeat(el, player, game) {
  el.querySelector('.seat-chips').textContent = num(player.chips);
  const bet = el.querySelector('.seat-bet');
  bet.textContent = player.allIn ? 'ALL IN'
    : player.bet > 0 ? `bet ${num(player.bet)}`
    : player.folded ? 'folded' : '';

  el.classList.toggle('folded', player.folded && !player.out);
  el.classList.toggle('out', !!player.out);
  el.classList.toggle('acting', game && game.actor === player.seat && game.phase !== 'over');
  el.querySelector('.avatar').classList.toggle('thinking',
    !!(game && game.actor === player.seat && player.bot && game.phase !== 'over'));

  const statuses = el.querySelector('.seat-status');
  statuses.innerHTML = '';
  for (const s of player.status.display()) {
    const dot = h('div.status-dot', {
      style: { '--tone': s.def.tint },
      text: s.def.icon,
      title: `${s.def.name}: ${s.def.blurb}`
    });
    statuses.appendChild(dot);
  }
}

export function say(el, text, ms = 2600) {
  if (!text) return;
  const old = el.querySelector('.speech');
  if (old) old.remove();
  const bubble = h('div.speech', { text });
  el.appendChild(bubble);
  setTimeout(() => {
    bubble.style.transition = 'opacity 260ms';
    bubble.style.opacity = '0';
    setTimeout(() => bubble.remove(), 280);
  }, ms);
}

export function markWinner(el, on) {
  el.classList.toggle('winner', !!on);
}
