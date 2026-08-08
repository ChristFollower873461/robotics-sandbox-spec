import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");

const socialCard = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="paper-grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M30 0H0V30" fill="none" stroke="#17231f" stroke-opacity=".055" stroke-width="1"/>
    </pattern>
    <pattern id="floor-grid" width="45" height="25" patternUnits="userSpaceOnUse" patternTransform="skewY(-29)">
      <path d="M45 0H0V25" fill="none" stroke="#9db1a9" stroke-opacity=".18" stroke-width="1"/>
    </pattern>
    <filter id="panel-shadow" x="-20%" y="-20%" width="150%" height="160%">
      <feDropShadow dx="0" dy="15" stdDeviation="18" flood-color="#0e1714" flood-opacity=".22"/>
    </filter>
    <filter id="small-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0e1714" flood-opacity=".28"/>
    </filter>
    <linearGradient id="wall-left" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#395047"/>
      <stop offset="1" stop-color="#263930"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#30453d"/>
      <stop offset="1" stop-color="#1c2a25"/>
    </linearGradient>
    <clipPath id="panel-clip"><rect x="603" y="42" width="549" height="546" rx="22"/></clipPath>
  </defs>

  <rect width="1200" height="630" fill="#efeee7"/>
  <rect width="1200" height="630" fill="url(#paper-grid)"/>
  <path d="M0 0h18v630H0z" fill="#ed7048"/>

  <!-- Product identity: the same three-joint mark used in the application masthead. -->
  <g transform="translate(53 45)">
    <rect width="48" height="48" rx="24" fill="#d9e8d8" stroke="#17231f" stroke-width="1.5"/>
    <path d="m16 33 9-11 8-10" fill="none" stroke="#17231f" stroke-linecap="round" stroke-width="2.5"/>
    <circle cx="16" cy="33" r="4" fill="#fffdf8" stroke="#17231f" stroke-width="2.5"/>
    <circle cx="25" cy="22" r="3.5" fill="#fffdf8" stroke="#17231f" stroke-width="2.5"/>
    <circle cx="33" cy="12" r="3.5" fill="#ed7048" stroke="#17231f" stroke-width="2.5"/>
  </g>
  <text x="117" y="61" fill="#0b6b5c" font-family="SFMono-Regular,Consolas,monospace" font-size="11" font-weight="700" letter-spacing="1.5">BASEMENT BOYS / OPEN LAB</text>
  <text x="117" y="88" fill="#17231f" font-family="Georgia,serif" font-size="24" font-weight="700">Robot Field Guide</text>

  <g transform="translate(53 154)">
    <text fill="#ed7048" font-family="SFMono-Regular,Consolas,monospace" font-size="11" font-weight="700" letter-spacing="1.45">ROBOT FIT STUDY / BROWSER-LOCAL</text>
    <text y="65" fill="#17231f" font-family="Avenir Next,Arial,sans-serif" font-size="50" font-weight="750" letter-spacing="-3">Show us your space.</text>
    <rect x="0" y="88" width="48" height="8" fill="#ed7048"/>
    <text x="64" y="125" fill="#17231f" font-family="Avenir Next,Arial,sans-serif" font-size="46" font-weight="750" letter-spacing="-2.8">See what might</text>
    <text y="178" fill="#17231f" font-family="Avenir Next,Arial,sans-serif" font-size="46" font-weight="750" letter-spacing="-2.8">work.</text>
    <text y="232" fill="#43504b" font-family="Avenir Next,Arial,sans-serif" font-size="17" font-weight="500">Add a photo + three measurements. Then screen a</text>
    <text y="257" fill="#43504b" font-family="Avenir Next,Arial,sans-serif" font-size="17" font-weight="500">source-backed robot candidate in a rough 3D draft.</text>
  </g>

  <g transform="translate(53 466)" font-family="SFMono-Regular,Consolas,monospace" font-size="9" font-weight="700" letter-spacing=".55">
    <g><rect width="159" height="36" rx="7" fill="#fffdf8" stroke="#b8beb5"/><circle cx="15" cy="18" r="4" fill="#0b6b5c"/><text x="27" y="21.5" fill="#17231f">PHOTO STAYS HERE</text></g>
    <g transform="translate(169)"><rect width="200" height="36" rx="7" fill="#fffdf8" stroke="#b8beb5"/><circle cx="15" cy="18" r="4" fill="#0b6b5c"/><text x="27" y="21.5" fill="#17231f">YOUR NUMBERS SET SCALE</text></g>
    <g transform="translate(379)"><rect width="157" height="36" rx="7" fill="#fffdf8" stroke="#b8beb5"/><circle cx="15" cy="18" r="4" fill="#0b6b5c"/><text x="27" y="21.5" fill="#17231f">LIMITS STAY VISIBLE</text></g>
  </g>
  <text x="53" y="570" fill="#69756f" font-family="SFMono-Regular,Consolas,monospace" font-size="10" font-weight="650" letter-spacing=".8">SCREENING, NOT CERTIFICATION  ·  GEOMETRY, NOT PHYSICS</text>

  <!-- Purpose-built view of the real product's measured 3D room, not a stock robot render. -->
  <g filter="url(#panel-shadow)">
    <rect x="603" y="42" width="549" height="546" rx="22" fill="#111a16" stroke="#17231f" stroke-width="2"/>
  </g>
  <g clip-path="url(#panel-clip)">
    <rect x="603" y="42" width="549" height="546" fill="#111a16"/>
    <rect x="603" y="42" width="549" height="73" fill="#0c1310"/>
    <circle cx="632" cy="70" r="5" fill="#ed7048"/>
    <text x="646" y="73" fill="#9eb6ac" font-family="SFMono-Regular,Consolas,monospace" font-size="9" font-weight="700" letter-spacing="1.1">YOUR SPACE / ROUGH 3D DRAFT</text>
    <text x="628" y="96" fill="#fffdf8" font-family="Avenir Next,Arial,sans-serif" font-size="17" font-weight="650">Measured workshop · source-backed robot</text>
    <rect x="1033" y="60" width="94" height="34" rx="8" fill="#f4f1e8"/>
    <text x="1055" y="81" fill="#17231f" font-family="SFMono-Regular,Consolas,monospace" font-size="9" font-weight="800">3D ROOM</text>

    <text x="628" y="142" fill="#77d5af" font-family="SFMono-Regular,Consolas,monospace" font-size="9" font-weight="800" letter-spacing="1.1">SAME SHARED GEOMETRY</text>
    <text x="628" y="158" fill="#80958c" font-family="SFMono-Regular,Consolas,monospace" font-size="7.5" font-weight="650" letter-spacing=".65">ROOM SCALE FROM YOUR INPUTS · NO INFERRED PHOTOGRAMMETRY</text>

    <!-- Isometric measured room -->
    <polygon points="670,435 873,543 1090,421 885,316" fill="url(#floor)" stroke="#849b91" stroke-width="1.5"/>
    <polygon points="670,236 885,130 885,316 670,435" fill="url(#wall-left)" stroke="#849b91" stroke-width="1.5" opacity=".92"/>
    <polygon points="885,130 1090,236 1090,421 885,316" fill="#23342d" stroke="#849b91" stroke-width="1.5" opacity=".82"/>
    <path d="M715 411 915 513M759 386 957 489M803 361 1001 464M847 338 1046 439M714 412 929 291M759 436 973 314M804 460 1018 338M849 484 1062 363" fill="none" stroke="#82968e" stroke-opacity=".22"/>

    <!-- Dimension guides correspond to the application's example workshop defaults. -->
    <g fill="none" stroke="#d5b84a" stroke-width="1.4">
      <path d="M650 435V236m-6 0h13m-13 199h13"/>
      <path d="M670 461 875 570m-210-114 8-9m198 128 8-9"/>
      <path d="M893 570 1110 448m-221 116 8 11m209-133 8 11"/>
    </g>
    <g fill="#e2c766" font-family="SFMono-Regular,Consolas,monospace" font-size="8" font-weight="800" letter-spacing=".5">
      <text x="633" y="346" transform="rotate(-90 633 346)">2,600 mm CLEAR HEIGHT</text>
      <text x="733" y="505" transform="rotate(28 733 505)">5,000 mm WIDTH</text>
      <text x="1007" y="517" transform="rotate(-29 1007 517)">4,000 mm DEPTH</text>
    </g>

    <!-- Measured bench and rack fixtures -->
    <g stroke="#ff835e" stroke-width="2">
      <polygon points="772,342 872,294 969,345 869,394" fill="#ed7048" fill-opacity=".24"/>
      <path d="M772 342v74m97-22v82m100-131v74" fill="none"/>
      <path d="M771 416 869 466 969 419" fill="none" stroke-opacity=".42"/>
    </g>
    <g stroke="#d7e3dd" stroke-width="1.4">
      <polygon points="995,286 1042,263 1084,285 1037,308" fill="#83958d"/>
      <path d="M995 286v116l42 22V308m47-23v116l-47 23" fill="#455b52" fill-opacity=".75"/>
    </g>
    <g font-family="SFMono-Regular,Consolas,monospace" font-size="7" font-weight="800" letter-spacing=".55">
      <text x="797" y="332" fill="#ffd0c2">WORK BENCH / MEASURED EDIT</text>
      <text x="998" y="277" fill="#d8e7df">RACK / ESTIMATED</text>
    </g>

    <!-- Source-shaped articulated-arm cue at the tested task point. -->
    <ellipse cx="837" cy="367" rx="28" ry="10" fill="#090f0d" opacity=".58"/>
    <rect x="822" y="327" width="31" height="40" rx="3" fill="#e7eee9" stroke="#17231f" stroke-width="2"/>
    <g fill="none" stroke="#e7eee9" stroke-linecap="round" stroke-linejoin="round" stroke-width="10" filter="url(#small-shadow)">
      <path d="M838 330 851 294 877 309 895 286"/>
    </g>
    <g fill="#0b6b5c" stroke="#fffdf8" stroke-width="2.5">
      <circle cx="838" cy="330" r="8"/><circle cx="851" cy="294" r="8"/><circle cx="877" cy="309" r="7"/>
    </g>
    <path d="m895 286 10-8m-10 8 11 3" fill="none" stroke="#fffdf8" stroke-linecap="round" stroke-width="4"/>
    <circle cx="910" cy="284" r="18" fill="none" stroke="#ed7048" stroke-dasharray="5 5" stroke-width="2"/>
    <circle cx="910" cy="284" r="5" fill="#ed7048"/>
    <path d="M910 306v45" stroke="#ed7048" stroke-dasharray="4 5" stroke-width="1.5"/>
    <text x="819" y="276" fill="#fffdf8" font-family="Georgia,serif" font-size="13" font-weight="700">WIDOWX 250S</text>
    <text x="887" y="260" fill="#ff9d7f" font-family="SFMono-Regular,Consolas,monospace" font-size="7" font-weight="800" letter-spacing=".5">TASK POINT</text>

    <!-- Transparent screening result instead of a fake success claim. -->
    <g transform="translate(628 520)">
      <rect width="280" height="42" rx="9" fill="#f4f1e8"/>
      <circle cx="20" cy="21" r="5" fill="#d5b84a"/>
      <text x="34" y="18" fill="#0b6b5c" font-family="SFMono-Regular,Consolas,monospace" font-size="7.5" font-weight="800" letter-spacing=".8">ROUGH GEOMETRY SCREEN</text>
      <text x="34" y="31" fill="#17231f" font-family="Avenir Next,Arial,sans-serif" font-size="10" font-weight="650">Reach and clearance stay visible.</text>
    </g>
    <text x="927" y="548" fill="#9eb6ac" font-family="SFMono-Regular,Consolas,monospace" font-size="7.5" font-weight="700" letter-spacing=".6">13 SOURCED ROBOT RECORDS</text>
  </g>
