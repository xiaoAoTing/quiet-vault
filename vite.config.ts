import { defineConfig, type Plugin } from 'vite';

function singleHtml(): Plugin {
  return {
    name: 'single-html',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') throw new Error('Missing built index.html');

      let document = typeof html.source === 'string' ? html.source : new TextDecoder().decode(html.source);
      const scriptTag = document.match(/<script\b([^>]*)\bsrc=["']([^"']+\.js)["']([^>]*)>\s*<\/script>/);
      if (!scriptTag) throw new Error('Missing built script tag');
      const scriptFile = scriptTag[2].split('/').pop()!;
      const chunk = Object.values(bundle).find(item => item.fileName.split('/').pop() === scriptFile);
      if (!chunk || chunk.type !== 'chunk') throw new Error(`Missing built script: ${scriptFile}`);
      const code = chunk.code.replace(new RegExp('</script', 'gi'), '<' + String.fromCharCode(92) + '/script');
      document = document.replace(scriptTag[0], `<script type="module">${code}</script>`);
      delete bundle[chunk.fileName];

      document = document.replace(/<link\b([^>]*\brel=["']stylesheet["'][^>]*)\bhref=["']([^"']+\.css)["']([^>]*)>/g, (_tag, before, url: string, after) => {
        const fileName = url.split('/').pop()!;
        const css = Object.values(bundle).find(item => item.fileName.split('/').pop() === fileName);
        if (!css || css.type !== 'asset') throw new Error(`Missing built stylesheet: ${fileName}`);
        const styles = typeof css.source === 'string' ? css.source : new TextDecoder().decode(css.source);
        delete bundle[css.fileName];
        return `<style>${styles}</style>`;
      });

      const scriptStart = document.indexOf('<script');
      const codeStart = document.indexOf('>', scriptStart) + 1;
      const codeEnd = document.lastIndexOf('</script>');
      if (scriptStart < 0 || codeStart <= 0 || codeEnd < codeStart) throw new Error('Could not locate bundled script contents');
      const safeCode = document.slice(codeStart, codeEnd).replace(new RegExp('</script', 'gi'), '<' + String.fromCharCode(92) + '/script');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(safeCode));
      const hash = `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
      document = `${document.slice(0, codeStart)}${safeCode}${document.slice(codeEnd)}`;
      document = document.replace(/(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^\"]+)("\s*\/?>)/, (_tag, start, policy: string, end) => {
        return `${start}${policy.replace(/script-src[^;]*/, `script-src 'self' ${hash} 'wasm-unsafe-eval'`)}${end}`;
      });

      html.source = document;
    },
  };
}

export default defineConfig({ esbuild: { jsx: 'automatic' }, plugins: [singleHtml()] });
