import type { Biome, RunSummary } from './types';
import { BIOME_LABELS } from './types';

/** Renders a shareable score card to an offscreen canvas */
function renderCard(summary: RunSummary, characterName: string, characterEmoji: string): HTMLCanvasElement {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3d2410');
  bg.addColorStop(0.5, '#241509');
  bg.addColorStop(1, '#120b05');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // sun glow
  const sun = ctx.createRadialGradient(W * 0.78, H * 0.2, 20, W * 0.78, H * 0.2, 420);
  sun.addColorStop(0, 'rgba(255,170,60,0.5)');
  sun.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  // mountain silhouettes
  ctx.fillStyle = '#1a1008';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  ctx.lineTo(W * 0.18, H * 0.42);
  ctx.lineTo(W * 0.34, H * 0.58);
  ctx.lineTo(W * 0.55, H * 0.36);
  ctx.lineTo(W * 0.75, H * 0.56);
  ctx.lineTo(W * 0.9, H * 0.44);
  ctx.lineTo(W, H * 0.55);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // flag stripes
  const stripeH = 26;
  ctx.fillStyle = '#078930';
  ctx.fillRect(0, 0, W, stripeH);
  ctx.fillStyle = '#fcdd09';
  ctx.fillRect(0, stripeH, W, stripeH);
  ctx.fillStyle = '#da121a';
  ctx.fillRect(0, stripeH * 2, W, stripeH);

  // title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8c39e';
  ctx.font = '600 34px "Trebuchet MS", Georgia, sans-serif';
  ctx.fillText('C O F F E E   R U N N E R', W / 2, 170);
  ctx.fillStyle = 'rgba(232,195,158,0.6)';
  ctx.font = '500 24px "Trebuchet MS", Georgia, sans-serif';
  ctx.fillText('The Heart of Ethiopia', W / 2, 210);

  // character + score
  ctx.font = '120px serif';
  ctx.fillText(characterEmoji, W / 2, 380);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 30px "Trebuchet MS", Georgia, sans-serif';
  ctx.fillText(`${characterName.toUpperCase()}'S RUN`, W / 2, 450);

  ctx.fillStyle = '#ffd76a';
  ctx.font = '800 150px "Trebuchet MS", Georgia, sans-serif';
  ctx.fillText(summary.score.toLocaleString(), W / 2, 610);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 28px "Trebuchet MS", Georgia, sans-serif';
  ctx.fillText('SCORE', W / 2, 655);

  // stat row
  const biome = summary.biomesVisited.length
    ? BIOME_LABELS[summary.biomesVisited[summary.biomesVisited.length - 1] as Biome]
    : 'Coffee Highlands';
  const stats: [string, string][] = [
    [`${Math.floor(summary.distance)}m`, 'DISTANCE'],
    [`☕ ${summary.beans}`, 'BEANS'],
    [biome, 'REACHED'],
  ];
  const colW = W / 3;
  stats.forEach(([val, label], i) => {
    const x = colW * i + colW / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px "Trebuchet MS", Georgia, sans-serif';
    ctx.fillText(val, x, 780);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 22px "Trebuchet MS", Georgia, sans-serif';
    ctx.fillText(label, x, 815);
  });

  // footer
  ctx.fillStyle = 'rgba(232,195,158,0.55)';
  ctx.font = '600 26px "Trebuchet MS", Georgia, sans-serif';
  ctx.fillText('Can you beat my run? 🇪🇹', W / 2, 960);

  // border frame
  ctx.strokeStyle = 'rgba(232,195,158,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 100, W - 48, H - 140);

  return canvas;
}

export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareRun(
  summary: RunSummary,
  characterName: string,
  characterEmoji: string,
): Promise<ShareResult> {
  const biome = summary.biomesVisited.length
    ? BIOME_LABELS[summary.biomesVisited[summary.biomesVisited.length - 1] as Biome]
    : 'Coffee Highlands';
  const text = `I scored ${summary.score.toLocaleString()} pts and ran ${Math.floor(
    summary.distance,
  )}m through the ${biome} in Coffee Runner: The Heart of Ethiopia! ☕🇪🇹 Can you beat me?`;

  const canvas = renderCard(summary, characterName, characterEmoji);

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void>;
  };

  // try image share first
  try {
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (blob && nav.canShare && nav.share) {
      const file = new File([blob], 'coffee-runner-score.png', { type: 'image/png' });
      if (nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: 'Coffee Runner: The Heart of Ethiopia',
          text,
        });
        return 'shared';
      }
    }
  } catch {
    /* user cancelled or unsupported — fall through */
  }

  // text share fallback
  if (nav.share) {
    try {
      await nav.share({ title: 'Coffee Runner: The Heart of Ethiopia', text });
      return 'shared';
    } catch {
      /* cancelled */
    }
  }

  // clipboard fallback
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
