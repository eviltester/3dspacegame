/** Shared score display and initials entry for the front menu and finished runs. */
import type { GameMode, ProfileSaveV2, RunState } from '../arcade';
import { finishedScore } from '../scores';
import { MODE_INFO } from '../modes';

export function highScoreTable(profile: ProfileSaveV2, mode: GameMode): string {
  const rows = profile.scoreboards[mode].map((entry, i) => `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${entry.initials ?? '---'}</td><td>${entry.score}</td><td>${entry.stage}</td><td>${entry.continued ? 'CONTINUED' : 'CLEAN'}</td></tr>`).join('');
  return `<table class="score-table" aria-label="${MODE_INFO[mode].name} high scores"><thead><tr><th scope="col">RANK</th><th scope="col">NAME</th><th scope="col">SCORE</th><th scope="col">${MODE_INFO[mode].unit}</th><th scope="col">RUN</th></tr></thead><tbody>${rows || '<tr><td colspan="5">NO FLIGHTS RECORDED YET</td></tr>'}</tbody></table>`;
}

// Initials belong to a qualifying finished run, never to each stage payout.
export function highScoreEntry(profile: ProfileSaveV2, run: RunState): string {
  const entry = finishedScore(profile, run);
  if (!entry) return '';
  if (entry.initials) return `<p class="score-saved" role="status">HIGH SCORE SAVED: ${entry.initials}</p>`;
  return `<form class="high-score-entry" data-submit-action="saveInitials" aria-label="High score initials">
    <h2>TOP TEN! ${entry.score.toLocaleString('en-GB')}</h2>
    <label for="scoreInitials">YOUR INITIALS</label>
    <div class="initials-controls"><input id="scoreInitials" name="initials" type="text" maxlength="3" minlength="3" pattern="[A-Za-z]{3}" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="AAA" aria-describedby="initialsHint">
    <button type="submit">SAVE</button></div><p id="initialsHint">THREE LETTERS / A-Z</p>
  </form>`;
}