</svg>`;

const appIcon = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="40" fill="#17231f"/>
  <rect x="12" y="12" width="156" height="156" rx="32" fill="#d9e8d8"/>
  <path d="M53 126 85 88l29-39" fill="none" stroke="#17231f" stroke-linecap="round" stroke-width="13"/>
  <circle cx="53" cy="126" r="17" fill="#fffdf8" stroke="#17231f" stroke-width="10"/>
  <circle cx="85" cy="88" r="15" fill="#fffdf8" stroke="#17231f" stroke-width="10"/>
  <circle cx="114" cy="49" r="15" fill="#ed7048" stroke="#17231f" stroke-width="10"/>
</svg>`;

await fs.mkdir(publicDir, { recursive: true });

const socialPath = path.join(publicDir, "robot-field-guide-social.png");
const iconPath = path.join(publicDir, "apple-touch-icon.png");

await Promise.all([
  sharp(Buffer.from(socialCard))
    .png({ compressionLevel: 9, palette: true, quality: 95, colours: 192 })
    .toFile(socialPath),
  sharp(Buffer.from(appIcon))
    .png({ compressionLevel: 9, palette: true, quality: 100, colours: 64 })
    .toFile(iconPath),
]);

const metadata = await sharp(socialPath).metadata();
const { size } = await fs.stat(socialPath);
if (metadata.width !== 1200 || metadata.height !== 630 || metadata.format !== "png") {
  throw new Error(`Social card must be a 1200x630 PNG; got ${metadata.width}x${metadata.height} ${metadata.format}.`);
}
if (size >= 1_000_000) {
  throw new Error(`Social card must stay below 1 MB; got ${size} bytes.`);
}

console.log(`Generated ${path.relative(rootDir, socialPath)} (${size} bytes) and ${path.relative(rootDir, iconPath)}.`);
