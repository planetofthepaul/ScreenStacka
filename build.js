#!/usr/bin/env node

/**
 * ScreenStacka — Comparison Page Generator
 * 
 * Generates static HTML comparison pages for every popular TV size combo.
 * Each page has:
 *   - Correct math (diagonal → width/height via 16:9 aspect ratio)
 *   - The visual overlay tool pre-loaded with both sizes
 *   - Unique content with room size recs, viewing distance
 *   - Cross-links to related comparisons and size guides
 *   - Amazon affiliate links for both sizes
 *   - Schema.org structured data
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// TV SIZE DATA
// ============================================================

const SIZES = [32, 40, 43, 50, 55, 65, 75, 85, 98];

// 16:9 aspect ratio — the standard for modern TVs
// diagonal² = width² + height²
// width = diagonal × 16 / √(16² + 9²) = diagonal × 16 / √337
// height = diagonal × 9 / √(16² + 9²) = diagonal × 9 / √337
const ASPECT_RATIO = { a: 16, b: 9 };
const HYPOTENUSE = Math.sqrt(ASPECT_RATIO.a ** 2 + ASPECT_RATIO.b ** 2); // √337 ≈ 18.3576

function getDimensions(diagonal) {
  const widthIn = diagonal * ASPECT_RATIO.a / HYPOTENUSE;
  const heightIn = diagonal * ASPECT_RATIO.b / HYPOTENUSE;
  const areaIn = widthIn * heightIn;
  return {
    diagonal,
    widthIn: Math.round(widthIn * 100) / 100,
    heightIn: Math.round(heightIn * 100) / 100,
    widthCm: Math.round(widthIn * 2.54 * 100) / 100,
    heightCm: Math.round(heightIn * 2.54 * 100) / 100,
    areaSqIn: Math.round(areaIn * 100) / 100,
    areaSqFt: Math.round((areaIn / 144) * 100) / 100,
  };
}

// Viewing distance recommendations (Society of Motion Picture and Television Engineers)
// SMPTE recommends a 30° viewing angle for general content
// THX recommends 36° for cinema-like experience
// Formula: distance = screen_width / (2 × tan(angle/2))
// We'll use a comfortable range: 1.5× to 2.5× the diagonal
function getViewingDistance(diagonal) {
  const minFt = Math.round((diagonal * 1.2 / 12) * 10) / 10;
  const maxFt = Math.round((diagonal * 2.0 / 12) * 10) / 10;
  const idealFt = Math.round((diagonal * 1.6 / 12) * 10) / 10;
  return { minFt, maxFt, idealFt };
}

// Room size recommendations based on viewing distance
function getRoomRec(diagonal) {
  if (diagonal <= 32) return { room: 'bedroom, dorm room, or kitchen', minRoom: 'small' };
  if (diagonal <= 43) return { room: 'bedroom, office, or small apartment living room', minRoom: 'small to medium' };
  if (diagonal <= 50) return { room: 'bedroom or medium-sized living room', minRoom: 'medium' };
  if (diagonal <= 55) return { room: 'medium to large living room', minRoom: 'medium' };
  if (diagonal <= 65) return { room: 'living room or family room', minRoom: 'medium to large' };
  if (diagonal <= 75) return { room: 'large living room or dedicated media room', minRoom: 'large' };
  if (diagonal <= 85) return { room: 'large living room, basement, or home theater', minRoom: 'large to very large' };
  return { room: 'dedicated home theater or very large open-concept living space', minRoom: 'very large' };
}

// Best use cases per size
function getUseCases(diagonal) {
  if (diagonal <= 32) return ['secondary TV for bedroom or kitchen', 'desktop monitor replacement', 'small apartment where space is tight'];
  if (diagonal <= 43) return ['bedroom or guest room', 'office or studio apartment', 'gaming at a desk or close range'];
  if (diagonal <= 50) return ['smaller living rooms or apartments', 'bedroom upgrade from a smaller set', 'casual viewing where you sit 6–8 feet away'];
  if (diagonal <= 55) return ['most living rooms with 7–9 feet of viewing distance', 'apartment living where 65″ feels too dominant', 'solid all-around choice for mixed use'];
  if (diagonal <= 65) return ['the most popular living room size in the US', 'great for sports, movies, and gaming from 8–10 feet', 'fits most rooms without overwhelming the wall'];
  if (diagonal <= 75) return ['large living rooms where you sit 10+ feet away', 'immersive movie and sports watching', 'open floor plans or rooms with high ceilings'];
  if (diagonal <= 85) return ['dedicated media rooms or home theaters', 'very large living rooms (12+ feet viewing distance)', 'replacing a projector setup with a brighter image'];
  return ['true home cinema experience', 'large, open-concept spaces or commercial settings', 'when you want the closest thing to a movie theater at home'];
}

// Amazon affiliate links by size (tag: screenstacka-20)
const AMAZON_LINKS = {
  32: 'https://www.amazon.com/s?k=32+inch+tv&s=review-rank&tag=screenstacka-20',
  40: 'https://www.amazon.com/s?k=40+inch+tv&s=review-rank&tag=screenstacka-20',
  43: 'https://www.amazon.com/s?k=43+inch+tv&s=review-rank&tag=screenstacka-20',
  50: 'https://www.amazon.com/s?k=50+inch+tv&s=review-rank&tag=screenstacka-20',
  55: 'https://www.amazon.com/s?k=55+inch+tv&s=review-rank&tag=screenstacka-20',
  65: 'https://www.amazon.com/s?k=65+inch+tv&s=review-rank&tag=screenstacka-20',
  75: 'https://www.amazon.com/s?k=75+inch+tv&s=review-rank&tag=screenstacka-20',
  85: 'https://www.amazon.com/s?k=85+inch+tv&s=review-rank&tag=screenstacka-20',
  98: 'https://www.amazon.com/s?k=98+inch+tv&s=review-rank&tag=screenstacka-20',
};

// ============================================================
// PRIORITY RANKING — which comparisons get built first
// ============================================================

// Ordered by estimated search volume
const PRIORITY_COMBOS = [
  [55, 65],
  [65, 75],
  [50, 55],
  [75, 85],
  [55, 75],
  [43, 50],
  [50, 65],
  [65, 85],
  [43, 55],
  [55, 85],
  [50, 75],
  [32, 43],
  [40, 43],
  [43, 65],
  [75, 98],
  [85, 98],
  [32, 40],
  [40, 50],
  [40, 55],
  [32, 50],
  [32, 55],
  [40, 65],
  [50, 85],
  [43, 75],
  [65, 98],
  [55, 98],
  [50, 98],
  [43, 85],
  [40, 75],
  [32, 65],
  [43, 98],
  [40, 85],
  [32, 75],
  [40, 98],
  [32, 85],
  [32, 98],
];

// ============================================================
// CONTENT GENERATION
// ============================================================

function generateComparisonContent(smallSize, largeSize) {
  const small = getDimensions(smallSize);
  const large = getDimensions(largeSize);
  const smallView = getViewingDistance(smallSize);
  const largeView = getViewingDistance(largeSize);
  const smallRoom = getRoomRec(smallSize);
  const largeRoom = getRoomRec(largeSize);
  const smallCases = getUseCases(smallSize);
  const largeCases = getUseCases(largeSize);

  const areaDiffPct = ((large.areaSqIn / small.areaSqIn) - 1) * 100;
  const widthDiffPct = ((large.widthIn / small.widthIn) - 1) * 100;
  const heightDiffPct = ((large.heightIn / small.heightIn) - 1) * 100;
  const areaDiffSqIn = large.areaSqIn - small.areaSqIn;
  const widthDiffIn = large.widthIn - small.widthIn;
  const heightDiffIn = large.heightIn - small.heightIn;

  const r = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;

  // Find related comparisons (share a size with this comparison)
  const related = PRIORITY_COMBOS
    .filter(([a, b]) => !(a === smallSize && b === largeSize))
    .filter(([a, b]) => a === smallSize || a === largeSize || b === smallSize || b === largeSize)
    .slice(0, 6);

  // Find adjacent size comparisons (stepping stones)
  const sizesInBetween = SIZES.filter(s => s > smallSize && s < largeSize);

  return {
    small, large,
    smallView, largeView,
    smallRoom, largeRoom,
    smallCases, largeCases,
    areaDiffPct: r(areaDiffPct),
    widthDiffPct: r(widthDiffPct),
    heightDiffPct: r(heightDiffPct),
    areaDiffSqIn: r2(areaDiffSqIn),
    widthDiffIn: r2(widthDiffIn),
    heightDiffIn: r2(heightDiffIn),
    related,
    sizesInBetween,
  };
}

function writeComparisonParagraphs(smallSize, largeSize, data) {
  const { small, large, areaDiffPct, widthDiffPct, heightDiffPct, 
          widthDiffIn, heightDiffIn, areaDiffSqIn,
          smallView, largeView, smallRoom, largeRoom,
          smallCases, largeCases, sizesInBetween } = data;

  let paragraphs = '';

  // Opening paragraph — the hook
  paragraphs += `<p>The jump from ${smallSize}" to ${largeSize}" is one of the most common TV upgrades people consider — and for good reason. The ${largeSize}-inch screen delivers <strong>${areaDiffPct}% more viewing area</strong> than the ${smallSize}-inch, which means you're getting significantly more screen for your money. In physical terms, the ${largeSize}" is ${r1(widthDiffIn)} inches wider and ${r1(heightDiffIn)} inches taller. That's not a subtle difference — it's immediately noticeable from across the room.</p>`;

  // Exact measurements
  paragraphs += `<h3>Exact Measurements</h3>`;
  paragraphs += `<p>The ${smallSize}-inch TV measures <strong>${small.widthIn}" wide × ${small.heightIn}" tall</strong> (${small.widthCm} × ${small.heightCm} cm), with a total screen area of ${small.areaSqIn} square inches. The ${largeSize}-inch TV measures <strong>${large.widthIn}" wide × ${large.heightIn}" tall</strong> (${large.widthCm} × ${large.heightCm} cm), with a total screen area of ${large.areaSqIn} square inches. That's a difference of ${r1(areaDiffSqIn)} square inches — roughly ${areaDiffPct}% more screen.</p>`;

  // Viewing distance
  paragraphs += `<h3>Recommended Viewing Distance</h3>`;
  paragraphs += `<p>For a ${smallSize}-inch TV, you'll want to sit between <strong>${smallView.minFt} and ${smallView.maxFt} feet</strong> away (ideal: about ${smallView.idealFt} feet). For the ${largeSize}-inch, the sweet spot is <strong>${largeView.minFt} to ${largeView.maxFt} feet</strong> (ideal: about ${largeView.idealFt} feet). If your couch is closer than ${largeView.minFt} feet to the wall, the ${largeSize}" might feel overwhelming — the ${smallSize}" could actually be the better pick for your space.</p>`;

  // Room size guidance
  paragraphs += `<h3>Room Size</h3>`;
  paragraphs += `<p>A ${smallSize}" TV works well in a ${smallRoom.room}. The ${largeSize}" is better suited for a ${largeRoom.room}. Measure your actual viewing distance before deciding — the "right" size is the one that fits your room, not the biggest one that fits your budget.</p>`;

  // When to choose each
  paragraphs += `<h3>When to Choose the ${smallSize}"</h3>`;
  paragraphs += `<ul>`;
  for (const c of smallCases) {
    paragraphs += `<li>${c.charAt(0).toUpperCase() + c.slice(1)}</li>`;
  }
  paragraphs += `<li>Your viewing distance is under ${smallView.maxFt} feet</li>`;
  paragraphs += `</ul>`;

  paragraphs += `<h3>When to Choose the ${largeSize}"</h3>`;
  paragraphs += `<ul>`;
  for (const c of largeCases) {
    paragraphs += `<li>${c.charAt(0).toUpperCase() + c.slice(1)}</li>`;
  }
  paragraphs += `<li>Your viewing distance is ${largeView.minFt} feet or more</li>`;
  paragraphs += `</ul>`;

  // In-between sizes note (if applicable)
  if (sizesInBetween.length > 0) {
    const betweenLinks = sizesInBetween.map(s => 
      `<a href="/compare/${smallSize}-vs-${s}/">${smallSize} vs ${s}"</a> or <a href="/compare/${s}-vs-${largeSize}/">${s} vs ${largeSize}"</a>`
    ).join(', ');
    paragraphs += `<h3>What About Sizes In Between?</h3>`;
    paragraphs += `<p>If ${largeSize}" feels like too big a jump, consider the ${sizesInBetween.join('" or the ')}" as a middle ground. See our comparisons: ${betweenLinks}.</p>`;
  }

  return paragraphs;
}

function r1(n) {
  return Math.round(n * 10) / 10;
}

// ============================================================
// HTML TEMPLATE
// ============================================================

function generateComparisonPage(smallSize, largeSize) {
  const data = generateComparisonContent(smallSize, largeSize);
  const content = writeComparisonParagraphs(smallSize, largeSize, data);
  const { small, large, related } = data;

  const title = `${smallSize} vs ${largeSize} Inch TV — Visual Size Comparison | ScreenStacka`;
  const description = `Compare ${smallSize}" vs ${largeSize}" TVs side by side. The ${largeSize}" is ${data.areaDiffPct}% larger by area. See the exact size difference with our visual overlay tool.`;
  const url = `https://screenstacka.com/compare/${smallSize}-vs-${largeSize}/`;

  // Schema.org structured data
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `${smallSize} vs ${largeSize} Inch TV Comparison`,
    "description": description,
    "url": url,
    "mainEntity": {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `How much bigger is a ${largeSize} inch TV than a ${smallSize} inch TV?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `A ${largeSize}-inch TV has ${data.areaDiffPct}% more screen area than a ${smallSize}-inch TV. The ${largeSize}" measures ${large.widthIn}" × ${large.heightIn}" compared to the ${smallSize}" at ${small.widthIn}" × ${small.heightIn}".`
          }
        },
        {
          "@type": "Question",
          "name": `What is the recommended viewing distance for a ${smallSize} vs ${largeSize} inch TV?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `For a ${smallSize}" TV, sit ${data.smallView.minFt}–${data.smallView.maxFt} feet away. For a ${largeSize}" TV, sit ${data.largeView.minFt}–${data.largeView.maxFt} feet away.`
          }
        }
      ]
    }
  };

  // Related comparisons links
  let relatedHTML = '';
  if (related.length > 0) {
    relatedHTML = `<div class="related-section">
      <h3>Related Comparisons</h3>
      <div class="related-grid">
        ${related.map(([a, b]) => `<a href="/compare/${a}-vs-${b}/" class="related-link">${a}" vs ${b}"</a>`).join('\n        ')}
      </div>
    </div>`;
  }

  // All comparisons for sitemap-style linking
  const allComparisonsHTML = PRIORITY_COMBOS
    .filter(([a, b]) => !(a === smallSize && b === largeSize))
    .slice(0, 12)
    .map(([a, b]) => `<a href="/compare/${a}-vs-${b}/">${a}" vs ${b}"</a>`)
    .join('\n          ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${url}" />
<meta property="og:title" content="${smallSize} vs ${largeSize} Inch TV — Size Comparison" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="ScreenStacka" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${smallSize} vs ${largeSize} Inch TV — Size Comparison" />
<meta name="twitter:description" content="${description}" />
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<style>
  :root{
    --bg:#09090b;
    --surface:#18181b;
    --panel:#27272a;
    --elevated:#3f3f46;
    --ink:#fafafa;
    --muted:#a1a1aa;
    --subtle:#52525b;
    --line:#3f3f46;
    --c1:#06b6d4;
    --c2:#8b5cf6;
    --focus:#3b82f6;
    --accent-from:#06b6d4;
    --accent-to:#8b5cf6;
    --success:#10b981;
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5);
  }
  @media (prefers-color-scheme: light){
    :root{ 
      --bg:#fafaf9;--surface:#ffffff;--panel:#f5f5f4;--elevated:#e7e5e4;
      --ink:#18181b;--muted:#71717a;--subtle:#a1a1aa;--line:#e4e4e7;
      --shadow-sm:0 1px 2px 0 rgb(0 0 0/.05);--shadow-md:0 4px 6px -1px rgb(0 0 0/.1),0 2px 4px -2px rgb(0 0 0/.1);
      --shadow-lg:0 10px 15px -3px rgb(0 0 0/.15),0 4px 6px -4px rgb(0 0 0/.1);
      --shadow-xl:0 20px 25px -5px rgb(0 0 0/.2),0 8px 10px -6px rgb(0 0 0/.15);
    }
  }
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{
    background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    font-size:16px;line-height:1.6;overflow-x:hidden;
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  }
  .wrap{max-width:1200px;margin:0 auto;padding:24px 20px 60px}
  header{display:flex;align-items:center;gap:20px;margin-bottom:40px;padding:20px 0;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:16px;text-decoration:none;color:inherit}
  .brand:hover .logo-text{opacity:0.8}
  .dot{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--accent-from),var(--accent-to));box-shadow:0 8px 24px rgba(6,182,212,0.3);position:relative;overflow:hidden}
  .dot::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent,rgba(255,255,255,0.15),transparent);animation:shimmer 3s infinite}
  @keyframes shimmer{0%{transform:translateX(-100%) translateY(-100%) rotate(45deg)}100%{transform:translateX(100%) translateY(100%) rotate(45deg)}}
  .logo-text{font-size:28px;font-weight:800;margin:0;letter-spacing:-0.02em;background:linear-gradient(135deg,var(--ink),var(--muted));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;transition:opacity 0.2s}
  .spacer{flex:1}
  .btn{appearance:none;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:12px 24px;border-radius:12px;cursor:pointer;font-weight:600;font-size:15px;transition:all 0.2s ease;box-shadow:var(--shadow-sm);letter-spacing:-0.01em;text-decoration:none;display:inline-block}
  .btn:hover{background:var(--panel);transform:translateY(-1px);box-shadow:var(--shadow-md)}

  /* Page hero */
  .page-hero{text-align:center;margin-bottom:48px}
  .page-hero h1{font-size:44px;font-weight:900;line-height:1.1;letter-spacing:-0.03em;margin:0 0 16px;background:linear-gradient(135deg,var(--ink) 0%,var(--muted) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
  .page-hero .subtitle{font-size:20px;color:var(--muted);max-width:700px;margin:0 auto;line-height:1.5;font-weight:500}

  /* Stats bar */
  .stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:48px}
  .stat-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;text-align:center;box-shadow:var(--shadow-md)}
  .stat-value{font-size:32px;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px}
  .stat-value.cyan{color:var(--c1)}
  .stat-value.purple{color:var(--c2)}
  .stat-value.green{color:var(--success)}
  .stat-label{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)}

  /* Card */
  .card{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow-lg);overflow:hidden;margin-bottom:40px}

  /* Canvas */
  .legend{display:flex;gap:12px;flex-wrap:wrap;padding:24px 32px;background:var(--panel);border-bottom:2px solid var(--line)}
  .pill{display:flex;align-items:center;gap:12px;padding:12px 20px;border:2px solid var(--line);border-radius:12px;color:var(--ink);background:var(--surface);font-weight:700;font-size:15px;box-shadow:var(--shadow-sm)}
  .sw{width:18px;height:18px;border-radius:5px;box-shadow:var(--shadow-sm)}
  .canvas{height:55vh;min-height:380px;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(0deg,var(--line),var(--line) 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,var(--line),var(--line) 1px,transparent 1px,transparent 24px);background-color:var(--bg);padding:20px}
  svg{width:100%;height:100%;filter:drop-shadow(var(--shadow-lg))}

  /* Content */
  .content-section{padding:40px;line-height:1.7}
  .content-section h3{font-size:22px;font-weight:800;margin:32px 0 12px;letter-spacing:-0.01em}
  .content-section h3:first-child{margin-top:0}
  .content-section p{color:var(--muted);margin:0 0 16px;font-size:16px}
  .content-section strong{color:var(--ink)}
  .content-section ul{color:var(--muted);padding-left:24px;margin:0 0 16px}
  .content-section li{margin-bottom:8px;font-size:16px}

  /* Affiliate links */
  .affiliate-section{padding:40px;border-top:2px solid var(--line)}
  .affiliate-section h3{font-size:22px;font-weight:800;margin:0 0 20px;letter-spacing:-0.01em}
  .affiliate-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .affiliate-card{padding:20px 24px;border:2px solid var(--line);border-radius:14px;background:var(--panel);transition:all 0.2s ease}
  .affiliate-card:hover{border-color:var(--c1);transform:translateY(-2px);box-shadow:var(--shadow-md)}
  .affiliate-card h4{margin:0 0 8px;font-size:17px;font-weight:700}
  .affiliate-card p{margin:0 0 12px;font-size:14px;color:var(--muted)}
  .affiliate-card a{color:var(--c1);font-weight:600;text-decoration:none;font-size:15px}
  .affiliate-card a:hover{text-decoration:underline}

  /* Related */
  .related-section{padding:40px;border-top:2px solid var(--line)}
  .related-section h3{font-size:22px;font-weight:800;margin:0 0 20px;letter-spacing:-0.01em}
  .related-grid{display:flex;gap:12px;flex-wrap:wrap}
  .related-link{display:inline-block;padding:12px 20px;border:2px solid var(--line);border-radius:12px;background:var(--panel);color:var(--c1);font-weight:600;font-size:15px;text-decoration:none;transition:all 0.2s ease}
  .related-link:hover{border-color:var(--c1);transform:translateY(-2px);box-shadow:var(--shadow-md);background:var(--surface)}

  /* All comparisons */
  .all-comparisons{padding:40px;border-top:2px solid var(--line)}
  .all-comparisons h3{font-size:22px;font-weight:800;margin:0 0 20px;letter-spacing:-0.01em}
  .all-comparisons-grid{display:flex;gap:10px;flex-wrap:wrap}
  .all-comparisons-grid a{display:inline-block;padding:10px 16px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--muted);font-weight:500;font-size:14px;text-decoration:none;transition:all 0.2s ease}
  .all-comparisons-grid a:hover{color:var(--c1);border-color:var(--c1)}

  /* CTA back */
  .back-cta{text-align:center;padding:48px 40px;border-top:2px solid var(--line);background:linear-gradient(135deg,var(--panel),var(--surface))}
  .back-cta p{color:var(--muted);margin:0 0 20px;font-size:17px}
  .back-cta .btn-primary{display:inline-flex;align-items:center;gap:12px;padding:16px 32px;background:linear-gradient(135deg,var(--accent-from),var(--accent-to));color:white;font-weight:700;font-size:17px;border-radius:14px;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(6,182,212,0.3);transition:all 0.3s ease;text-decoration:none}
  .back-cta .btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(6,182,212,0.4)}

  /* Affiliate disclosure */
  .affiliate-disclosure{margin-top:16px;padding:14px 18px;background:var(--bg);border:1px solid var(--line);border-radius:10px;font-size:13px;color:var(--muted);line-height:1.5}

  /* Footer */
  footer{padding:60px 20px 40px;border-top:1px solid var(--line);margin-top:60px}
  .footer-inner{max-width:800px;margin:0 auto;text-align:center}
  .footer-nav{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:24px}
  .footer-nav a{color:var(--muted);text-decoration:none;font-size:14px;font-weight:600;transition:color 0.2s}
  .footer-nav a:hover{color:var(--c1)}
  .footer-legal{color:var(--subtle);font-size:13px;line-height:1.6;margin:0}
  .footer-legal a{color:var(--subtle);text-decoration:underline;text-underline-offset:2px}
  .footer-legal a:hover{color:var(--muted)}
  .footer-brand{color:var(--muted);font-size:14px;margin:0 0 8px;font-weight:600}

  @media(max-width:768px){
    .wrap{padding:20px 16px 40px}
    header{margin-bottom:24px}
    .logo-text{font-size:22px}
    .dot{width:40px;height:40px}
    .page-hero h1{font-size:30px}
    .page-hero .subtitle{font-size:17px}
    .stats-bar{grid-template-columns:1fr 1fr}
    .stat-value{font-size:24px}
    .canvas{min-height:300px;height:45vh}
    .content-section,.affiliate-section,.related-section,.all-comparisons,.back-cta{padding:28px 24px}
    .affiliate-grid{grid-template-columns:1fr}
    .content-section h3{font-size:19px}
    .legend{padding:20px 24px}
  }
  @media(max-width:480px){
    .page-hero h1{font-size:26px}
    .stats-bar{grid-template-columns:1fr}
  }
