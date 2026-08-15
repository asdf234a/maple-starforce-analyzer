import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf-8');
const css = fs.readFileSync('style.css', 'utf-8');

const starforceData = fs.readFileSync('src/starforceData.js', 'utf-8')
  .replace(/export\s+/g, '');
const fftEngine = fs.readFileSync('src/fftEngine.js', 'utf-8')
  .replace(/export\s+/g, '');
const optimizer = fs.readFileSync('src/optimizer.js', 'utf-8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');
const markovEngine = fs.readFileSync('src/markovEngine.js', 'utf-8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');
const multiAnalyzer = fs.readFileSync('src/multiAnalyzer.js', 'utf-8')
  .replace(/import\s+[^;]+;/g, '')
  .replace(/export\s+/g, '');
const appJs = fs.readFileSync('src/app.js', 'utf-8')
  .replace(/import\s+[^;]+;/g, '');

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
console.log('Single standalone HTML created: maple-starforce-analyzer.html (size:', singleHtml.length, 'bytes)');
