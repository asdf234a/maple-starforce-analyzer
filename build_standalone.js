import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf-8');
const css = fs.readFileSync('style.css', 'utf-8');

function cleanJs(code) {
  return code
    .replace(/import\s+[^;]+;/g, '')
    .replace(/export\s+default\s+/g, '')
    .replace(/export\s+class\s+/g, 'class ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+let\s+/g, 'let ')
    .replace(/export\s+var\s+/g, 'var ')
    .replace(/export\s*\{[^}]*\};?/g, '');
}

const starforceData = cleanJs(fs.readFileSync('src/starforceData.js', 'utf-8'));
const fftEngine = cleanJs(fs.readFileSync('src/fftEngine.js', 'utf-8'));
const optimizer = cleanJs(fs.readFileSync('src/optimizer.js', 'utf-8'));
const markovEngine = cleanJs(fs.readFileSync('src/markovEngine.js', 'utf-8'));
const multiAnalyzer = cleanJs(fs.readFileSync('src/multiAnalyzer.js', 'utf-8'));
const appJs = cleanJs(fs.readFileSync('src/app.js', 'utf-8'));

const bundleJs = [
  starforceData,
  fftEngine,
  optimizer,
  markovEngine,
  multiAnalyzer,
  appJs
].join('\n\n');

let singleHtml = html
  .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', `<script>\n${bundleJs}\n</script>`);

fs.writeFileSync('maple-starforce-analyzer.html', singleHtml, 'utf-8');
fs.writeFileSync('index.html', singleHtml, 'utf-8');
console.log('Single standalone HTML created for BOTH index.html and maple-starforce-analyzer.html (size:', singleHtml.length, 'bytes)');