</style>
<script async src="https://plausible.io/js/pa-ZA-JsU5X32A_4iYOvx-Qs.js"></script>
<script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>
</head>
<body>
  <div class="wrap">
    <header>
      <a href="/" class="brand">
        <div class="dot" aria-hidden="true"></div>
        <h2 class="logo-text">ScreenStacka</h2>
      </a>
      <div class="spacer"></div>
      <a href="/" class="btn">← Compare Any Sizes</a>
    </header>

    <section class="page-hero">
      <h1>${smallSize}" vs ${largeSize}" Inch TV<br/>Size Comparison</h1>
      <p class="subtitle">The ${largeSize}-inch TV is ${data.areaDiffPct}% larger by screen area. See the visual overlay and exact measurements below.</p>
    </section>

    <!-- Stats -->
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-value cyan">+${data.areaDiffPct}%</div>
        <div class="stat-label">More Screen Area</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">+${r1(data.widthDiffIn)}"</div>
        <div class="stat-label">Wider</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">+${r1(data.heightDiffIn)}"</div>
        <div class="stat-label">Taller</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">${large.areaSqIn} in²</div>
        <div class="stat-label">${largeSize}" Total Area</div>
      </div>
    </div>

    <!-- Visual overlay -->
    <section class="card" aria-label="Visual size comparison">
      <div class="legend">
        <div class="pill"><span class="sw" style="background:var(--c1)"></span>${smallSize}" TV</div>
        <div class="pill"><span class="sw" style="background:var(--c2)"></span>${largeSize}" TV</div>
      </div>
      <div class="canvas">
        <svg id="svg" viewBox="0 0 1000 650" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>
      </div>
    </section>

    <!-- Content -->
    <section class="card">
      <div class="content-section">
        ${content}
      </div>

      <!-- Affiliate -->
      <div class="affiliate-section">
        <h3>Shop Top-Rated TVs</h3>
        <div class="affiliate-grid">
          <div class="affiliate-card">
            <h4>Best ${smallSize}-Inch TVs</h4>
            <p>${small.widthIn}" × ${small.heightIn}" — ${small.areaSqIn} sq in</p>
            <a href="${AMAZON_LINKS[smallSize]}" target="_blank" rel="noopener">Browse ${smallSize}" TVs on Amazon →</a>
          </div>
          <div class="affiliate-card">
            <h4>Best ${largeSize}-Inch TVs</h4>
            <p>${large.widthIn}" × ${large.heightIn}" — ${large.areaSqIn} sq in</p>
            <a href="${AMAZON_LINKS[largeSize]}" target="_blank" rel="noopener">Browse ${largeSize}" TVs on Amazon →</a>
          </div>
        </div>
        <div class="affiliate-disclosure">As an Amazon Associate, ScreenStacka earns from qualifying purchases. This doesn't affect our recommendations or the price you pay.</div>
      </div>

      <!-- Related -->
      ${relatedHTML}

      <!-- All comparisons -->
      <div class="all-comparisons">
        <h3>All TV Size Comparisons</h3>
        <div class="all-comparisons-grid">
          ${allComparisonsHTML}
        </div>
      </div>

      <!-- CTA -->
      <div class="back-cta">
        <p>Want to compare custom sizes or different aspect ratios?</p>
        <a href="/" class="btn-primary">
          <span>Open Full Comparison Tool</span>
          <span>→</span>
        </a>
      </div>
    </section>

    <footer>
      <div class="footer-inner">
        <nav class="footer-nav">
          <a href="/">Compare Tool</a>
          <a href="/about/">About</a>
          <a href="/contact/">Contact</a>
          <a href="/privacy/">Privacy Policy</a>
          <a href="/terms/">Terms of Use</a>
        </nav>
        <p class="footer-brand">ScreenStacka — Make smarter TV buying decisions</p>
        <p class="footer-legal">© ${new Date().getFullYear()} ScreenStacka. All rights reserved. As an Amazon Associate we earn from qualifying purchases.</p>
      </div>
    </footer>
  </div>

