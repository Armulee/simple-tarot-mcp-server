/**
 * Shared shell for the OAuth browser pages (consent, sign-in return leg,
 * errors), themed to match askingfate.com: the same cosmic background as the
 * main site (near-black indigo base, the three corner nebula gradients from
 * its globals.css, and ~90 randomly placed twinkling stars mirroring its
 * CosmicStars component), a glass card, and the AskingFate logo (served from
 * /assets/logo.png — the same asset as the main site).
 */

/** Random twinkling stars, generated per render like the main site's CosmicStars. */
function cosmicStars(count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    const size = Math.random() < 0.5 ? 1 : 2;
    const top = (2 + Math.random() * 95).toFixed(2);
    const left = (2 + Math.random() * 95).toFixed(2);
    const anim = 1 + Math.floor(Math.random() * 8);
    const duration = (3.2 + Math.random() * 2).toFixed(1);
    out += `<i style="width:${size}px;height:${size}px;top:${top}%;left:${left}%;animation:twinkle-${anim} ${duration}s ease-in-out infinite"></i>`;
  }
  return out;
}

export function pageShell(body: string, title = "AskingFate"): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    color: #f2eefb; overflow-x: hidden;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    /* Cosmic backdrop — same base + corner nebula gradients as askingfate.com */
    background-color: #050409;
    background-image:
      radial-gradient(60% 50% at 100% 0%, rgba(190, 80, 160, 0.16) 0%, rgba(190, 80, 160, 0) 70%),
      radial-gradient(60% 55% at 100% 100%, rgba(140, 110, 220, 0.13) 0%, rgba(140, 110, 220, 0) 70%),
      radial-gradient(70% 45% at 0% 100%, rgba(70, 90, 200, 0.10) 0%, rgba(70, 90, 200, 0) 70%);
    background-attachment: fixed;
    background-repeat: no-repeat;
  }
  .stars { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
  .stars i { position: absolute; display: block; background: #fff; border-radius: 50%; }
  @keyframes twinkle-1 { 0%, 100% { opacity: 0.1; } 25% { opacity: 0.4; } 50% { opacity: 0.2; } 75% { opacity: 0.5; } }
  @keyframes twinkle-2 { 0%, 100% { opacity: 0.05; } 30% { opacity: 0.3; } 60% { opacity: 0.15; } 90% { opacity: 0.4; } }
  @keyframes twinkle-3 { 0%, 100% { opacity: 0.2; } 20% { opacity: 0.3; } 40% { opacity: 0.5; } 80% { opacity: 0.1; } }
  @keyframes twinkle-4 { 0%, 100% { opacity: 0.3; } 15% { opacity: 0.5; } 35% { opacity: 0.8; } 55% { opacity: 0.1; } 75% { opacity: 0.9; } }
  @keyframes twinkle-5 { 0%, 100% { opacity: 0.2; } 10% { opacity: 0.7; } 45% { opacity: 0.3; } 70% { opacity: 1; } 85% { opacity: 0.4; } }
  @keyframes twinkle-6 { 0%, 100% { opacity: 0.5; } 25% { opacity: 0.2; } 50% { opacity: 0.9; } 75% { opacity: 0.3; } }
  @keyframes twinkle-7 { 0%, 100% { opacity: 0.1; } 40% { opacity: 0.8; } 60% { opacity: 0.4; } 80% { opacity: 0.6; } }
  @keyframes twinkle-8 { 0%, 100% { opacity: 0.3; } 20% { opacity: 0.9; } 50% { opacity: 0.1; } 70% { opacity: 0.7; } }
  @media (prefers-reduced-motion: reduce) {
    .stars i { animation: none !important; opacity: 0.35; }
  }
  .wrap { position: relative; z-index: 1; width: 100%; max-width: 460px; margin: 24px; }
  .halo {
    position: absolute; inset: -2px; border-radius: 34px; opacity: 0.35; filter: blur(14px);
    background: linear-gradient(135deg, rgba(124, 92, 214, 0.55), rgba(84, 58, 196, 0.15) 40%, rgba(158, 120, 255, 0.45));
  }
  main {
    position: relative; padding: 38px 32px 32px; border-radius: 32px;
    background: rgba(16, 12, 30, 0.82); backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.10);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  }
  .brand { display: flex; align-items: center; justify-content: center; gap: 18px; margin-bottom: 24px; }
  .brand img, .mono {
    width: 64px; height: 64px; border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), 0 8px 24px rgba(46, 32, 120, 0.55);
  }
  .dots { display: flex; gap: 6px; }
  .dots i { width: 5px; height: 5px; border-radius: 50%; background: #8f7cd9; }
  .dots i:first-child, .dots i:last-child { opacity: 0.35; }
  .mono {
    display: flex; align-items: center; justify-content: center;
    font-size: 1.6rem; font-weight: 700; color: #fff;
    background: linear-gradient(145deg, #6d4fd8, #35247e);
  }
  h1 { font-size: 1.5rem; margin: 0 0 8px; text-align: center; font-weight: 700; letter-spacing: 0.01em; }
  p { line-height: 1.6; }
  .sub { text-align: center; color: #b6a9e4; margin: 0 0 20px; font-size: 0.97rem; }
  .sub strong { color: #fff; }
  .account {
    width: fit-content; max-width: 100%; margin: 0 auto 22px; padding: 8px 18px;
    border-radius: 999px; background: rgba(124, 92, 214, 0.12);
    border: 1px solid rgba(124, 92, 214, 0.35); color: #cfc0f5;
    font-size: 0.88rem; overflow-wrap: anywhere;
  }
  .perms {
    list-style: none; margin: 0 0 26px; padding: 18px; display: grid; gap: 14px;
    border-radius: 18px; background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }
  .perms li { display: flex; gap: 12px; line-height: 1.55; font-size: 0.94rem; color: #e6def8; }
  .perms li::before {
    content: "✓"; flex: none; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(145deg, #7c5cd6, #54389f); color: #fff;
    font-size: 0.72rem; font-weight: 700;
  }
  .buttons { display: flex; gap: 12px; }
  button {
    flex: 1; padding: 14px 0; border-radius: 14px; border: none; cursor: pointer;
    font-size: 1rem; font-weight: 700; font-family: inherit;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }
  .allow {
    background: linear-gradient(135deg, #7c5cd6, #5438b8); color: #fff;
    box-shadow: 0 10px 30px rgba(104, 74, 214, 0.45);
  }
  .allow:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(104, 74, 214, 0.6); }
  .deny { background: transparent; color: #cfc3ef; border: 1px solid rgba(155, 130, 220, 0.4); }
  .deny:hover { background: rgba(155, 130, 220, 0.08); }
  .fineprint { margin: 18px 0 0; text-align: center; color: #7f72ab; font-size: 0.8rem; }
  .spinner {
    width: 34px; height: 34px; margin: 4px auto 18px; border-radius: 50%;
    border: 3px solid rgba(155, 130, 220, 0.25); border-top-color: #8f6ff0;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body><div class="stars">${cosmicStars(90)}</div><div class="wrap"><div class="halo"></div><main>${body}</main></div></body>
</html>`;
}
