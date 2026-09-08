// Vite loads this browser entry point. ArcadeGame creates the UI, renderer and
// input handlers, then owns the application's animation loop for this page.
import './style.css';
import './menus/front.css';
import { ArcadeGame } from './game';

new ArcadeGame();