<script>
(() => {
  // Pre-calculated dimensions for this comparison
  const SMALL_DIAG = ${smallSize};
  const LARGE_DIAG = ${largeSize};
  const AR_A = 16, AR_B = 9;
  const K = Math.sqrt(AR_A*AR_A + AR_B*AR_B);

  const smallW = SMALL_DIAG * AR_A / K;
  const smallH = SMALL_DIAG * AR_B / K;
  const largeW = LARGE_DIAG * AR_A / K;
  const largeH = LARGE_DIAG * AR_B / K;

  const svg = document.getElementById('svg');
  const maxW = Math.max(smallW, largeW);
  const maxH = Math.max(smallH, largeH);
  const pad = 30, vw = 1000 - pad*2, vh = 650 - pad*2;
  const scale = Math.min(vw/maxW, vh/maxH);

  [{w:smallW, h:smallH, color:'var(--c1)', opacity:0.2},
   {w:largeW, h:largeH, color:'var(--c2)', opacity:0.3}].forEach(o => {
    const w = o.w * scale, h = o.h * scale;
    const x = pad + (vw - w)/2, y = pad + (vh - h)/2;
    const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
    r.setAttribute("x", x); r.setAttribute("y", y);
    r.setAttribute("width", w); r.setAttribute("height", h);
    r.setAttribute("rx", 12);
    r.setAttribute("fill", o.color);
    r.setAttribute("fill-opacity", o.opacity);
    r.setAttribute("stroke", o.color);
    r.setAttribute("stroke-width", "3");
    svg.appendChild(r);
  });
})();
</script>
</body>
</html>`;

  return html;
}


// ============================================================
// BUILD
// ============================================================

const outputDir = path.join(__dirname, 'compare');

// Clean and recreate
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir, { recursive: true });

let pagesBuilt = 0;

for (const [small, large] of PRIORITY_COMBOS) {
  const dirName = `${small}-vs-${large}`;
  const pageDir = path.join(outputDir, dirName);
  fs.mkdirSync(pageDir, { recursive: true });

  const html = generateComparisonPage(small, large);
  fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf-8');
  pagesBuilt++;
}

console.log(`\n✅ Built ${pagesBuilt} comparison pages in ./compare/`);

// Print a summary
console.log('\nPages generated:');
for (const [small, large] of PRIORITY_COMBOS) {
  const data = generateComparisonContent(small, large);
  console.log(`  /compare/${small}-vs-${large}/  — ${data.areaDiffPct}% area diff`);
}

// Verify math on a known case: 55 vs 65
const test = generateComparisonContent(55, 65);
console.log('\n--- MATH VERIFICATION: 55 vs 65 ---');
console.log(`55": ${test.small.widthIn}" × ${test.small.heightIn}" = ${test.small.areaSqIn} sq in`);
console.log(`65": ${test.large.widthIn}" × ${test.large.heightIn}" = ${test.large.areaSqIn} sq in`);
console.log(`Area diff: ${test.areaDiffPct}%`);
console.log(`Width diff: ${test.widthDiffPct}% (+${test.widthDiffIn}")`);
console.log(`Height diff: ${test.heightDiffPct}% (+${test.heightDiffIn}")`);

// Double-check: 55" 16:9 should be ~47.94" × 26.96"
// width = 55 × 16 / √337 = 880 / 18.3576 = 47.937...
// height = 55 × 9 / √337 = 495 / 18.3576 = 26.965...
// area = 47.937 × 26.965 = 1292.86 sq in
console.log('\nExpected 55": ~47.94" × 26.96" = ~1292.85 sq in');
console.log('Expected 65": ~56.65" × 31.87" = ~1805.07 sq in');
console.log(`Expected area diff: ~39.6%`);
